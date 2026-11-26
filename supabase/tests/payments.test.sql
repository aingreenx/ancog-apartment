-- record_payment() / void_payment()
begin;
create extension if not exists pgtap with schema extensions;
truncate public.profiles, public.rooms, public.tenants, public.electricity_rates, public.audit_log cascade;
select plan(16);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@test.local'),
  ('a0000000-0000-0000-0000-000000000002', 'tenant@test.local');
insert into public.profiles (id, role, username, display_name, must_change_password) values
  ('a0000000-0000-0000-0000-000000000001', 'admin', 'admin', 'Admin', false),
  ('a0000000-0000-0000-0000-000000000002', 'tenant', 'room3-t-0001', 'Tenant', false);
insert into public.rooms (id, number, base_rent_centavos) values
  ('b0000000-0000-0000-0000-000000000003', 3, 250000), ('b0000000-0000-0000-0000-000000000004', 4, 350000);
insert into public.tenants (id, first_name, last_name, phone_1, profile_id) values
  ('c0000000-0000-0000-0000-000000000001', 'Test', 'Tenant', '0900', 'a0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000002', 'Other', 'Tenant', '0900', null);
insert into public.tenancies (id, room_id, tenant_id, start_date, due_day, monthly_rent_centavos, starting_kwh) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', '2026-06-14', 14, 250000, 0),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', '2026-06-01', 1, 350000, 0);
insert into public.charges (id, tenancy_id, type, description, due_date, amount_centavos, prev_kwh, curr_kwh, kwh_used, rate_centavos_per_kwh) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'electricity', 'Elec Jun', '2026-06-14', 397200, 9433, 9764, 331, 1200);
insert into public.charges (id, tenancy_id, type, description, due_date, amount_centavos) values
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'custom', 'Other stay', '2026-06-01', 10000);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.owed() returns bigint language sql as $$
  select owed_centavos from public.charge_balances where charge_id = 'e0000000-0000-0000-0000-000000000001';
$$;

select pg_temp.login('a0000000-0000-0000-0000-000000000001');

-- Notebook: 3,972 paid as 2,000 + 1,972
create temp table p (n int, id uuid);
grant all on p to authenticated;
insert into p select 1, public.record_payment('d0000000-0000-0000-0000-000000000001', '2026-06-20', 200000, 'cash', null, null, 'first half',
  '[{"charge_id":"e0000000-0000-0000-0000-000000000001","amount_centavos":200000}]');
select is(pg_temp.owed(), 197200::bigint, 'after 2,000: 1,972 owed');
select is((select status from public.charge_balances where charge_id = 'e0000000-0000-0000-0000-000000000001'),
  'overdue', 'still overdue after a partial payment');
insert into p select 2, public.record_payment('d0000000-0000-0000-0000-000000000001', '2026-07-14', 197200, 'gcash', 'GC-123', null, null,
  '[{"charge_id":"e0000000-0000-0000-0000-000000000001","amount_centavos":197200}]');
select is(pg_temp.owed(), 0::bigint, 'after 1,972: paid');
select is((select status from public.charge_balances where charge_id = 'e0000000-0000-0000-0000-000000000001'), 'paid', 'status paid');
select is((select paid_on from public.payments where id = (select id from p where n = 2)), '2026-07-14'::date, 'keeps the date actually paid');
select is((select status::text from public.payments where id = (select id from p where n = 2)), 'confirmed', 'admin payments are confirmed');

-- Leftover is credit
insert into p select 3, public.record_payment('d0000000-0000-0000-0000-000000000001', '2026-07-20', 50000, 'cash', null, null, null, '[]');
select is((select credit_centavos from public.tenancy_balances where tenancy_id = 'd0000000-0000-0000-0000-000000000001'),
  50000::bigint, 'unallocated money is credit');

-- Rules
select throws_ok($$select public.record_payment('d0000000-0000-0000-0000-000000000001', '2026-07-20', 1000, 'cash', null, null, null,
  '[{"charge_id":"e0000000-0000-0000-0000-000000000002","amount_centavos":1000}]')$$,
  '23514', null, 'cannot allocate to another stay''s charge');
select throws_ok($$select public.record_payment('d0000000-0000-0000-0000-000000000001', '2026-07-20', 1000, 'cash', null, null, null,
  '[{"charge_id":"e0000000-0000-0000-0000-000000000001","amount_centavos":5000}]')$$,
  '23514', null, 'cannot allocate more than the payment');
select is((select count(*) from public.payments), 3::bigint, 'failed payments save nothing');

-- Void the second payment: the charge owes 1,972 again; rows are kept
select lives_ok($$select public.void_payment((select id from p where n = 2), 'Wrong amount')$$, 'admin can void');
select is(pg_temp.owed(), 197200::bigint, 'voiding puts the amount back to owed');
select is((select count(*) from public.payments where voided_at is not null), 1::bigint, 'payment kept, marked void');
select throws_ok($$select public.void_payment((select id from p where n = 1), '  ')$$, '23514', null, 'a reason is required');
select ok((select count(*) from public.audit_log where table_name = 'payments' and action = 'UPDATE') >= 1,
  'void is in the audit log');

-- Tenants can't
reset role;
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select throws_ok($$select public.record_payment('d0000000-0000-0000-0000-000000000001', '2026-07-20', 1000, 'cash', null, null, null, '[]')$$,
  '42501', null, 'tenants cannot record confirmed payments');

select * from finish();
rollback;
