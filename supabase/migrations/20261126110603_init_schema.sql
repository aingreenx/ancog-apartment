-- Initial schema for the apartment manager. See docs/database-design.md.
--
-- Ground rules enforced here:
--   * Money is bigint centavos and never negative.
--   * Money rows are never deleted. They are voided with a reason; only the void
--     (and a few workflow) columns may change after insert.
--   * Meter readings never go below the previous reading on the same meter.
--   * Balances are computed in views, never stored.
--   * Changes to money tables are written to audit_log.
--
-- Row-level security is enabled on every table with no policies yet, so nothing is
-- reachable through the API until the policies in the next migration (#6) are added.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('admin', 'tenant');
create type public.tenancy_status as enum ('active', 'ended');
create type public.reading_kind as enum (
  'regular', 'move_in', 'move_out', 'meter_change_old', 'meter_change_new'
);
create type public.charge_type as enum ('rent', 'electricity', 'deposit', 'custom', 'deduction');
create type public.payment_method as enum ('cash', 'gcash', 'bank', 'deposit');
create type public.payment_status as enum ('pending_review', 'confirmed', 'rejected');

-- "Today" for business rules is always Manila time, whatever the server's timezone.
create function public.app_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

-- ---------------------------------------------------------------------------
-- People and rooms
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'tenant',
  username text not null unique check (username = lower(username) and length(username) between 3 and 64),
  display_name text not null check (length(trim(display_name)) > 0),
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null check (length(trim(last_name)) > 0),
  phone_1 text not null check (length(trim(phone_1)) > 0),
  phone_2 text,
  address text,
  profile_id uuid unique references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  number smallint not null unique check (number between 1 and 13),
  base_rent_centavos bigint not null check (base_rent_centavos >= 0),
  meter_serial text,
  created_at timestamptz not null default now()
);

create table public.tenancies (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id),
  tenant_id uuid not null references public.tenants (id),
  start_date date not null,
  -- The move-in day. Days 29–31 move to the last day of shorter months (app logic).
  due_day smallint not null check (due_day between 1 and 31),
  -- Fixed for the whole stay, copied from the room's base rent at move-in.
  monthly_rent_centavos bigint not null check (monthly_rent_centavos >= 0),
  starting_kwh integer not null check (starting_kwh >= 0),
  deposit_required_centavos bigint not null default 0 check (deposit_required_centavos >= 0),
  advance_required_centavos bigint not null default 0 check (advance_required_centavos >= 0),
  status public.tenancy_status not null default 'active',
  end_date date,
  created_at timestamptz not null default now(),
  constraint tenancies_end_date_matches_status
    check ((status = 'ended') = (end_date is not null)),
  constraint tenancies_end_after_start check (end_date is null or end_date >= start_date)
);

-- One active stay per room. Room transfers are a move-out plus a new move-in.
create unique index tenancies_one_active_per_room
  on public.tenancies (room_id) where status = 'active';
create index tenancies_tenant_id_idx on public.tenancies (tenant_id);

create table public.tenancy_occupants (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  created_at timestamptz not null default now()
);
create index tenancy_occupants_tenancy_id_idx on public.tenancy_occupants (tenancy_id);

-- ---------------------------------------------------------------------------
-- Electricity
-- ---------------------------------------------------------------------------

create table public.electricity_rates (
  id uuid primary key default gen_random_uuid(),
  -- A reading uses the newest rate with effective_date on or before the reading date.
  effective_date date not null unique,
  rate_centavos_per_kwh bigint not null check (rate_centavos_per_kwh > 0),
  source_note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Same rule as rateForReading() in src/lib/billing/electricity.ts.
create function public.rate_for_date(p_date date)
returns public.electricity_rates
language sql
stable
set search_path = ''
as $$
  select r.*
  from public.electricity_rates r
  where r.effective_date <= p_date
  order by r.effective_date desc
  limit 1;
$$;

create table public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id),
  reading_date date not null,
  -- Whole kWh: the meter's black digits only.
  reading_kwh integer not null check (reading_kwh >= 0),
  photo_path text,
  kind public.reading_kind not null default 'regular',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index meter_readings_tenancy_date_idx on public.meter_readings (tenancy_id, reading_date);

-- A meter belongs to a room, so "the same meter" is every reading for the room, across
-- stays, until a meter change. A meter_change_new reading starts a new meter and may be
-- lower than the one before it. On the same date, a meter_change_old reading comes
-- before other readings and a meter_change_new reading after them.
create function public.check_meter_reading_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_prev record;
  v_next record;
