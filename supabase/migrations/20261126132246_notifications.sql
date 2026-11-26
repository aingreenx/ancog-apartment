-- Notifications (#24): the remaining triggers, push bookkeeping, and the scheduled push
-- dispatch.
--
-- Already created elsewhere: rent due in 3 days / today / overdue, readings due (daily
-- job, #20); payment to review / confirmed / rejected (#23).
-- Added here: new electricity bill (tenant), overdue summary (admins, daily).

-- Which notifications have been sent as web pushes.
alter table public.notifications add column pushed_at timestamptz;
create index notifications_unpushed_idx on public.notifications (created_at) where pushed_at is null;

-- ---------------------------------------------------------------------------
-- New electricity bill → the tenant
-- ---------------------------------------------------------------------------

create function public.notify_electricity_bill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'electricity' then
    insert into public.notifications (profile_id, type, title, body, link, dedupe_key)
    select tn.profile_id, 'electricity_bill', 'New electricity bill',
           new.kwh_used || ' kWh × ₱' || to_char(new.rate_centavos_per_kwh / 100.0, 'FM990.00')
             || ' = ₱' || to_char(new.amount_centavos / 100.0, 'FM999,999,990.00') || '.',
           '/portal/bills', 'electricity-bill:' || new.id
    from public.tenancies t join public.tenants tn on tn.id = t.tenant_id
    where t.id = new.tenancy_id and t.status = 'active' and tn.profile_id is not null
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

create trigger charges_notify_electricity
  after insert on public.charges
  for each row execute function public.notify_electricity_bill();

-- ---------------------------------------------------------------------------
-- Overdue summary → admins, daily at 00:10 Manila (after the daily job)
-- ---------------------------------------------------------------------------

create function public.notify_overdue_summary(p_today date default public.app_today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rooms text;
  v_total bigint;
  v_n integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can run this' using errcode = 'insufficient_privilege';
  end if;

  select string_agg(distinct r.number::text, ', ' order by r.number::text), sum(cb.owed_centavos)
  into v_rooms, v_total
  from public.charge_balances cb
  join public.tenancies t on t.id = cb.tenancy_id
  join public.rooms r on r.id = t.room_id
  where cb.status = 'overdue';

  if v_total is null or v_total = 0 then
    return 0;
  end if;

  insert into public.notifications (profile_id, type, title, body, link, dedupe_key)
  select p.id, 'overdue_summary', 'Overdue: ₱' || to_char(v_total / 100.0, 'FM999,999,990'),
         'Rooms ' || v_rooms || ' have overdue bills.', '/admin?filter=overdue',
         'overdue-summary:' || p_today || ':' || p.id
  from public.profiles p
  where p.role = 'admin'
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.notify_overdue_summary from public, anon;
grant execute on function public.notify_overdue_summary to authenticated;

select cron.schedule('overdue-summary', '10 16 * * *', $$select public.notify_overdue_summary()$$);

-- ---------------------------------------------------------------------------
-- Push dispatch: every 5 minutes the database asks the app to send pending pushes
-- (POST /api/push/dispatch with a shared secret). Configure per environment:
--   insert into private.push_dispatch (url, secret) values ('https://<app>/api/push/dispatch', '<PUSH_DISPATCH_SECRET>');
-- Locally: url = 'http://host.docker.internal:3000/api/push/dispatch'.
-- Nothing happens until a row exists. The app also sends right away after its own actions.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.push_dispatch (
  id boolean primary key default true check (id),
  url text not null,
  secret text not null
);

create function private.dispatch_pushes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg private.push_dispatch;
begin
  select * into cfg from private.push_dispatch;
  if not found then
    return;
  end if;
  if exists (select 1 from public.notifications where pushed_at is null and created_at > now() - interval '1 day') then
    perform net.http_post(
      url := cfg.url,
      headers := jsonb_build_object('Authorization', 'Bearer ' || cfg.secret, 'Content-Type', 'application/json'),
      body := '{}'::jsonb
    );
  end if;
end;
$$;

select cron.schedule('push-dispatch', '*/5 * * * *', $$select private.dispatch_pushes()$$);
