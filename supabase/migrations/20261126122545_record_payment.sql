-- Recording and voiding payments (#16). Admins only.
--
-- record_payment(): one confirmed payment plus its allocations, in one transaction.
--   The allocation trigger already rejects cross-stay allocations and over-allocation;
--   whatever isn't allocated stays as credit on the stay.
-- void_payment(): voids the allocations first (so the money goes back to owed), then the
--   payment. Rows are never deleted. Every change lands in audit_log via the triggers.

alter table public.payments add column notes text;

create function public.record_payment(
  p_tenancy_id uuid,
  p_paid_on date,
  p_amount_centavos bigint,
  p_method public.payment_method,
  p_reference_no text,
  p_proof_path text,
  p_notes text,
  p_allocations jsonb          -- [{"charge_id": "...", "amount_centavos": 123}]
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_payment_id uuid;
  v_proof text := nullif(trim(p_proof_path), '');
  a jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can record payments' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.tenancies where id = p_tenancy_id) then
    raise exception 'Unknown stay' using errcode = 'no_data_found';
  end if;
  if p_method = 'deposit' then
    raise exception 'Deposit is applied at move-out, not recorded as a payment'
      using errcode = 'check_violation';
  end if;
  if v_proof is not null and v_proof not like p_tenancy_id::text || '/%' then
    raise exception 'Proof must be stored under this stay''s folder' using errcode = 'check_violation';
  end if;

  insert into public.payments (tenancy_id, paid_on, amount_centavos, method, reference_no, proof_path,
                               notes, status, submitted_by, reviewed_by, reviewed_at)
  values (p_tenancy_id, p_paid_on, p_amount_centavos, p_method, nullif(trim(p_reference_no), ''),
          v_proof, nullif(trim(p_notes), ''), 'confirmed', v_admin, v_admin, now())
  returning id into v_payment_id;

  for a in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    insert into public.payment_allocations (payment_id, charge_id, amount_centavos, created_by)
    values (v_payment_id, (a ->> 'charge_id')::uuid, (a ->> 'amount_centavos')::bigint, v_admin);
  end loop;

  return v_payment_id;
end;
$$;

create function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_payment public.payments;
begin
  if not public.is_admin() then
    raise exception 'Only admins can void payments' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required to void a payment' using errcode = 'check_violation';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Unknown payment' using errcode = 'no_data_found';
  end if;
  if v_payment.voided_at is not null then
    raise exception 'This payment is already void' using errcode = 'check_violation';
  end if;

  update public.payment_allocations
  set voided_at = now(), void_reason = trim(p_reason), voided_by = v_admin
  where payment_id = p_payment_id and voided_at is null;

  update public.payments
  set voided_at = now(), void_reason = trim(p_reason), voided_by = v_admin
  where id = p_payment_id;

  update public.receipts
  set voided_at = now(), void_reason = trim(p_reason), voided_by = v_admin
  where payment_id = p_payment_id and voided_at is null;
end;
$$;

revoke execute on function public.record_payment from public, anon;
revoke execute on function public.void_payment from public, anon;
grant execute on function public.record_payment to authenticated;
grant execute on function public.void_payment to authenticated;
