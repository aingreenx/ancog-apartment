-- move_in(): one transaction for profile, tenant, stay, occupants, reading and charges.
begin;
create extension if not exists pgtap with schema extensions;
truncate public.profiles, public.rooms, public.tenants, public.electricity_rates, public.audit_log cascade;
select plan(12);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@test.local'),
  ('a0000000-0000-0000-0000-000000000002', 'new@test.local'),
  ('a0000000-0000-0000-0000-000000000003', 'other@test.local');
insert into public.profiles (id, role, username, display_name, must_change_password)
  values ('a0000000-0000-0000-0000-000000000001', 'admin', 'admin', 'Admin', false);
insert into public.rooms (number, base_rent_centavos) values (3, 250000), (4, 350000);

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.login('a0000000-0000-0000-0000-000000000001');

select lives_ok($$
  select public.move_in('a0000000-0000-0000-0000-000000000002', 'room3-test-0001', ' Test ', 'Person',
    '0900 000 0001', '', '', '[{"name":"Kid","phone":""},{"name":" ","phone":""}]'::jsonb,
    3::smallint, '2026-12-31', 9433, 250000, 250000)
$$, 'admin can move a tenant in');

select is((select count(*) from public.tenancies where status = 'active'), 1::bigint, 'one active stay');
select is((select due_day::int from public.tenancies), 31, 'due day is the move-in day');
select is((select monthly_rent_centavos from public.tenancies), 250000::bigint, 'rent is the room rent');
select is((select display_name from public.profiles where username = 'room3-test-0001'), 'Test Person',
  'profile created with trimmed name');
select is((select must_change_password from public.profiles where username = 'room3-test-0001'), true,
  'must change password on first login');
select is((select count(*) from public.tenancy_occupants), 1::bigint, 'blank occupants are skipped');
select is((select reading_kwh from public.meter_readings where kind = 'move_in'), 9433, 'move-in reading');
select results_eq(
  $$select type::text, amount_centavos, due_date, period_end from public.charges order by type$$,
  $$values ('deposit', 250000::bigint, '2026-12-31'::date, null::date),
           ('rent', 250000::bigint, '2026-12-31'::date, '2027-01-30'::date)$$,
  'advance = first rent charge, plus deposit');

select throws_ok($$
  select public.move_in('a0000000-0000-0000-0000-000000000003', 'room3-other-0002', 'Other', 'Person',
    '0900', '', '', '[]'::jsonb, 3::smallint, '2026-12-01', 0, 0, 0)
$$, '23505', null, 'an occupied room is rejected');
select is((select count(*) from public.profiles where username = 'room3-other-0002'), 0::bigint,
  'nothing is left behind when it fails');

-- A tenant can't call it.
reset role;
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select throws_ok($$
  select public.move_in('a0000000-0000-0000-0000-000000000003', 'room4-x-0003', 'X', 'Y',
    '0900', '', '', '[]'::jsonb, 4::smallint, '2026-12-01', 0, 0, 0)
$$, '42501', null, 'tenants cannot move people in');

select * from finish();
rollback;
