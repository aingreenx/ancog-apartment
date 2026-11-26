-- Local development seed. Runs after the migrations on `npm run db:reset`.
--
-- NEVER put real tenant names, phone numbers or addresses here. Everyone below is made up.
-- The room 3 stay reuses only the *numbers* from a real notebook page (meter 9,433 → 10,838).
--
-- Local logins (local only, never use these anywhere else):
--   admin1@ancog.local / password123          (admin)
--   admin2@ancog.local / password123          (admin)
--   room3-frannie-4612 / password123          (tenant, room 3)
--   room5-bert-2231    / password123          (tenant, room 5)
--   room8-carla-7780   / password123          (tenant, room 8, must change password)
--   room12-dino-5093   / password123          (tenant, room 12)
-- Tenant usernames sign in as <username>@tenants.ancog.local behind the scenes.

-- ---------------------------------------------------------------------------
-- Rooms: ₱2,500 for rooms 3, 6, 7, 8, 9; ₱3,500 for the rest.
-- ---------------------------------------------------------------------------
insert into public.rooms (number, base_rent_centavos, meter_serial)
select n, case when n in (3, 6, 7, 8, 9) then 250000 else 350000 end, format('DEMO-%s', lpad(n::text, 4, '0'))
from generate_series(1, 13) as n;

-- ---------------------------------------------------------------------------
-- Auth users + profiles
-- ---------------------------------------------------------------------------
create function pg_temp.add_user(
  p_id uuid, p_email text, p_role public.user_role, p_username text, p_display_name text,
  p_must_change boolean default false
) returns void language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (p_id::text, p_id, json_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());
  insert into public.profiles (id, role, username, display_name, must_change_password)
  values (p_id, p_role, p_username, p_display_name, p_must_change);
end $$;

select pg_temp.add_user('11111111-0000-0000-0000-000000000001', 'admin1@ancog.local', 'admin', 'admin1', 'Admin One');
select pg_temp.add_user('11111111-0000-0000-0000-000000000002', 'admin2@ancog.local', 'admin', 'admin2', 'Admin Two');
select pg_temp.add_user('22222222-0000-0000-0000-000000000003', 'room3-frannie-4612@tenants.ancog.local', 'tenant', 'room3-frannie-4612', 'Frannie Reyes');
select pg_temp.add_user('22222222-0000-0000-0000-000000000005', 'room5-bert-2231@tenants.ancog.local', 'tenant', 'room5-bert-2231', 'Bert Lopez');
select pg_temp.add_user('22222222-0000-0000-0000-000000000008', 'room8-carla-7780@tenants.ancog.local', 'tenant', 'room8-carla-7780', 'Carla Mendoza', true);
select pg_temp.add_user('22222222-0000-0000-0000-000000000012', 'room12-dino-5093@tenants.ancog.local', 'tenant', 'room12-dino-5093', 'Dino Ramos');

