-- GCash: tenant submits, admin confirms or rejects; notifications both ways.
begin;
create extension if not exists pgtap with schema extensions;
truncate public.profiles, public.rooms, public.tenants, public.electricity_rates, public.audit_log cascade;
select plan(14);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@test.local'),
  ('a0000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('a0000000-0000-0000-0000-00000000000b', 'b@test.local');
insert into public.profiles (id, role, username, display_name, must_change_password) values
  ('a0000000-0000-0000-0000-000000000001', 'admin', 'admin', 'Admin', false),
  ('a0000000-0000-0000-0000-00000000000a', 'tenant', 'room1-a-0001', 'A', false),
  ('a0000000-0000-0000-0000-00000000000b', 'tenant', 'room2-b-0002', 'B', false);
insert into public.rooms (id, number, base_rent_centavos) values
  ('b0000000-0000-0000-0000-000000000001', 1, 350000), ('b0000000-0000-0000-0000-000000000002', 2, 350000);
insert into public.tenants (id, first_name, last_name, phone_1, profile_id) values
  ('c0000000-0000-0000-0000-00000000000a', 'A', 'Test', '0900', 'a0000000-0000-0000-0000-00000000000a'),
  ('c0000000-0000-0000-0000-00000000000b', 'B', 'Test', '0900', 'a0000000-0000-0000-0000-00000000000b');
insert into public.tenancies (id, room_id, tenant_id, start_date, due_day, monthly_rent_centavos, starting_kwh) values
  ('d0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', '2026-01-05', 5, 350000, 0),
  ('d0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000b', '2026-01-10', 10, 350000, 0);
insert into public.charges (id, tenancy_id, type, description, period_start, due_date, amount_centavos) values
  ('e0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000a', 'rent', 'Rent', '2026-02-05', '2026-02-05', 350000),
  ('e0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000b', 'rent', 'Rent', '2026-02-10', '2026-02-10', 350000);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Tenant A submits two GCash payments.
select pg_temp.login('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$
  insert into public.payments (id, tenancy_id, paid_on, amount_centavos, method, reference_no, status, submitted_by, for_charge_id)
  values ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a', '2026-02-05', 350000, 'gcash',
          'GC-1', 'pending_review', 'a0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000a')
$$, 'tenant can submit a GCash payment for their bill');
select lives_ok($$
  insert into public.payments (id, tenancy_id, paid_on, amount_centavos, method, reference_no, status, submitted_by)
  values ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-00000000000a', '2026-02-06', 1000, 'gcash',
          'GC-2', 'pending_review', 'a0000000-0000-0000-0000-00000000000a')
$$, 'tenant can submit without naming a bill');
select throws_ok($$
  insert into public.payments (tenancy_id, paid_on, amount_centavos, method, status, submitted_by, for_charge_id)
  values ('d0000000-0000-0000-0000-00000000000a', '2026-02-05', 1000, 'gcash', 'pending_review',
          'a0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000b')
$$, '42501', null, 'tenant cannot point a payment at someone else''s bill');
select throws_ok($$select public.confirm_payment('f0000000-0000-0000-0000-000000000001', '[]')$$,
  '42501', null, 'tenant cannot confirm');

reset role;
select is((select count(*)::int from public.notifications where type = 'payment_to_review'
            and profile_id = 'a0000000-0000-0000-0000-000000000001'), 2, 'admin notified of each submission');
select is((select count(*)::int from public.receipts), 0, 'no receipt while pending');

-- Admin confirms the first, rejects the second.
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select lives_ok($$select public.confirm_payment('f0000000-0000-0000-0000-000000000001',
  '[{"charge_id":"e0000000-0000-0000-0000-00000000000a","amount_centavos":350000}]')$$, 'admin confirms');
select throws_ok($$select public.reject_payment('f0000000-0000-0000-0000-000000000002', ' ')$$,
  '23514', null, 'rejecting needs a reason');
select lives_ok($$select public.reject_payment('f0000000-0000-0000-0000-000000000002', 'Reference not found in GCash')$$,
  'admin rejects with a reason');
select throws_ok($$select public.confirm_payment('f0000000-0000-0000-0000-000000000002', '[]')$$,
  '23514', null, 'a rejected payment cannot be confirmed');

reset role;
select is((select status from public.charge_balances where charge_id = 'e0000000-0000-0000-0000-00000000000a'),
  'paid', 'the bill is paid after confirming');
select is((select count(*)::int from public.receipts), 1, 'a receipt is issued on confirm');
select is((select array_agg(type order by type) from public.notifications
           where profile_id = 'a0000000-0000-0000-0000-00000000000a'),
  array['payment_confirmed', 'payment_rejected'], 'tenant notified both ways');
select is((select review_note from public.payments where id = 'f0000000-0000-0000-0000-000000000002'),
  'Reference not found in GCash', 'reason kept');

select * from finish();
rollback;
