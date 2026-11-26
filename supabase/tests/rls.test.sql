-- Row-level security tests. Run with: npm run db:test (npx supabase test db)
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres, so RLS doesn't apply). Made-up people only.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@test.local'),
  ('a0000000-0000-0000-0000-00000000000a', 'tenant-a@test.local'),
  ('a0000000-0000-0000-0000-00000000000b', 'tenant-b@test.local');

insert into public.profiles (id, role, username, display_name, must_change_password) values
  ('a0000000-0000-0000-0000-000000000001', 'admin', 'admin', 'Admin', false),
  ('a0000000-0000-0000-0000-00000000000a', 'tenant', 'room1-alpha-0001', 'Alpha', true),
  ('a0000000-0000-0000-0000-00000000000b', 'tenant', 'room2-bravo-0002', 'Bravo', true);

insert into public.rooms (id, number, base_rent_centavos) values
  ('b0000000-0000-0000-0000-000000000001', 1, 350000),
  ('b0000000-0000-0000-0000-000000000002', 2, 350000);

insert into public.tenants (id, first_name, last_name, phone_1, profile_id) values
  ('c0000000-0000-0000-0000-00000000000a', 'Alpha', 'Test', '0900', 'a0000000-0000-0000-0000-00000000000a'),
  ('c0000000-0000-0000-0000-00000000000b', 'Bravo', 'Test', '0900', 'a0000000-0000-0000-0000-00000000000b');

insert into public.tenancies (id, room_id, tenant_id, start_date, due_day, monthly_rent_centavos, starting_kwh) values
  ('d0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', '2026-01-05', 5, 350000, 100),
  ('d0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000b', '2026-01-10', 10, 350000, 200);

insert into public.charges (tenancy_id, type, description, period_start, due_date, amount_centavos) values
  ('d0000000-0000-0000-0000-00000000000a', 'rent', 'Rent', '2026-02-05', '2026-02-05', 350000),
  ('d0000000-0000-0000-0000-00000000000b', 'rent', 'Rent', '2026-02-10', '2026-02-10', 350000),
  ('d0000000-0000-0000-0000-00000000000b', 'custom', 'Key', '2026-02-10', '2026-02-10', 5000);

insert into public.meter_readings (tenancy_id, reading_date, reading_kwh, kind) values
  ('d0000000-0000-0000-0000-00000000000a', '2026-01-05', 100, 'move_in'),
  ('d0000000-0000-0000-0000-00000000000b', '2026-01-10', 200, 'move_in');

insert into public.payments (id, tenancy_id, paid_on, amount_centavos, method, status, submitted_by) values
  ('e0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000b', '2026-02-10', 100000, 'gcash', 'pending_review', 'a0000000-0000-0000-0000-00000000000b');