-- ---------------------------------------------------------------------------
-- Electricity rates (₱12, ₱12, ₱13.50, ₱14, ₱15, ₱15)
-- ---------------------------------------------------------------------------
insert into public.electricity_rates (effective_date, rate_centavos_per_kwh, source_note, created_by) values
  ('2026-06-01', 1200, 'Demo: June utility bill', '11111111-0000-0000-0000-000000000001'),
  ('2026-07-01', 1200, 'Demo: July utility bill', '11111111-0000-0000-0000-000000000001'),
  ('2026-08-01', 1350, 'Demo: August utility bill', '11111111-0000-0000-0000-000000000001'),
  ('2026-09-01', 1400, 'Demo: September utility bill', '11111111-0000-0000-0000-000000000001'),
  ('2026-10-01', 1500, 'Demo: October utility bill', '11111111-0000-0000-0000-000000000001'),
  ('2026-11-01', 1500, 'Demo: November utility bill', '11111111-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Tenants and stays
-- ---------------------------------------------------------------------------
insert into public.tenants (id, first_name, last_name, phone_1, phone_2, address, profile_id) values
  ('33333333-0000-0000-0000-000000000003', 'Frannie', 'Reyes', '0900 000 0003', null, 'Demo Address 3', '22222222-0000-0000-0000-000000000003'),
  ('33333333-0000-0000-0000-000000000005', 'Bert', 'Lopez', '0900 000 0005', '0900 100 0005', 'Demo Address 5', '22222222-0000-0000-0000-000000000005'),
  ('33333333-0000-0000-0000-000000000008', 'Carla', 'Mendoza', '0900 000 0008', null, null, '22222222-0000-0000-0000-000000000008'),
  ('33333333-0000-0000-0000-000000000012', 'Dino', 'Ramos', '0900 000 0012', null, 'Demo Address 12', '22222222-0000-0000-0000-000000000012');

insert into public.tenancies (id, room_id, tenant_id, start_date, due_day, monthly_rent_centavos, starting_kwh,
                              deposit_required_centavos, advance_required_centavos)
select v.id, r.id, v.tenant_id, v.start_date, extract(day from v.start_date)::smallint, r.base_rent_centavos,
       v.starting_kwh, r.base_rent_centavos, r.base_rent_centavos
from (values
  ('44444444-0000-0000-0000-000000000003'::uuid, 3, '33333333-0000-0000-0000-000000000003'::uuid, '2026-05-14'::date, 9433),
  ('44444444-0000-0000-0000-000000000005'::uuid, 5, '33333333-0000-0000-0000-000000000005'::uuid, '2026-08-05'::date, 1200),
  ('44444444-0000-0000-0000-000000000008'::uuid, 8, '33333333-0000-0000-0000-000000000008'::uuid, '2026-10-20'::date, 500),
  ('44444444-0000-0000-0000-000000000012'::uuid, 12, '33333333-0000-0000-0000-000000000012'::uuid, '2026-11-01'::date, 3000)
) as v(id, room_number, tenant_id, start_date, starting_kwh)
join public.rooms r on r.number = v.room_number;

insert into public.tenancy_occupants (tenancy_id, name, phone) values
  ('44444444-0000-0000-0000-000000000005', 'Bea Lopez', null),
  ('44444444-0000-0000-0000-000000000012', 'Dana Ramos', '0900 000 1212');

-- ---------------------------------------------------------------------------
-- Charges: deposit, monthly rent (paid in advance, due on the move-in day) up to
-- 2026-11-26, and electricity from readings.
-- ---------------------------------------------------------------------------
insert into public.charges (tenancy_id, type, description, due_date, amount_centavos, created_by)
select id, 'deposit', 'Deposit', start_date, deposit_required_centavos, '11111111-0000-0000-0000-000000000001'
from public.tenancies;

insert into public.charges (tenancy_id, type, description, period_start, period_end, due_date, amount_centavos, created_by)
select t.id, 'rent', 'Rent ' || to_char(m, 'Mon FMDD') || ' – ' || to_char(m + interval '1 month' - interval '1 day', 'Mon FMDD, YYYY'),
       m::date, (m + interval '1 month' - interval '1 day')::date, m::date, t.monthly_rent_centavos,
       '11111111-0000-0000-0000-000000000001'
from public.tenancies t
cross join lateral generate_series(t.start_date, '2026-11-26'::date, interval '1 month') as m;

-- Readings: move-in plus monthly readings. Each regular reading creates an electricity
-- charge with the rate in effect on the reading date (same rule as rateForReading).
create function pg_temp.read_meter(p_tenancy uuid, p_date date, p_kwh integer, p_kind public.reading_kind default 'regular')
returns void language plpgsql as $$
declare
  v_reading_id uuid;
  v_prev integer;
  v_rate bigint;
begin
  select reading_kwh into v_prev from public.meter_readings
  where tenancy_id = p_tenancy order by reading_date desc, created_at desc limit 1;

  insert into public.meter_readings (tenancy_id, reading_date, reading_kwh, kind, created_by)
  values (p_tenancy, p_date, p_kwh, p_kind, '11111111-0000-0000-0000-000000000001')
  returning id into v_reading_id;

  if p_kind = 'regular' then
    select rate_centavos_per_kwh into v_rate from public.rate_for_date(p_date);
    insert into public.charges (tenancy_id, type, description, due_date, amount_centavos, meter_reading_id,
                                prev_kwh, curr_kwh, kwh_used, rate_centavos_per_kwh, created_by)
    values (p_tenancy, 'electricity', 'Electricity ' || to_char(p_date, 'Mon FMDD, YYYY'), p_date,
            round((p_kwh - v_prev) * v_rate / 100.0) * 100, v_reading_id,
            v_prev, p_kwh, p_kwh - v_prev, v_rate, '11111111-0000-0000-0000-000000000001');
  end if;
end $$;

-- Room 3: the notebook page numbers. Bills: 3,972 · 3,048 · 3,483 · 3,206 · 4,050 · 945
select pg_temp.read_meter('44444444-0000-0000-0000-000000000003', '2026-05-14', 9433, 'move_in');
select pg_temp.read_meter('44444444-0000-0000-0000-000000000003', '2026-06-14', 9764);
select pg_temp.read_meter('44444444-0000-0000-0000-000000000003', '2026-07-14', 10018);
select pg_temp.read_meter('44444444-0000-0000-0000-000000000003', '2026-08-14', 10276);
select pg_temp.read_meter('44444444-0000-0000-0000-000000000003', '2026-09-14', 10505);
select pg_temp.read_meter('44444444-0000-0000-0000-000000000003', '2026-10-14', 10775);
select pg_temp.read_meter('44444444-0000-0000-0000-000000000003', '2026-11-14', 10838);

select pg_temp.read_meter('44444444-0000-0000-0000-000000000005', '2026-08-05', 1200, 'move_in');
select pg_temp.read_meter('44444444-0000-0000-0000-000000000005', '2026-09-05', 1410);
select pg_temp.read_meter('44444444-0000-0000-0000-000000000005', '2026-10-05', 1598);
select pg_temp.read_meter('44444444-0000-0000-0000-000000000005', '2026-11-05', 1803);

select pg_temp.read_meter('44444444-0000-0000-0000-000000000008', '2026-10-20', 500, 'move_in');
select pg_temp.read_meter('44444444-0000-0000-0000-000000000008', '2026-11-20', 642);

select pg_temp.read_meter('44444444-0000-0000-0000-000000000012', '2026-11-01', 3000, 'move_in');

-- A custom charge.
insert into public.charges (tenancy_id, type, description, due_date, amount_centavos, created_by) values
  ('44444444-0000-0000-0000-000000000005', 'custom', 'Replacement key', '2026-10-05', 15000, '11111111-0000-0000-0000-000000000002');

-- ---------------------------------------------------------------------------
-- Payments. pay() records a payment and allocates it to charges found by
-- (type, due_date). Amounts are in pesos for readability.
-- ---------------------------------------------------------------------------
create function pg_temp.pay(
  p_tenancy uuid, p_paid_on date, p_method public.payment_method, p_allocations jsonb,
  p_extra_pesos integer default 0, p_reference text default null,
  p_status public.payment_status default 'confirmed'
) returns void language plpgsql as $$
declare
  v_payment_id uuid;
  v_total bigint;
  a jsonb;
begin
  select coalesce(sum((x ->> 'pesos')::bigint * 100), 0) + p_extra_pesos * 100 into v_total
  from jsonb_array_elements(p_allocations) x;

  insert into public.payments (tenancy_id, paid_on, amount_centavos, method, reference_no, status,
                               submitted_by, reviewed_by, reviewed_at)
  values (p_tenancy, p_paid_on, v_total, p_method, p_reference, p_status,
          '11111111-0000-0000-0000-000000000001',
          case when p_status = 'confirmed' then '11111111-0000-0000-0000-000000000001'::uuid end,
          case when p_status = 'confirmed' then p_paid_on::timestamptz end)
  returning id into v_payment_id;

  if p_status = 'confirmed' then
    for a in select * from jsonb_array_elements(p_allocations) loop
      insert into public.payment_allocations (payment_id, charge_id, amount_centavos, created_by)
      select v_payment_id, c.id, (a ->> 'pesos')::bigint * 100, '11111111-0000-0000-0000-000000000001'
      from public.charges c
      where c.tenancy_id = p_tenancy and c.type = (a ->> 'type')::public.charge_type
        and c.due_date = (a ->> 'due')::date and c.voided_at is null;
      if not found then
        raise exception 'seed: no % charge due % for %', a ->> 'type', a ->> 'due', p_tenancy;
      end if;
    end loop;
  end if;
end $$;

-- Room 3 (Frannie): pays rent on time; electricity sometimes in parts, like the notebook
-- (3,972 paid as 2,000 + 1,972; 945 paid 500 so far, 445 still owed).
select pg_temp.pay('44444444-0000-0000-0000-000000000003', '2026-05-14', 'cash',
  '[{"type":"deposit","due":"2026-05-14","pesos":2500},{"type":"rent","due":"2026-05-14","pesos":2500}]');
select pg_temp.pay('44444444-0000-0000-0000-000000000003', '2026-06-14', 'cash',
  '[{"type":"rent","due":"2026-06-14","pesos":2500},{"type":"electricity","due":"2026-06-14","pesos":2000}]');
select pg_temp.pay('44444444-0000-0000-0000-000000000003', '2026-07-14', 'cash',
  '[{"type":"electricity","due":"2026-06-14","pesos":1972},{"type":"rent","due":"2026-07-14","pesos":2500},{"type":"electricity","due":"2026-07-14","pesos":3048}]');
select pg_temp.pay('44444444-0000-0000-0000-000000000003', '2026-08-15', 'gcash',
  '[{"type":"rent","due":"2026-08-14","pesos":2500},{"type":"electricity","due":"2026-08-14","pesos":3483}]', 0, 'DEMO-GC-0815');
select pg_temp.pay('44444444-0000-0000-0000-000000000003', '2026-09-14', 'cash',
  '[{"type":"rent","due":"2026-09-14","pesos":2500},{"type":"electricity","due":"2026-09-14","pesos":3206}]');
select pg_temp.pay('44444444-0000-0000-0000-000000000003', '2026-10-16', 'gcash',
  '[{"type":"rent","due":"2026-10-14","pesos":2500},{"type":"electricity","due":"2026-10-14","pesos":4050}]', 0, 'DEMO-GC-1016');
select pg_temp.pay('44444444-0000-0000-0000-000000000003', '2026-11-14', 'cash',
  '[{"type":"rent","due":"2026-11-14","pesos":2500},{"type":"electricity","due":"2026-11-14","pesos":500}]');

-- Room 5 (Bert): behind. November rent and electricity unpaid → overdue.
select pg_temp.pay('44444444-0000-0000-0000-000000000005', '2026-08-05', 'cash',
  '[{"type":"deposit","due":"2026-08-05","pesos":3500},{"type":"rent","due":"2026-08-05","pesos":3500}]');
select pg_temp.pay('44444444-0000-0000-0000-000000000005', '2026-09-06', 'cash',
  '[{"type":"rent","due":"2026-09-05","pesos":3500},{"type":"electricity","due":"2026-09-05","pesos":2940}]');
select pg_temp.pay('44444444-0000-0000-0000-000000000005', '2026-10-10', 'gcash',
  '[{"type":"rent","due":"2026-10-05","pesos":3500},{"type":"electricity","due":"2026-10-05","pesos":1500}]', 0, 'DEMO-GC-1010');

-- Room 8 (Carla): deposit paid in parts after move-in; a GCash payment waiting for review.
select pg_temp.pay('44444444-0000-0000-0000-000000000008', '2026-10-20', 'cash',
  '[{"type":"rent","due":"2026-10-20","pesos":2500},{"type":"deposit","due":"2026-10-20","pesos":1000}]');
select pg_temp.pay('44444444-0000-0000-0000-000000000008', '2026-11-21', 'gcash',
  '[{"type":"rent","due":"2026-11-20","pesos":2500}]', 0, 'DEMO-GC-1121', 'pending_review');

-- Room 12 (Dino): paid deposit + advance, with ₱500 extra kept as credit.
select pg_temp.pay('44444444-0000-0000-0000-000000000012', '2026-11-01', 'cash',
  '[{"type":"deposit","due":"2026-11-01","pesos":3500},{"type":"rent","due":"2026-11-01","pesos":3500}]', 500);

-- ---------------------------------------------------------------------------
-- Settings and a notification
-- ---------------------------------------------------------------------------
update public.app_settings
set gcash_name = 'DEMO ACCOUNT', gcash_number = '0900 000 0000', apartment_address = 'Demo Apartment, Demo City';

insert into public.notifications (profile_id, type, title, body, link) values
  ('22222222-0000-0000-0000-000000000005', 'overdue', 'Rent is overdue', 'Your November rent is overdue.', '/portal');
