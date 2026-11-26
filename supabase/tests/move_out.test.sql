-- move_out(): final reading, deductions, credit, deposit applied, refund / remaining owed.
begin;
create extension if not exists pgtap with schema extensions;
truncate public.profiles, public.rooms, public.tenants, public.electricity_rates, public.audit_log cascade;
select plan(19);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@test.local'),
  ('a0000000-0000-0000-0000-00000000000a', 'a@test.local');
insert into public.profiles (id, role, username, display_name, must_change_password) values
  ('a0000000-0000-0000-0000-000000000001', 'admin', 'admin', 'Admin', false),
  ('a0000000-0000-0000-0000-00000000000a', 'tenant', 'room3-a-0001', 'A', false);
insert into public.rooms (id, number, base_rent_centavos) values
  ('b0000000-0000-0000-0000-000000000003', 3, 250000), ('b0000000-0000-0000-0000-000000000004', 4, 350000);
insert into public.tenants (id, first_name, last_name, phone_1, profile_id) values
  ('c0000000-0000-0000-0000-00000000000a', 'A', 'Test', '0900', 'a0000000-0000-0000-0000-00000000000a'),
  ('c0000000-0000-0000-0000-00000000000b', 'B', 'Test', '0900', null);
insert into public.electricity_rates (effective_date, rate_centavos_per_kwh) values ('2026-01-01', 1500);
insert into public.tenancies (id, room_id, tenant_id, start_date, due_day, monthly_rent_centavos, starting_kwh) values
  ('d0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-00000000000a', '2026-05-14', 14, 250000, 10775),
  ('d0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-00000000000b', '2026-05-01', 1, 350000, 0);
insert into public.meter_readings (tenancy_id, reading_date, reading_kwh, kind) values
  ('d0000000-0000-0000-0000-00000000000a', '2026-05-14', 10775, 'move_in'),
  ('d0000000-0000-0000-0000-00000000000b', '2026-05-01', 0, 'move_in');

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
select pg_temp.login('a0000000-0000-0000-0000-000000000001');

-- Stay A: deposit 2,500 paid; electricity 945 with 500 paid (445 owed); ₱55 credit.
insert into public.charges (id, tenancy_id, type, description, due_date, amount_centavos) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a', 'deposit', 'Deposit', '2026-05-14', 250000);
insert into public.charges (id, tenancy_id, type, description, due_date, amount_centavos, prev_kwh, curr_kwh, kwh_used, rate_centavos_per_kwh) values
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-00000000000a', 'electricity', 'Elec Nov', '2026-11-14', 94500, 10775, 10838, 63, 1500);
update public.meter_readings set reading_kwh = 10838, reading_date = '2026-11-14', kind = 'regular'
  where tenancy_id = 'd0000000-0000-0000-0000-00000000000a';
insert into public.meter_readings (tenancy_id, reading_date, reading_kwh, kind) values
  ('d0000000-0000-0000-0000-00000000000a', '2026-05-14', 10775, 'move_in');
select public.record_payment('d0000000-0000-0000-0000-00000000000a', '2026-05-14', 250000, 'cash', null, null, null,
  '[{"charge_id":"e0000000-0000-0000-0000-000000000001","amount_centavos":250000}]');
select public.record_payment('d0000000-0000-0000-0000-00000000000a', '2026-11-20', 55500, 'gcash', 'GC', null, null,
  '[{"charge_id":"e0000000-0000-0000-0000-000000000002","amount_centavos":50000}]');

-- Move out on Nov 30: final reading 10,900 (62 kWh × ₱15 = ₱930), cleaning ₱500.
select lives_ok($$select public.move_out('d0000000-0000-0000-0000-00000000000a', '2026-11-30', 10900,
  '[{"description":"Cleaning","amount_centavos":50000}]', 'Keys returned')$$, 'admin moves a tenant out');

select is((select kind::text from public.meter_readings where tenancy_id = 'd0000000-0000-0000-0000-00000000000a'
           order by reading_date desc, created_at desc limit 1), 'move_out', 'final reading is a move-out reading');