begin
  select t.room_id into v_room_id from public.tenancies t where t.id = new.tenancy_id;

  select mr.reading_kwh, mr.kind into v_prev
  from public.meter_readings mr
  join public.tenancies t on t.id = mr.tenancy_id
  where t.room_id = v_room_id
    and mr.id <> new.id
    and mr.reading_date <= new.reading_date
  order by mr.reading_date desc, case mr.kind when 'meter_change_old' then 0 when 'meter_change_new' then 2 else 1 end desc, mr.created_at desc
  limit 1;

  if found and new.kind <> 'meter_change_new' and new.reading_kwh < v_prev.reading_kwh then
    raise exception 'Reading % kWh is lower than the previous reading % kWh on this meter',
      new.reading_kwh, v_prev.reading_kwh
      using errcode = 'check_violation';
  end if;

  select mr.reading_kwh, mr.kind into v_next
  from public.meter_readings mr
  join public.tenancies t on t.id = mr.tenancy_id
  where t.room_id = v_room_id
    and mr.id <> new.id
    and mr.reading_date > new.reading_date
  order by mr.reading_date asc, case mr.kind when 'meter_change_old' then 0 when 'meter_change_new' then 2 else 1 end asc, mr.created_at asc
  limit 1;

  if found and v_next.kind <> 'meter_change_new' and v_next.reading_kwh < new.reading_kwh then
    raise exception 'Reading % kWh is higher than the later reading % kWh on this meter',
      new.reading_kwh, v_next.reading_kwh
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger meter_readings_check_order
  before insert or update of reading_kwh, reading_date, tenancy_id, kind on public.meter_readings
  for each row execute function public.check_meter_reading_order();

-- ---------------------------------------------------------------------------
-- Charges and payments
-- ---------------------------------------------------------------------------

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id),
  type public.charge_type not null,
  description text not null check (length(trim(description)) > 0),
  period_start date,
  period_end date,
  due_date date not null,
  amount_centavos bigint not null check (amount_centavos >= 0),
  -- Electricity snapshot: stored at billing time, never recomputed.
  meter_reading_id uuid unique references public.meter_readings (id),
  prev_kwh integer check (prev_kwh >= 0),
  curr_kwh integer check (curr_kwh >= 0),
  kwh_used integer check (kwh_used >= 0),
  rate_centavos_per_kwh bigint check (rate_centavos_per_kwh > 0),
  voided_at timestamptz,
  void_reason text,
  voided_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint charges_period_order check (period_end is null or period_start is null or period_end >= period_start),
  constraint charges_rent_has_period check (type <> 'rent' or period_start is not null),
  constraint charges_electricity_snapshot check (
    type <> 'electricity' or (
      prev_kwh is not null and curr_kwh is not null and kwh_used is not null
      and rate_centavos_per_kwh is not null
      and curr_kwh >= prev_kwh and kwh_used = curr_kwh - prev_kwh
    )
  ),
  constraint charges_void_has_reason check (
    (voided_at is null and void_reason is null and voided_by is null)
    or (voided_at is not null and void_reason is not null and length(trim(void_reason)) > 0)
  )
);
create index charges_tenancy_due_idx on public.charges (tenancy_id, due_date);

-- One rent charge per stay per period (voided ones don't count). Lets the daily job
-- run twice safely.
create unique index charges_one_rent_per_period
  on public.charges (tenancy_id, period_start)
  where type = 'rent' and voided_at is null;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id),
  -- The date it was actually paid, not the date it was entered.
  paid_on date not null,
  amount_centavos bigint not null check (amount_centavos > 0),
  method public.payment_method not null,
  reference_no text,
  proof_path text,
  status public.payment_status not null default 'pending_review',
  submitted_by uuid references public.profiles (id),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  voided_at timestamptz,
  void_reason text,
  voided_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint payments_void_has_reason check (
    (voided_at is null and void_reason is null and voided_by is null)
    or (voided_at is not null and void_reason is not null and length(trim(void_reason)) > 0)
  )
);
create index payments_tenancy_paid_on_idx on public.payments (tenancy_id, paid_on);
create index payments_pending_idx on public.payments (created_at) where status = 'pending_review';

