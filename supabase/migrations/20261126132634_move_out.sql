-- Move-out settlement (#25), in one transaction:
--   1. Final meter reading → last electricity charge (via record_meter_reading, kind move_out).
--   2. Deductions (cleaning, aircon cleaning, missing items…) as `deduction` charges.
--   3. An unpaid part of the deposit is no longer owed: the deposit charge is reduced to
--      what was actually paid (void + re-add, allocations moved; nothing deleted).
--   4. Existing credit (unallocated payments) is applied first, oldest charges first.
--   5. The deposit held is applied as a payment with method `deposit`: deductions first,
--      then the oldest unpaid charges. What's left is the refund; if it isn't enough the
--      rest stays owed.
--   6. The settlement is recorded and the stay ends; the room becomes vacant. The tenant's
--      login stays active so they can still see (and pay) what's left.
-- Same split as settleMoveOut() in src/lib/billing/balances.ts, used for the preview.

create function public.move_out(
  p_tenancy_id uuid,
  p_date date,
  p_final_kwh integer,
  p_deductions jsonb,     -- [{"description": "Cleaning", "amount_centavos": 50000}]
  p_notes text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_tenancy public.tenancies;
  v_reading jsonb;
  d jsonb;
  dep record;
  al record;
  pay record;
  ch record;
  v_new_charge uuid;
  v_deductions bigint := 0;
  v_held bigint;
  v_owed bigint;
  v_apply bigint;
  v_left bigint;
  v_take bigint;
  v_deposit_payment uuid;
  v_to_deductions bigint := 0;
  v_settlement uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can move tenants out' using errcode = 'insufficient_privilege';
  end if;
  select * into v_tenancy from public.tenancies where id = p_tenancy_id for update;
  if not found or v_tenancy.status <> 'active' then
    raise exception 'This stay is not active' using errcode = 'check_violation';
  end if;
  if p_date < v_tenancy.start_date then
    raise exception 'Move-out date is before the move-in date' using errcode = 'check_violation';
  end if;

  -- 1. Final reading and bill.
  if p_final_kwh is not null then
    v_reading := public.record_meter_reading(p_tenancy_id, p_date, p_final_kwh);
    update public.meter_readings set kind = 'move_out' where id = (v_reading ->> 'reading_id')::uuid;
  end if;

  -- 2. Deductions.
  for d in select * from jsonb_array_elements(coalesce(p_deductions, '[]'::jsonb)) loop
    if length(trim(coalesce(d ->> 'description', ''))) = 0 or (d ->> 'amount_centavos')::bigint <= 0 then
      raise exception 'Each deduction needs a description and an amount' using errcode = 'check_violation';
    end if;
    insert into public.charges (tenancy_id, type, description, due_date, amount_centavos, created_by)
    values (p_tenancy_id, 'deduction', trim(d ->> 'description'), p_date, (d ->> 'amount_centavos')::bigint, v_admin);
    v_deductions := v_deductions + (d ->> 'amount_centavos')::bigint;
  end loop;

  -- 3. Deposit charges: only what was paid is real.
  for dep in
    select c.id, c.amount_centavos, cb.paid_centavos
    from public.charges c join public.charge_balances cb on cb.charge_id = c.id
    where c.tenancy_id = p_tenancy_id and c.type = 'deposit' and c.voided_at is null and cb.owed_centavos > 0
  loop
    v_new_charge := null;
    if dep.paid_centavos > 0 then
      insert into public.charges (tenancy_id, type, description, due_date, amount_centavos, created_by)
      select tenancy_id, 'deposit', 'Deposit (paid part)', due_date, dep.paid_centavos, v_admin
      from public.charges where id = dep.id
      returning id into v_new_charge;
    end if;
    for al in select * from public.payment_allocations where charge_id = dep.id and voided_at is null loop
      update public.payment_allocations
      set voided_at = now(), void_reason = 'Deposit reduced to the amount paid at move-out', voided_by = v_admin
      where id = al.id;
      if v_new_charge is not null then
        insert into public.payment_allocations (payment_id, charge_id, amount_centavos, created_by)
        values (al.payment_id, v_new_charge, al.amount_centavos, v_admin);
      end if;
    end loop;
    update public.charges
    set voided_at = now(), void_reason = 'Unpaid part of the deposit is not owed at move-out', voided_by = v_admin
    where id = dep.id;
  end loop;

  -- Deposit held = paid towards (live) deposit charges.
  select coalesce(sum(cb.paid_centavos), 0) into v_held
  from public.charge_balances cb
  where cb.tenancy_id = p_tenancy_id and cb.type = 'deposit' and cb.status <> 'void';

  -- 4. Existing credit first: unallocated money of confirmed payments, oldest charges first.
  for pay in
    select p.id, p.amount_centavos - coalesce((
             select sum(a.amount_centavos) from public.payment_allocations a
             where a.payment_id = p.id and a.voided_at is null), 0) as free
    from public.payments p
    where p.tenancy_id = p_tenancy_id and p.status = 'confirmed' and p.voided_at is null
    order by p.paid_on, p.created_at
  loop
    continue when pay.free <= 0;
    v_left := pay.free;
    for ch in
      select cb.charge_id, cb.owed_centavos from public.charge_balances cb
      where cb.tenancy_id = p_tenancy_id and cb.owed_centavos > 0 and cb.type <> 'deposit'
      order by cb.due_date, cb.type
    loop
      exit when v_left = 0;
      v_take := least(v_left, ch.owed_centavos);
      insert into public.payment_allocations (payment_id, charge_id, amount_centavos, created_by)
      values (pay.id, ch.charge_id, v_take, v_admin);
      v_left := v_left - v_take;
    end loop;
  end loop;

  -- 5. Apply the deposit: deductions first, then oldest.
  select coalesce(sum(cb.owed_centavos), 0) into v_owed
  from public.charge_balances cb
  where cb.tenancy_id = p_tenancy_id and cb.type <> 'deposit';
  v_apply := least(v_held, v_owed);

  if v_apply > 0 then
    insert into public.payments (tenancy_id, paid_on, amount_centavos, method, notes, status,
                                 submitted_by, reviewed_by, reviewed_at)
    values (p_tenancy_id, p_date, v_apply, 'deposit', 'Deposit applied at move-out', 'confirmed',
            v_admin, v_admin, now())
    returning id into v_deposit_payment;

    v_left := v_apply;
    for ch in
      select cb.charge_id, cb.owed_centavos, cb.type from public.charge_balances cb
      where cb.tenancy_id = p_tenancy_id and cb.owed_centavos > 0 and cb.type <> 'deposit'
      order by (cb.type = 'deduction') desc, cb.due_date, cb.type
    loop
      exit when v_left = 0;
      v_take := least(v_left, ch.owed_centavos);
      insert into public.payment_allocations (payment_id, charge_id, amount_centavos, created_by)
      values (v_deposit_payment, ch.charge_id, v_take, v_admin);
      if ch.type = 'deduction' then
        v_to_deductions := v_to_deductions + v_take;
      end if;
      v_left := v_left - v_take;
    end loop;
  end if;

  -- 6. Record and end the stay.
  insert into public.move_out_settlements (tenancy_id, settled_on, deposit_held_centavos, deductions_centavos,
                                           applied_to_balance_centavos, refund_centavos,
                                           remaining_owed_centavos, notes, created_by)
  values (p_tenancy_id, p_date, v_held, v_to_deductions, v_apply - v_to_deductions, v_held - v_apply,
          v_owed - v_apply, nullif(trim(p_notes), ''), v_admin)
  returning id into v_settlement;

  update public.tenancies set status = 'ended', end_date = p_date where id = p_tenancy_id;

  return v_settlement;
end;
$$;

revoke execute on function public.move_out from public, anon;
grant execute on function public.move_out to authenticated;
