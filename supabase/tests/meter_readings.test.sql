-- record_meter_reading(): entering the notebook's readings reproduces its bills.
begin;
create extension if not exists pgtap with schema extensions;
truncate public.profiles, public.rooms, public.tenants, public.electricity_rates, public.audit_log cascade;
select plan(15);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@test.local'),
  ('a0000000-0000-0000-0000-000000000002', 'tenant@test.local');
insert into public.profiles (id, role, username, display_name, must_change_password) values
  ('a0000000-0000-0000-0000-000000000001', 'admin', 'admin', 'Admin', false),
  ('a0000000-0000-0000-0000-000000000002', 'tenant', 'room3-t-0001', 'Tenant', false);
insert into public.rooms (id, number, base_rent_centavos) values ('b0000000-0000-0000-0000-000000000003', 3, 250000);
insert into public.tenants (id, first_name, last_name, phone_1, profile_id)
  values ('c0000000-0000-0000-0000-000000000001', 'Test', 'Tenant', '0900', 'a0000000-0000-0000-0000-000000000002');
insert into public.tenancies (id, room_id, tenant_id, start_date, due_day, monthly_rent_centavos, starting_kwh)
  values ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003',
          'c0000000-0000-0000-0000-000000000001', '2026-05-14', 14, 250000, 9433);
insert into public.meter_readings (tenancy_id, reading_date, reading_kwh, kind)
  values ('d0000000-0000-0000-0000-000000000001', '2026-05-14', 9433, 'move_in');
insert into public.electricity_rates (effective_date, rate_centavos_per_kwh) values
  ('2026-06-01', 1200), ('2026-07-01', 1200), ('2026-08-01', 1350),
  ('2026-09-01', 1400), ('2026-10-01', 1500), ('2026-11-01', 1500);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.bill(p_date date, p_kwh int) returns bigint language sql as $$
  select (public.record_meter_reading('d0000000-0000-0000-0000-000000000001', p_date, p_kwh) ->> 'amount_centavos')::bigint;
$$;

select pg_temp.login('a0000000-0000-0000-0000-000000000001');

-- The notebook page: 9,433 → 10,838, rates ₱12, 12, 13.50, 14, 15, 15.
select is(pg_temp.bill('2026-06-14', 9764), 397200::bigint, 'Jun: 331 kWh × ₱12 = ₱3,972');
select is(pg_temp.bill('2026-07-14', 10018), 304800::bigint, 'Jul: 254 kWh × ₱12 = ₱3,048');
select is(pg_temp.bill('2026-08-14', 10276), 348300::bigint, 'Aug: 258 kWh × ₱13.50 = ₱3,483');
select is(pg_temp.bill('2026-09-14', 10505), 320600::bigint, 'Sep: 229 kWh × ₱14 = ₱3,206');
select is(pg_temp.bill('2026-10-14', 10775), 405000::bigint, 'Oct: 270 kWh × ₱15 = ₱4,050');
select is(pg_temp.bill('2026-11-14', 10838), 94500::bigint, 'Nov: 63 kWh × ₱15 = ₱945');

select is(
  (select array_agg(kwh_used order by due_date) from public.charges where type = 'electricity'),
  array[331, 254, 258, 229, 270, 63], 'snapshots keep kWh used');

-- Rules
select throws_ok($$select pg_temp.bill('2026-12-14', 10800)$$, '23514', null,
  'a reading lower than the previous one is blocked');
select throws_ok($$select pg_temp.bill('2026-11-01', 10900)$$, '23514', null,
  'a reading dated before the previous reading is blocked');

-- Meter change: old meter final 10,900 (62 kWh × ₱15 = ₱930), new meter starts at 12.
select is(
  (public.record_meter_reading('d0000000-0000-0000-0000-000000000001', '2026-12-01', 10900, null, 12)
    ->> 'amount_centavos')::bigint,
  93000::bigint, 'meter change bills the old meter''s usage');
select is(pg_temp.bill('2026-12-14', 112), 150000::bigint, 'next bill starts from the new meter (100 kWh × ₱15)');

select throws_ok(
  $$select public.record_meter_reading('d0000000-0000-0000-0000-000000000001', '2026-12-20', 120, 'someone-else/x.jpg')$$,
  '23514', null, 'photo must be under this stay''s folder');

-- No rate yet for the reading date → clear error, nothing saved. (A second stay that
-- started before the first rate was entered.)
reset role;
insert into public.rooms (id, number, base_rent_centavos) values ('b0000000-0000-0000-0000-000000000004', 4, 350000);
insert into public.tenancies (id, room_id, tenant_id, start_date, due_day, monthly_rent_centavos, starting_kwh)
  values ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000004',
          'c0000000-0000-0000-0000-000000000001', '2026-01-10', 10, 350000, 100);
insert into public.meter_readings (tenancy_id, reading_date, reading_kwh, kind)
  values ('d0000000-0000-0000-0000-000000000002', '2026-01-10', 100, 'move_in');
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select throws_like(
  $$select public.record_meter_reading('d0000000-0000-0000-0000-000000000002', '2026-02-10', 150)$$,
  'No electricity rate entered on or before 2026-02-10', 'no rate yet gives a clear error');

-- Tenants can't record readings.
reset role;
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select throws_ok($$select pg_temp.bill('2026-12-20', 200)$$, '42501', null, 'tenants cannot record readings');

reset role;
select is((select count(*) from public.meter_readings), 11::bigint,
  'failed attempts saved nothing (2 move-ins + 6 + old + new + 1)');

select * from finish();
rollback;
