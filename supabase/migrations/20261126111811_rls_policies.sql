-- Row-level security. See docs/database-design.md → Security.
--
--   * Admins read and write everything (audit_log: read only; it is written by triggers).
--   * Tenants read only their own rows. They can insert a payment only as
--     pending_review for their own stay. They can't add readings or charges.
--   * anon gets nothing: every policy is for the authenticated role.
--
-- RLS was already enabled on every table in the init migration.

-- ---------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER so they can read profiles/tenants without
-- going through RLS (which would recurse), with an empty search_path.
-- ---------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- The tenant record linked to the signed-in user, if any.
create function public.my_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.tenants t where t.profile_id = auth.uid();
$$;

-- Every stay (current and past) of the signed-in tenant.
create function public.my_tenancy_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ty.id
  from public.tenancies ty
  join public.tenants t on t.id = ty.tenant_id
  where t.profile_id = auth.uid();
$$;

-- Tenants can't update their own profile (they could change their role), so the
-- first-login password change clears the flag through this function instead.
create function public.mark_password_changed()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.my_tenant_id() from public, anon;
revoke execute on function public.my_tenancy_ids() from public, anon;
revoke execute on function public.mark_password_changed() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_tenant_id() to authenticated;
grant execute on function public.my_tenancy_ids() to authenticated;
grant execute on function public.mark_password_changed() to authenticated;

-- ---------------------------------------------------------------------------
-- Admins: full access to every table (audit_log is read-only below).
-- `(select ...)` makes Postgres evaluate the function once per query, not per row.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'tenants', 'rooms', 'tenancies', 'tenancy_occupants', 'electricity_rates',
    'meter_readings', 'charges', 'payments', 'payment_allocations', 'receipts',
    'move_out_settlements', 'notifications', 'push_subscriptions', 'app_settings'
  ]
  loop
    execute format(
      'create policy "admins: full access" on public.%I for all to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))',
      t
    );
  end loop;
end;
$$;

create policy "admins: read" on public.audit_log
  for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Tenants: read their own rows.
-- ---------------------------------------------------------------------------

create policy "users: read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "tenants: read own tenant record" on public.tenants
  for select to authenticated using (profile_id = (select auth.uid()));

create policy "tenants: read own stays" on public.tenancies
  for select to authenticated using (id in (select public.my_tenancy_ids()));

create policy "tenants: read rooms of own stays" on public.rooms
  for select to authenticated using (
    id in (select ty.room_id from public.tenancies ty where ty.id in (select public.my_tenancy_ids()))
  );

create policy "tenants: read own occupants" on public.tenancy_occupants
  for select to authenticated using (tenancy_id in (select public.my_tenancy_ids()));

-- Rates are the same for every room and are shown in the bill computation.
create policy "signed-in users: read rates" on public.electricity_rates
  for select to authenticated using (true);

create policy "tenants: read own readings" on public.meter_readings
  for select to authenticated using (tenancy_id in (select public.my_tenancy_ids()));

create policy "tenants: read own charges" on public.charges
  for select to authenticated using (tenancy_id in (select public.my_tenancy_ids()));

create policy "tenants: read own payments" on public.payments
  for select to authenticated using (tenancy_id in (select public.my_tenancy_ids()));

create policy "tenants: read own allocations" on public.payment_allocations
  for select to authenticated using (
    payment_id in (select p.id from public.payments p where p.tenancy_id in (select public.my_tenancy_ids()))
  );

create policy "tenants: read own receipts" on public.receipts
  for select to authenticated using (
    payment_id in (select p.id from public.payments p where p.tenancy_id in (select public.my_tenancy_ids()))
  );

create policy "tenants: read own move-out settlement" on public.move_out_settlements
  for select to authenticated using (tenancy_id in (select public.my_tenancy_ids()));

create policy "users: read own notifications" on public.notifications
  for select to authenticated using (profile_id = (select auth.uid()));

-- GCash name/number/QR are needed to pay.
create policy "signed-in users: read settings" on public.app_settings
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Tenants: the few things they may write.
-- ---------------------------------------------------------------------------

-- Submit a GCash/bank payment for review. Admins confirm or reject it.
create policy "tenants: submit payment for review" on public.payments
  for insert to authenticated with check (
    tenancy_id in (select public.my_tenancy_ids())
    and status = 'pending_review'
    and method in ('gcash', 'bank')
    and submitted_by = (select auth.uid())
    and reviewed_by is null
    and reviewed_at is null
    and voided_at is null
  );

-- Mark own notifications as read. Only read_at may change (column grant below).
create policy "users: mark own notifications read" on public.notifications
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "users: manage own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Nobody writes the audit log directly; the triggers run as SECURITY DEFINER.
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage. Private buckets; files live under "<tenancy_id>/...".
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('meter-photos', 'meter-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('payment-proofs', 'payment-proofs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  ('receipts', 'receipts', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy "admins: full access to app files" on storage.objects
  for all to authenticated
  using (bucket_id in ('meter-photos', 'payment-proofs', 'receipts') and (select public.is_admin()))
  with check (bucket_id in ('meter-photos', 'payment-proofs', 'receipts') and (select public.is_admin()));

create policy "tenants: read own app files" on storage.objects
  for select to authenticated using (
    bucket_id in ('meter-photos', 'payment-proofs', 'receipts')
    and (storage.foldername(name))[1] in (select id::text from public.my_tenancy_ids() as id)
  );

create policy "tenants: upload own payment proofs" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] in (select id::text from public.my_tenancy_ids() as id)
  );