select is((select amount_centavos from public.charges where tenancy_id = 'd0000000-0000-0000-0000-00000000000a'
           and type = 'electricity' and due_date = '2026-11-30'), 93000::bigint, 'last electricity bill: 62 kWh × ₱15');
select is((select amount_centavos from public.charges where type = 'deduction'), 50000::bigint, 'deduction added');

-- Owed before deposit: 445 + 930 + 500 = 1,875; credit 55 → 1,820; deposit 2,500 → refund 680.
select results_eq(
  $$select deposit_held_centavos, deductions_centavos, applied_to_balance_centavos, refund_centavos, remaining_owed_centavos
    from public.move_out_settlements where tenancy_id = 'd0000000-0000-0000-0000-00000000000a'$$,
  $$values (250000::bigint, 50000::bigint, 132000::bigint, 68000::bigint, 0::bigint)$$,
  'settlement: deposit 2,500 → cleaning 500 + 1,320 unpaid, refund 680');
select is((select owed_centavos from public.tenancy_balances where tenancy_id = 'd0000000-0000-0000-0000-00000000000a'),
  0::bigint, 'nothing left owed');
select is((select credit_centavos from public.tenancy_balances where tenancy_id = 'd0000000-0000-0000-0000-00000000000a'),
  0::bigint, 'credit used up');
select is((select amount_centavos from public.payments where method = 'deposit'), 182000::bigint,
  'deposit applied as a "deposit" payment');
select ok((select receipt_no from public.receipts r join public.payments p on p.id = r.payment_id where p.method = 'deposit') is not null,
  'the deposit application has a receipt');
select is((select status::text from public.tenancies where id = 'd0000000-0000-0000-0000-00000000000a'), 'ended', 'stay ended');
select is((select end_date from public.tenancies where id = 'd0000000-0000-0000-0000-00000000000a'), '2026-11-30'::date, 'end date');
select ok(not exists (select 1 from public.tenancies where room_id = 'b0000000-0000-0000-0000-000000000003' and status = 'active'),
  'room 3 is vacant');
select is((select cash_collected_centavos + gcash_collected_centavos from public.monthly_summary where month = '2026-11-01'),
  55500::bigint, 'the deposit application is not counted as money collected');

-- Stay B: deposit 3,500 charged but only 1,000 paid; rent 3,500 unpaid; no final reading.
insert into public.charges (id, tenancy_id, type, description, period_start, due_date, amount_centavos) values
  ('e0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000b', 'deposit', 'Deposit', null, '2026-05-01', 350000),
  ('e0000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-00000000000b', 'rent', 'Rent', '2026-11-01', '2026-11-01', 350000);
select public.record_payment('d0000000-0000-0000-0000-00000000000b', '2026-05-01', 100000, 'cash', null, null, null,
  '[{"charge_id":"e0000000-0000-0000-0000-00000000000b","amount_centavos":100000}]');
select lives_ok($$select public.move_out('d0000000-0000-0000-0000-00000000000b', '2026-11-30', null, '[]', null)$$,
  'move out without a final reading');
select results_eq(
  $$select deposit_held_centavos, refund_centavos, remaining_owed_centavos
    from public.move_out_settlements where tenancy_id = 'd0000000-0000-0000-0000-00000000000b'$$,
  $$values (100000::bigint, 0::bigint, 250000::bigint)$$,
  'unpaid part of the deposit is not owed; deposit 1,000 applied; 2,500 rent still owed');
select is((select owed_centavos from public.tenancy_balances where tenancy_id = 'd0000000-0000-0000-0000-00000000000b'),
  250000::bigint, 'tenant still owes 2,500');
select is((select count(*)::int from public.charges where tenancy_id = 'd0000000-0000-0000-0000-00000000000b'
           and type = 'deposit' and voided_at is not null), 1, 'original deposit charge kept, voided with a reason');

select throws_ok($$select public.move_out('d0000000-0000-0000-0000-00000000000b', '2026-12-01', null, '[]', null)$$,
  '23514', null, 'a stay can only be moved out once');

reset role;
select pg_temp.login('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.move_out('d0000000-0000-0000-0000-00000000000a', '2026-12-01', null, '[]', null)$$,
  '42501', null, 'tenants cannot move out');

select * from finish();
rollback;
