-- Pay with GCash (#23): tenants submit, admins confirm or reject.
--
--   Tenant inserts a payment as pending_review (RLS already allows only that), optionally
--   naming the bill it is for (for_charge_id) → admins are notified.
--   confirm_payment(): allocate + confirm → the receipt is issued by the existing trigger,
--   and the tenant is notified. reject_payment(): status rejected with a reason → tenant
--   is notified. Rows are never deleted.

alter table public.payments add column for_charge_id uuid references public.charges (id);

-- Tenants may only point a payment at one of their own bills.
drop policy "tenants: submit payment for review" on public.payments;
create policy "tenants: submit payment for review" on public.payments
  for insert to authenticated with check (
    tenancy_id in (select public.my_tenancy_ids())
    and status = 'pending_review'
    and method in ('gcash', 'bank')
    and submitted_by = (select auth.uid())
    and reviewed_by is null
    and reviewed_at is null
    and review_note is null
    and voided_at is null
    and (for_charge_id is null
         or for_charge_id in (select c.id from public.charges c where c.tenancy_id = payments.tenancy_id))
  );

-- ---------------------------------------------------------------------------
-- Notify admins when a tenant submits a payment. SECURITY DEFINER: the tenant can't
-- insert notifications for other people themselves.
-- ---------------------------------------------------------------------------

create function public.notify_payment_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room smallint;
begin
  if new.status <> 'pending_review' then
    return new;
  end if;
  select r.number into v_room
  from public.tenancies t join public.rooms r on r.id = t.room_id
  where t.id = new.tenancy_id;

  insert into public.notifications (profile_id, type, title, body, link, dedupe_key)
  select p.id, 'payment_to_review', 'Payment to review',
         'Room ' || v_room || ': ₱' || to_char(new.amount_centavos / 100.0, 'FM999,999,990.00')
           || ' by ' || case new.method when 'gcash' then 'GCash' else 'bank' end
           || coalesce(' (ref. ' || new.reference_no || ')', '') || '.',
         '/admin/payments/review', 'payment-review:' || new.id || ':' || p.id
  from public.profiles p
  where p.role = 'admin'
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

create trigger payments_notify_submitted
  after insert on public.payments
  for each row execute function public.notify_payment_submitted();

-- ---------------------------------------------------------------------------
-- Review
-- ---------------------------------------------------------------------------

create function public.confirm_payment(p_payment_id uuid, p_allocations jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_payment public.payments;
  a jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can confirm payments' using errcode = 'insufficient_privilege';
  end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'pending_review' or v_payment.voided_at is not null then
    raise exception 'This payment is not waiting for review' using errcode = 'check_violation';
  end if;

  update public.payments
  set status = 'confirmed', reviewed_by = v_admin, reviewed_at = now()
  where id = p_payment_id;

  for a in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    insert into public.payment_allocations (payment_id, charge_id, amount_centavos, created_by)
    values (p_payment_id, (a ->> 'charge_id')::uuid, (a ->> 'amount_centavos')::bigint, v_admin);
  end loop;

  insert into public.notifications (profile_id, type, title, body, link, dedupe_key)
  select tn.profile_id, 'payment_confirmed', 'Payment received',
         'Your GCash payment of ₱' || to_char(v_payment.amount_centavos / 100.0, 'FM999,999,990.00')
           || ' was confirmed. Your receipt is ready.',
         '/portal/payments', 'payment-confirmed:' || p_payment_id
  from public.tenancies t join public.tenants tn on tn.id = t.tenant_id
  where t.id = v_payment.tenancy_id and tn.profile_id is not null
  on conflict (dedupe_key) do nothing;
end;
$$;

create function public.reject_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_payment public.payments;
begin
  if not public.is_admin() then
    raise exception 'Only admins can reject payments' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required' using errcode = 'check_violation';
  end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'pending_review' or v_payment.voided_at is not null then
    raise exception 'This payment is not waiting for review' using errcode = 'check_violation';
  end if;

  update public.payments
  set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(), review_note = trim(p_reason)
  where id = p_payment_id;

  insert into public.notifications (profile_id, type, title, body, link, dedupe_key)
  select tn.profile_id, 'payment_rejected', 'Payment not accepted',
         'Your GCash payment of ₱' || to_char(v_payment.amount_centavos / 100.0, 'FM999,999,990.00')
           || ' was not accepted: ' || trim(p_reason),
         '/portal/payments', 'payment-rejected:' || p_payment_id
  from public.tenancies t join public.tenants tn on tn.id = t.tenant_id
  where t.id = v_payment.tenancy_id and tn.profile_id is not null
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke execute on function public.confirm_payment from public, anon;
revoke execute on function public.reject_payment from public, anon;
grant execute on function public.confirm_payment to authenticated;
grant execute on function public.reject_payment to authenticated;
