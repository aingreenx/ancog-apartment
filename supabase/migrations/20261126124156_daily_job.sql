-- Daily job (#20), every day at 00:05 Asia/Manila via pg_cron:
--   1. Rent charge for every active stay whose due date is today (due days 29–31 move to
--      the last day of shorter months). Idempotent: the unique "one rent per period" index.
--   2. Reminders: "rent due in 3 days", "rent due today", "overdue" (the day after a due
--      date, if still owed), and for admins "meter readings due today".
--      Idempotent: notifications.dedupe_key is unique.
--   3. Overdue status needs no refresh: charge_balances computes it from today's date.
-- Every run is logged in job_runs (started, finished, rows created, error).

-- ---------------------------------------------------------------------------
-- Date logic
-- ---------------------------------------------------------------------------

-- The due date in the month of p_day for a due day (clamped to the month's last day).
create function public.due_date_in_month(p_day date, p_due_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(
    extract(year from p_day)::int,
    extract(month from p_day)::int,
    least(p_due_day, extract(day from (date_trunc('month', p_day) + interval '1 month - 1 day'))::int)
  );
$$;

-- The rent period that starts on a due date ends the day before the next due date.
create function public.rent_period_end(p_start date, p_due_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select public.due_date_in_month((p_start + interval '1 month')::date, p_due_day) - 1;
$$;

-- ---------------------------------------------------------------------------
-- Run log and notification de-duplication
-- ---------------------------------------------------------------------------

create table public.job_runs (
  id bigint generated always as identity primary key,
  job text not null,
  run_date date not null,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  rent_charges_created integer not null default 0,
  notifications_created integer not null default 0,
  error text
);
create index job_runs_job_started_idx on public.job_runs (job, started_at desc);
alter table public.job_runs enable row level security;
create policy "admins: read" on public.job_runs for select to authenticated using ((select public.is_admin()));

alter table public.notifications add column dedupe_key text unique;

-- ---------------------------------------------------------------------------
-- The job
-- ---------------------------------------------------------------------------

create function public.run_daily_billing(p_today date default public.app_today())
returns public.job_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.job_runs;
  v_rent integer := 0;
  v_notes integer := 0;
  v_n integer;
  v_in3 date := p_today + 3;
begin
  -- pg_cron runs this as postgres (no signed-in user). Signed-in callers must be admins.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can run the daily job' using errcode = 'insufficient_privilege';
  end if;

  insert into public.job_runs (job, run_date) values ('daily-billing', p_today) returning * into v_run;

  begin
    -- 1. Rent charges due today.
    insert into public.charges (tenancy_id, type, description, period_start, period_end, due_date, amount_centavos)
    select t.id, 'rent',
           'Rent ' || to_char(p_today, 'Mon FMDD') || ' – '
             || to_char(public.rent_period_end(p_today, t.due_day), 'Mon FMDD, YYYY'),
           p_today, public.rent_period_end(p_today, t.due_day), p_today, t.monthly_rent_centavos
    from public.tenancies t
    where t.status = 'active'
      and t.start_date <= p_today
      and public.due_date_in_month(p_today, t.due_day) = p_today
    on conflict (tenancy_id, period_start) where type = 'rent' and voided_at is null do nothing;
    get diagnostics v_rent = row_count;

    -- 2a. Tenants: rent due in 3 days / due today.
    insert into public.notifications (profile_id, type, title, body, link, dedupe_key)
    select tn.profile_id, 'rent_due_soon', 'Rent due in 3 days',
           'Your rent of ₱' || to_char(t.monthly_rent_centavos / 100.0, 'FM999,999,990.00')
             || ' is due on ' || to_char(v_in3, 'Mon FMDD') || '.',
           '/portal', 'rent-due-3:' || t.id || ':' || v_in3
    from public.tenancies t
    join public.tenants tn on tn.id = t.tenant_id
    where t.status = 'active' and tn.profile_id is not null and t.start_date < v_in3
      and public.due_date_in_month(v_in3, t.due_day) = v_in3
    on conflict (dedupe_key) do nothing;
    get diagnostics v_n = row_count;
    v_notes := v_notes + v_n;

    insert into public.notifications (profile_id, type, title, body, link, dedupe_key)
    select tn.profile_id, 'rent_due_today', 'Rent is due today',
           'Your rent of ₱' || to_char(t.monthly_rent_centavos / 100.0, 'FM999,999,990.00') || ' is due today.',
           '/portal', 'rent-due-today:' || t.id || ':' || p_today
    from public.tenancies t
    join public.tenants tn on tn.id = t.tenant_id
    where t.status = 'active' and tn.profile_id is not null and t.start_date < p_today
      and public.due_date_in_month(p_today, t.due_day) = p_today
    on conflict (dedupe_key) do nothing;
    get diagnostics v_n = row_count;
    v_notes := v_notes + v_n;

    -- 2b. Tenants: charges that became overdue today (due yesterday, still owed).
    insert into public.notifications (profile_id, type, title, body, link, dedupe_key)
    select tn.profile_id, 'overdue', c.description || ' is overdue',
           '₱' || to_char(cb.owed_centavos / 100.0, 'FM999,999,990.00') || ' is still unpaid.',
           '/portal', 'overdue:' || c.id
    from public.charges c
    join public.charge_balances cb on cb.charge_id = c.id
    join public.tenancies t on t.id = c.tenancy_id
    join public.tenants tn on tn.id = t.tenant_id
    where c.due_date = p_today - 1 and c.voided_at is null and cb.owed_centavos > 0
      and tn.profile_id is not null
    on conflict (dedupe_key) do nothing;
    get diagnostics v_n = row_count;
    v_notes := v_notes + v_n;

    -- 2c. Admins: meter readings due today (stays whose due date is today).
    insert into public.notifications (profile_id, type, title, body, link, dedupe_key)
    select p.id, 'readings_due', 'Meter readings due today',
           'Rooms ' || string_agg(r.number::text, ', ' order by r.number) || '.',
           '/admin', 'readings-due:' || p_today || ':' || p.id
    from public.profiles p
    cross join public.tenancies t
    join public.rooms r on r.id = t.room_id
    where p.role = 'admin' and t.status = 'active' and t.start_date < p_today
      and public.due_date_in_month(p_today, t.due_day) = p_today
    group by p.id
    on conflict (dedupe_key) do nothing;
    get diagnostics v_n = row_count;
    v_notes := v_notes + v_n;

    update public.job_runs
    set finished_at = clock_timestamp(), rent_charges_created = v_rent, notifications_created = v_notes
    where id = v_run.id
    returning * into v_run;
  exception when others then
    -- The work above is rolled back; keep the log row with the error.
    update public.job_runs
    set finished_at = clock_timestamp(), error = sqlerrm
    where id = v_run.id
    returning * into v_run;
  end;

  return v_run;
end;
$$;

revoke execute on function public.run_daily_billing from public, anon;
grant execute on function public.run_daily_billing to authenticated;

-- ---------------------------------------------------------------------------
-- Schedule: 00:05 in Manila is 16:05 UTC the day before (Manila has no DST).
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('daily-billing', '5 16 * * *', $$select public.run_daily_billing()$$);
