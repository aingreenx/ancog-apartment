-- run_daily_billing(): date logic, idempotency, a whole simulated month.
begin;
create extension if not exists pgtap with schema extensions;
truncate public.profiles, public.rooms, public.tenants, public.electricity_rates, public.audit_log,
         public.job_runs cascade;
select plan(21);

-- ---- date logic ----------------------------------------------------------------
select is(public.due_date_in_month('2026-11-10', 14), '2026-11-14'::date, 'normal due day');
select is(public.due_date_in_month('2026-11-10', 31), '2026-11-30'::date, 'day 31 in a 30-day month');
select is(public.due_date_in_month('2027-02-01', 30), '2027-02-28'::date, 'day 30 in February');
select is(public.due_date_in_month('2028-02-01', 31), '2028-02-29'::date, 'day 31 in a leap February');
select is(public.rent_period_end('2027-01-31', 31), '2027-02-27'::date, 'Jan 31 period ends Feb 27');
select is(public.rent_period_end('2027-02-28', 31), '2027-03-30'::date, 'Feb 28 (day 31) period ends Mar 30');

-- ---- fixtures: four stays --------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@test.local'),
  ('a0000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('a0000000-0000-0000-0000-00000000000b', 'b@test.local');
insert into public.profiles (id, role, username, display_name, must_change_password) values
  ('a0000000-0000-0000-0000-000000000001', 'admin', 'admin', 'Admin', false),
  ('a0000000-0000-0000-0000-00000000000a', 'tenant', 'room1-a-0001', 'A', false),
  ('a0000000-0000-0000-0000-00000000000b', 'tenant', 'room2-b-0002', 'B', false);
insert into public.rooms (id, number, base_rent_centavos) values
  ('b0000000-0000-0000-0000-000000000001', 1, 350000), ('b0000000-0000-0000-0000-000000000002', 2, 350000),
  ('b0000000-0000-0000-0000-000000000003', 3, 250000), ('b0000000-0000-0000-0000-000000000004', 4, 350000);
insert into public.tenants (id, first_name, last_name, phone_1, profile_id) values
  ('c0000000-0000-0000-0000-000000000001', 'A', 'Test', '0900', 'a0000000-0000-0000-0000-00000000000a'),
  ('c0000000-0000-0000-0000-000000000002', 'B', 'Test', '0900', 'a0000000-0000-0000-0000-00000000000b'),
  ('c0000000-0000-0000-0000-000000000003', 'C', 'Test', '0900', null),
  ('c0000000-0000-0000-0000-000000000004', 'D', 'Test', '0900', null);
insert into public.tenancies (id, room_id, tenant_id, start_date, due_day, monthly_rent_centavos, starting_kwh) values
  -- due on the 1st, 14th and 31st; plus one moving in on Dec 10 (advance already charged)
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '2026-06-01', 1, 350000, 0),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', '2026-05-14', 14, 350000, 0),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', '2026-08-31', 31, 250000, 0),
  ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', '2026-12-10', 10, 350000, 0);
insert into public.charges (tenancy_id, type, description, period_start, period_end, due_date, amount_centavos)
  values ('d0000000-0000-0000-0000-000000000004', 'rent', 'Advance', '2026-12-10', '2027-01-09', '2026-12-10', 350000);

-- ---- simulate December 2026, running every day TWICE ---------------------------------
do $$
declare d date;
begin
  for d in select generate_series('2026-12-01'::date, '2026-12-31'::date, interval '1 day')::date loop
    perform public.run_daily_billing(d);
    perform public.run_daily_billing(d);
  end loop;
end $$;

select results_eq(
  $$select t.due_day::int, count(c.*)::int
    from public.tenancies t
    left join public.charges c on c.tenancy_id = t.id and c.type = 'rent'
      and c.due_date between '2026-12-01' and '2026-12-31'
    group by t.due_day order by t.due_day$$,
  $$values (1, 1), (10, 1), (14, 1), (31, 1)$$,
  'a whole simulated month: exactly one December rent charge per tenant');
select is((select due_date from public.charges where tenancy_id = 'd0000000-0000-0000-0000-000000000003' and type = 'rent'),
  '2026-12-31'::date, 'due day 31 is charged on Dec 31');
select is((select period_end from public.charges where tenancy_id = 'd0000000-0000-0000-0000-000000000002' and type = 'rent'),
  '2027-01-13'::date, 'period runs to the day before the next due date');
select is((select amount_centavos from public.charges where tenancy_id = 'd0000000-0000-0000-0000-000000000002' and type = 'rent'),
  350000::bigint, 'charged at the stay''s rent');
select is((select count(*)::int from public.job_runs), 62, 'every run is logged');
select is((select sum(rent_charges_created)::int from public.job_runs), 3,
  'only first runs created charges (the Dec 10 advance already existed)');
select is((select count(*)::int from public.job_runs where error is not null), 0, 'no errors');

-- ---- notifications -----------------------------------------------------------------
select is((select count(*)::int from public.notifications where dedupe_key like 'rent-due-3:%'), 2,
  'one "due in 3 days" per tenant with a login (A and B)');
select is((select count(*)::int from public.notifications where dedupe_key like 'rent-due-today:%'), 2,
  'one "due today" per tenant with a login');
select is((select count(*)::int from public.notifications where type = 'overdue'), 2,
  'overdue reminders the day after the due date (A on Dec 2, B on Dec 15)');
select is((select count(*)::int from public.notifications where type = 'readings_due'), 3,
  'admin gets "readings due" on Dec 1, 14 and 31 (not the move-in day)');
select is((select body from public.notifications
            where dedupe_key = 'rent-due-3:d0000000-0000-0000-0000-000000000002:2026-12-14'),
  'Your rent of ₱3,500.00 is due on Dec 14.', 'reminder text (B, sent Dec 11)');

-- February: day 31 → Feb 28, exactly once.
do $$
declare d date;
begin
  for d in select generate_series('2027-02-01'::date, '2027-03-05'::date, interval '1 day')::date loop
    perform public.run_daily_billing(d);
  end loop;
end $$;
select results_eq(
  $$select due_date from public.charges where tenancy_id = 'd0000000-0000-0000-0000-000000000003'
      and type = 'rent' and due_date >= '2027-02-01' order by due_date$$,
  $$values ('2027-02-28'::date)$$, 'due day 31 is charged on Feb 28, once');

-- Tenants can't run it.
create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
select pg_temp.login('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.run_daily_billing('2027-03-01')$$, '42501', null, 'tenants cannot run the job');

reset role;
select isnt((select jobid from cron.job where jobname = 'daily-billing'), null, 'scheduled with pg_cron');

select * from finish();
rollback;
