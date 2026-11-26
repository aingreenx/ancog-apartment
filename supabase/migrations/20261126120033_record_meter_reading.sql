-- Record a meter reading and its electricity bill in one step (#15).
--
--   Bill = (current − previous kWh) × rate, rounded to the nearest peso.
--   Rate = newest rate entered on or before the reading date (rate_for_date).
--   The bill keeps a snapshot (prev, curr, kWh used, rate) and is never recomputed.
--
-- Meter change: pass the OLD meter's final reading as p_reading_kwh and the NEW meter's
-- starting reading as p_new_meter_kwh. The old meter's usage is billed; the new meter
-- starts from its own reading (which may be lower).
--
-- Same rule as computeElectricityBill() / rateForReading() in src/lib/billing/electricity.ts,
-- which the form uses for its preview.

create function public.record_meter_reading(
  p_tenancy_id uuid,
  p_reading_date date,
  p_reading_kwh integer,
  p_photo_path text default null,
  p_new_meter_kwh integer default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_tenancy public.tenancies;
  v_prev public.meter_readings;
  v_rate public.electricity_rates;
  v_kwh_used integer;
  v_amount bigint;
  v_reading_id uuid;
  v_charge_id uuid;
  v_meter_change boolean := p_new_meter_kwh is not null;
begin
  if not public.is_admin() then
    raise exception 'Only admins can record readings' using errcode = 'insufficient_privilege';
  end if;

  select * into v_tenancy from public.tenancies where id = p_tenancy_id for update;
  if not found or v_tenancy.status <> 'active' then
    raise exception 'This stay is not active' using errcode = 'no_data_found';
  end if;

  if p_photo_path is not null and p_photo_path not like p_tenancy_id::text || '/%' then
    raise exception 'Photo must be stored under this stay''s folder' using errcode = 'check_violation';
  end if;

  -- The previous reading on this stay (move-in reading at the latest). Same-day order:
  -- meter_change_old < others < meter_change_new.
  select * into v_prev
  from public.meter_readings mr
  where mr.tenancy_id = p_tenancy_id
  order by mr.reading_date desc,
           case mr.kind when 'meter_change_old' then 0 when 'meter_change_new' then 2 else 1 end desc,
           mr.created_at desc
  limit 1;
  if not found then
    raise exception 'This stay has no move-in reading' using errcode = 'no_data_found';
  end if;

  if p_reading_date < v_prev.reading_date then
    raise exception 'The reading date can''t be before the previous reading (%)', v_prev.reading_date
      using errcode = 'check_violation';
  end if;
  if p_reading_kwh < v_prev.reading_kwh then
    raise exception 'Reading % kWh is lower than the previous reading % kWh', p_reading_kwh, v_prev.reading_kwh
      using errcode = 'check_violation';
  end if;

  v_rate := public.rate_for_date(p_reading_date);
  if v_rate.id is null then
    raise exception 'No electricity rate entered on or before %', p_reading_date
      using errcode = 'no_data_found';
  end if;

  v_kwh_used := p_reading_kwh - v_prev.reading_kwh;
  v_amount := round(v_kwh_used * v_rate.rate_centavos_per_kwh / 100.0) * 100;

  insert into public.meter_readings (tenancy_id, reading_date, reading_kwh, photo_path, kind, created_by)
  values (p_tenancy_id, p_reading_date, p_reading_kwh, p_photo_path,
          case when v_meter_change then 'meter_change_old' else 'regular' end::public.reading_kind, v_admin)
  returning id into v_reading_id;

  insert into public.charges (tenancy_id, type, description, due_date, amount_centavos, meter_reading_id,
                              prev_kwh, curr_kwh, kwh_used, rate_centavos_per_kwh, created_by)
  values (p_tenancy_id, 'electricity',
          'Electricity ' || case when v_meter_change then '(old meter) ' else '' end
            || to_char(p_reading_date, 'Mon FMDD, YYYY'),
          p_reading_date, v_amount, v_reading_id,
          v_prev.reading_kwh, p_reading_kwh, v_kwh_used, v_rate.rate_centavos_per_kwh, v_admin)
  returning id into v_charge_id;

  if v_meter_change then
    if p_new_meter_kwh < 0 then
      raise exception 'The new meter reading can''t be negative' using errcode = 'check_violation';
    end if;
    insert into public.meter_readings (tenancy_id, reading_date, reading_kwh, kind, created_by)
    values (p_tenancy_id, p_reading_date, p_new_meter_kwh, 'meter_change_new', v_admin);
  end if;

  return jsonb_build_object(
    'reading_id', v_reading_id,
    'charge_id', v_charge_id,
    'prev_kwh', v_prev.reading_kwh,
    'kwh_used', v_kwh_used,
    'rate_centavos_per_kwh', v_rate.rate_centavos_per_kwh,
    'amount_centavos', v_amount
  );
end;
$$;

revoke execute on function public.record_meter_reading from public, anon;
grant execute on function public.record_meter_reading to authenticated;