-- Unallocated confirmed payment money is credit on the stay.
create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id),
  charge_id uuid not null references public.charges (id),
  amount_centavos bigint not null check (amount_centavos > 0),
  voided_at timestamptz,
  void_reason text,
  voided_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint payment_allocations_void_has_reason check (
    (voided_at is null and void_reason is null and voided_by is null)
    or (voided_at is not null and void_reason is not null and length(trim(void_reason)) > 0)
  )
);
create index payment_allocations_payment_idx on public.payment_allocations (payment_id);
create index payment_allocations_charge_idx on public.payment_allocations (charge_id);

-- An allocation must link a payment and a charge of the same stay, and can't
-- over-allocate either side.
create function public.check_payment_allocation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_charge public.charges;
  v_payment_used bigint;
  v_charge_paid bigint;
begin
  if new.voided_at is not null then
    return new;
  end if;

  select * into v_payment from public.payments where id = new.payment_id for update;
  select * into v_charge from public.charges where id = new.charge_id for update;

  if v_payment.tenancy_id <> v_charge.tenancy_id then
    raise exception 'Payment and charge belong to different stays'
      using errcode = 'check_violation';
  end if;
  if v_payment.voided_at is not null or v_charge.voided_at is not null then
    raise exception 'Cannot allocate to or from a voided row'
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(a.amount_centavos), 0) into v_payment_used
  from public.payment_allocations a
  where a.payment_id = new.payment_id and a.voided_at is null and a.id <> new.id;

  if v_payment_used + new.amount_centavos > v_payment.amount_centavos then
    raise exception 'Allocations exceed the payment amount'
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(a.amount_centavos), 0) into v_charge_paid
  from public.payment_allocations a
  where a.charge_id = new.charge_id and a.voided_at is null and a.id <> new.id;

  if v_charge_paid + new.amount_centavos > v_charge.amount_centavos then
    raise exception 'Allocations exceed the charge amount'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger payment_allocations_check
  before insert or update on public.payment_allocations
  for each row execute function public.check_payment_allocation();

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no bigint generated always as identity unique,
  payment_id uuid not null unique references public.payments (id),
  received_by uuid not null references public.profiles (id),
  pdf_path text,
  issued_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  voided_by uuid references public.profiles (id),
  constraint receipts_void_has_reason check (
    (voided_at is null and void_reason is null and voided_by is null)
    or (voided_at is not null and void_reason is not null and length(trim(void_reason)) > 0)
  )
);

create table public.move_out_settlements (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null unique references public.tenancies (id),
  settled_on date not null,
  deposit_held_centavos bigint not null check (deposit_held_centavos >= 0),
  deductions_centavos bigint not null check (deductions_centavos >= 0),
  applied_to_balance_centavos bigint not null check (applied_to_balance_centavos >= 0),
  refund_centavos bigint not null check (refund_centavos >= 0),
  remaining_owed_centavos bigint not null check (remaining_owed_centavos >= 0),
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  -- The deposit is used up by deductions and unpaid balance; any rest is refunded.
  constraint move_out_deposit_adds_up check (
    deductions_centavos + applied_to_balance_centavos + refund_centavos <= deposit_held_centavos
  ),
  constraint move_out_refund_or_owed check (refund_centavos = 0 or remaining_owed_centavos = 0)
);

-- ---------------------------------------------------------------------------
-- Notifications and settings
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_unread_idx on public.notifications (profile_id, created_at desc)
  where read_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