insert into public.notifications (id, profile_id, type, title) values
  ('f0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'reminder', 'Rent due');

insert into storage.objects (bucket_id, name) values
  ('meter-photos', 'd0000000-0000-0000-0000-00000000000a/jan.jpg'),
  ('meter-photos', 'd0000000-0000-0000-0000-00000000000b/jan.jpg');

-- Impersonate a signed-in user (or anon when uid is null).
create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tenant A: sees only their own rows
-- ---------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-00000000000a');

select is((select count(*) from public.profiles), 1::bigint, 'tenant sees only own profile');
select is((select count(*) from public.tenants), 1::bigint, 'tenant sees only own tenant record');
select is((select count(*) from public.tenancies), 1::bigint, 'tenant sees only own stay');
select is((select count(*) from public.rooms), 1::bigint, 'tenant sees only the room of own stay');
select is((select count(*) from public.charges), 1::bigint, 'tenant A cannot see tenant B''s charges');
select is((select count(*) from public.charge_balances), 1::bigint, 'charge_balances view respects RLS');
select is((select count(*) from public.meter_readings), 1::bigint, 'tenant sees only own readings');
select is((select count(*) from public.payments), 0::bigint, 'tenant A cannot see tenant B''s payment');
select is((select count(*) from public.audit_log), 0::bigint, 'tenant cannot read the audit log');
select is((select count(*) from storage.objects where bucket_id = 'meter-photos'), 1::bigint,
  'tenant sees only own meter photos');

-- Writes
select throws_ok(
  $$insert into public.meter_readings (tenancy_id, reading_date, reading_kwh)
    values ('d0000000-0000-0000-0000-00000000000a', '2026-02-05', 150)$$,
  '42501', null, 'tenant cannot add a reading');
select throws_ok(
  $$insert into public.charges (tenancy_id, type, description, due_date, amount_centavos)
    values ('d0000000-0000-0000-0000-00000000000a', 'custom', 'x', '2026-02-05', 1)$$,
  '42501', null, 'tenant cannot add a charge');
select lives_ok(
  $$insert into public.payments (id, tenancy_id, paid_on, amount_centavos, method, status, submitted_by)
    values ('e0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000a', '2026-02-05',
            350000, 'gcash', 'pending_review', 'a0000000-0000-0000-0000-00000000000a')$$,
  'tenant can submit a GCash payment for review');
select throws_ok(
  $$insert into public.payments (tenancy_id, paid_on, amount_centavos, method, status, submitted_by)
    values ('d0000000-0000-0000-0000-00000000000a', '2026-02-05', 350000, 'gcash', 'confirmed',
            'a0000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'tenant cannot insert a confirmed payment');
select throws_ok(
  $$insert into public.payments (tenancy_id, paid_on, amount_centavos, method, status, submitted_by)
    values ('d0000000-0000-0000-0000-00000000000b', '2026-02-05', 1000, 'gcash', 'pending_review',
            'a0000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'tenant cannot submit a payment for someone else''s stay');
select throws_ok(
  $$insert into public.payments (tenancy_id, paid_on, amount_centavos, method, status, submitted_by)
    values ('d0000000-0000-0000-0000-00000000000a', '2026-02-05', 1000, 'cash', 'pending_review',
            'a0000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'tenant cannot record a cash payment');

-- Confirming own payment / changing own role silently affects no rows.
update public.payments set status = 'confirmed' where id = 'e0000000-0000-0000-0000-00000000000a';
update public.profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-00000000000a';
select lives_ok($$select public.mark_password_changed()$$, 'tenant can clear own must_change_password');
select throws_ok(
  $$update public.notifications set title = 'hacked' where id = 'f0000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'tenant can only change read_at on notifications');
select lives_ok(
  $$update public.notifications set read_at = now() where id = 'f0000000-0000-0000-0000-00000000000a'$$,
  'tenant can mark own notification read');

-- ---------------------------------------------------------------------------
-- Check those writes as postgres
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select status::text from public.payments where id = 'e0000000-0000-0000-0000-00000000000a'),
  'pending_review', 'tenant cannot confirm a payment');
select is(
  (select role::text from public.profiles where id = 'a0000000-0000-0000-0000-00000000000a'),
  'tenant', 'tenant cannot make themselves admin');
select is(
  (select must_change_password from public.profiles where id = 'a0000000-0000-0000-0000-00000000000a'),
  false, 'mark_password_changed cleared the flag');

-- ---------------------------------------------------------------------------
-- Anon: nothing
-- ---------------------------------------------------------------------------
select pg_temp.login(null);
select is((select count(*) from public.rooms), 0::bigint, 'anon sees no rooms');
select is((select count(*) from public.electricity_rates), 0::bigint, 'anon sees no rates');

-- ---------------------------------------------------------------------------
-- Admin: everything
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select is((select count(*) from public.tenancies), 2::bigint, 'admin sees every stay');
select is((select count(*) from public.charges), 3::bigint, 'admin sees every charge');
select lives_ok(
  $$insert into public.meter_readings (tenancy_id, reading_date, reading_kwh)
    values ('d0000000-0000-0000-0000-00000000000a', '2026-02-05', 150)$$,
  'admin can add a reading');
select ok((select count(*) from public.audit_log) > 0, 'admin can read the audit log');

select * from finish();
rollback;