-- Single-row table.
create table public.app_settings (
  id boolean primary key default true check (id),
  gcash_name text,
  gcash_number text,
  gcash_qr_path text,
  apartment_address text,
  receipt_signature_path text,
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;

-- ---------------------------------------------------------------------------
-- Audit log and money-row protection
-- ---------------------------------------------------------------------------

-- A charge or payment can only be voided once its allocations are voided, so the
-- money moves back to credit / owed instead of silently disappearing.
-- tg_argv[0] is the allocation column that points at this table.
create function public.check_void_without_allocations()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_active boolean;
begin
  if old.voided_at is null and new.voided_at is not null then
    execute format(
      'select exists (select 1 from public.payment_allocations where %I = $1 and voided_at is null)',
      tg_argv[0]
    ) into v_active using new.id;
    if v_active then
      raise exception 'Void the allocations on this % row first', tg_table_name
        using errcode = 'restrict_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger charges_void_check before update of voided_at on public.charges
  for each row execute function public.check_void_without_allocations('charge_id');
create trigger payments_void_check before update of voided_at on public.payments
  for each row execute function public.check_void_without_allocations('payment_id');

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor uuid default auth.uid(),
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

create function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (table_name, row_id, action, before, after)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- Money rows are never deleted.
create function public.prevent_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are never deleted; void them instead', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

-- Money rows are never edited, except the columns passed as trigger arguments
-- (the void columns and workflow columns). A voided row can't change at all.
create function public.restrict_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
begin
  if v_old ? 'voided_at' and v_old ->> 'voided_at' is not null then
    raise exception 'Voided % rows cannot be changed', tg_table_name
      using errcode = 'restrict_violation';
  end if;
  if (v_old - tg_argv) is distinct from (v_new - tg_argv) then
    raise exception '% rows are never edited; void and add a corrected row instead', tg_table_name
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger charges_no_delete before delete on public.charges
  for each row execute function public.prevent_delete();
create trigger charges_restrict_update before update on public.charges
  for each row execute function public.restrict_update('voided_at', 'void_reason', 'voided_by');

create trigger payments_no_delete before delete on public.payments
  for each row execute function public.prevent_delete();
create trigger payments_restrict_update before update on public.payments
  for each row execute function public.restrict_update(
    'status', 'reviewed_by', 'reviewed_at', 'review_note', 'proof_path',
    'voided_at', 'void_reason', 'voided_by'
  );

create trigger payment_allocations_no_delete before delete on public.payment_allocations
  for each row execute function public.prevent_delete();
create trigger payment_allocations_restrict_update before update on public.payment_allocations
  for each row execute function public.restrict_update('voided_at', 'void_reason', 'voided_by');

create trigger receipts_no_delete before delete on public.receipts
  for each row execute function public.prevent_delete();
create trigger receipts_restrict_update before update on public.receipts
  for each row execute function public.restrict_update('pdf_path', 'voided_at', 'void_reason', 'voided_by');

create trigger move_out_settlements_no_delete before delete on public.move_out_settlements
  for each row execute function public.prevent_delete();
create trigger move_out_settlements_restrict_update before update on public.move_out_settlements
  for each row execute function public.restrict_update('notes');

-- Audit every change to money and billing tables.
create trigger charges_audit after insert or update or delete on public.charges
  for each row execute function public.write_audit_log();
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function public.write_audit_log();
create trigger payment_allocations_audit after insert or update or delete on public.payment_allocations
  for each row execute function public.write_audit_log();
create trigger receipts_audit after insert or update or delete on public.receipts
  for each row execute function public.write_audit_log();
create trigger move_out_settlements_audit after insert or update or delete on public.move_out_settlements
  for each row execute function public.write_audit_log();
create trigger electricity_rates_audit after insert or update or delete on public.electricity_rates
  for each row execute function public.write_audit_log();
create trigger meter_readings_audit after insert or update or delete on public.meter_readings
  for each row execute function public.write_audit_log();
create trigger tenancies_audit after insert or update or delete on public.tenancies
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Views (security_invoker so the caller's row-level security applies)
-- ---------------------------------------------------------------------------

-- Paid = allocations from confirmed, non-voided payments.
create view public.charge_balances
with (security_invoker = true)
as
with paid as (
  select a.charge_id, sum(a.amount_centavos) as paid_centavos
  from public.payment_allocations a
  join public.payments p on p.id = a.payment_id
  where a.voided_at is null and p.voided_at is null and p.status = 'confirmed'
  group by a.charge_id
)
select
  c.id as charge_id,
  c.tenancy_id,
  c.type,
  c.description,
  c.period_start,
  c.period_end,
  c.due_date,
  c.amount_centavos,
  coalesce(pd.paid_centavos, 0)::bigint as paid_centavos,
  case when c.voided_at is not null then 0
       else c.amount_centavos - coalesce(pd.paid_centavos, 0) end::bigint as owed_centavos,
  case
    when c.voided_at is not null then 'void'
    when c.amount_centavos - coalesce(pd.paid_centavos, 0) <= 0 then 'paid'
    when c.due_date < public.app_today() then 'overdue'
    when coalesce(pd.paid_centavos, 0) > 0 then 'partial'
    else 'unpaid'
  end as status,
  case
    when c.voided_at is null
     and c.amount_centavos - coalesce(pd.paid_centavos, 0) > 0
     and c.due_date < public.app_today()
    then public.app_today() - c.due_date
    else 0
  end as days_overdue,
  c.voided_at
from public.charges c
left join paid pd on pd.charge_id = c.id;

-- Balance = owed on charges minus unallocated credit.
create view public.tenancy_balances
with (security_invoker = true)
as
with charge_totals as (
  select
    cb.tenancy_id,
    sum(cb.amount_centavos) filter (where cb.status <> 'void') as charged_centavos,
    sum(cb.paid_centavos) filter (where cb.status <> 'void') as paid_centavos,
    sum(cb.owed_centavos) as owed_centavos,
    sum(cb.owed_centavos) filter (where cb.status = 'overdue') as overdue_centavos,
    max(cb.days_overdue) as max_days_overdue
  from public.charge_balances cb
  group by cb.tenancy_id
),
payment_totals as (
  select
    p.tenancy_id,
    sum(p.amount_centavos) as received_centavos
  from public.payments p
  where p.status = 'confirmed' and p.voided_at is null
  group by p.tenancy_id
),
allocated as (
  select p.tenancy_id, sum(a.amount_centavos) as allocated_centavos
  from public.payment_allocations a
  join public.payments p on p.id = a.payment_id
  where a.voided_at is null and p.voided_at is null and p.status = 'confirmed'
  group by p.tenancy_id
)
select
  t.id as tenancy_id,
  t.room_id,
  t.tenant_id,
  t.status,
  coalesce(ct.charged_centavos, 0)::bigint as charged_centavos,
  coalesce(ct.paid_centavos, 0)::bigint as paid_centavos,
  coalesce(ct.owed_centavos, 0)::bigint as owed_centavos,
  (coalesce(pt.received_centavos, 0) - coalesce(al.allocated_centavos, 0))::bigint as credit_centavos,
  (coalesce(ct.owed_centavos, 0)
    - (coalesce(pt.received_centavos, 0) - coalesce(al.allocated_centavos, 0)))::bigint as balance_centavos,
  coalesce(ct.overdue_centavos, 0)::bigint as overdue_centavos,
  coalesce(ct.max_days_overdue, 0) as max_days_overdue
from public.tenancies t
left join charge_totals ct on ct.tenancy_id = t.id
left join payment_totals pt on pt.tenancy_id = t.id
left join allocated al on al.tenancy_id = t.id;

-- Billed by due month, collected by the month it was actually paid.
-- Deposit-method payments (deposit applied at move-out) aren't new money, so they're
-- excluded from collections.
create view public.monthly_summary
with (security_invoker = true)
as
with billed as (
  select
    date_trunc('month', c.due_date)::date as month,
    sum(c.amount_centavos) filter (where c.type = 'rent') as rent_billed,
    sum(c.amount_centavos) filter (where c.type = 'electricity') as electricity_billed,
    sum(c.amount_centavos) filter (where c.type not in ('rent', 'electricity')) as other_billed
  from public.charges c
  where c.voided_at is null
  group by 1
),
collected as (
  select
    date_trunc('month', p.paid_on)::date as month,
    sum(p.amount_centavos) filter (where p.method = 'cash') as cash_collected,
    sum(p.amount_centavos) filter (where p.method = 'gcash') as gcash_collected,
    sum(p.amount_centavos) filter (where p.method = 'bank') as bank_collected
  from public.payments p
  where p.status = 'confirmed' and p.voided_at is null and p.method <> 'deposit'
  group by 1
)
select
  m.month,
  coalesce(b.rent_billed, 0)::bigint as rent_billed_centavos,
  coalesce(b.electricity_billed, 0)::bigint as electricity_billed_centavos,
  coalesce(b.other_billed, 0)::bigint as other_billed_centavos,
  coalesce(c.cash_collected, 0)::bigint as cash_collected_centavos,
  coalesce(c.gcash_collected, 0)::bigint as gcash_collected_centavos,
  coalesce(c.bank_collected, 0)::bigint as bank_collected_centavos,
  (coalesce(c.cash_collected, 0) + coalesce(c.gcash_collected, 0)
    + coalesce(c.bank_collected, 0))::bigint as total_collected_centavos
from (select month from billed union select month from collected) m
left join billed b on b.month = m.month
left join collected c on c.month = m.month;

-- ---------------------------------------------------------------------------
-- Row-level security: on everywhere, policies come in #6.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.rooms enable row level security;
alter table public.tenancies enable row level security;
alter table public.tenancy_occupants enable row level security;
alter table public.electricity_rates enable row level security;
alter table public.meter_readings enable row level security;
alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.receipts enable row level security;
alter table public.move_out_settlements enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_log enable row level security;
