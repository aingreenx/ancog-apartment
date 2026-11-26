-- Notebook import (#21): writes a validated plan (built by src/lib/import/notebook.ts and
-- sent by scripts/import-notebook.ts) in ONE transaction. Auth users for tenant logins are
-- created by the script beforehand and passed in as profile ids; if this fails the
-- script deletes them again.
--
-- Payload:
-- {
--   "received_by": uuid,                       -- admin shown on the receipts
--   "tenants": [{ "tenant": {...}, "tenancy": {...}, "readings": [...], "charges": [...] }],
--   "payments": [...]                          -- all tenants, in the order they were paid
-- }

create function public.import_notebook(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_received_by uuid := (p ->> 'received_by')::uuid;
  t jsonb;
  r jsonb;
  c jsonb;
  pay jsonb;
  a jsonb;
  v_room public.rooms;
  v_tenancy_id uuid;
  v_counts jsonb := '{"tenants":0,"readings":0,"charges":0,"payments":0}';
begin
  if not (public.is_admin() or auth.role() = 'service_role' or current_user = 'postgres') then
    raise exception 'Only admins can import' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.profiles where id = v_received_by and role = 'admin') then
    raise exception 'received_by must be an admin' using errcode = 'check_violation';
  end if;

  for t in select * from jsonb_array_elements(p -> 'tenants') loop
    select * into v_room from public.rooms where number = (t #>> '{tenancy,room}')::smallint for update;
    if not found then
      raise exception 'Room % does not exist', t #>> '{tenancy,room}';
    end if;
    if exists (select 1 from public.tenancies where room_id = v_room.id and status = 'active') then
      raise exception 'Room % is not vacant', v_room.number using errcode = 'unique_violation';
    end if;

    if t #>> '{tenant,profile_id}' is not null then
      insert into public.profiles (id, role, username, display_name, must_change_password)
      values ((t #>> '{tenant,profile_id}')::uuid, 'tenant', t ->> 'username',
              (t #>> '{tenant,first_name}') || ' ' || (t #>> '{tenant,last_name}'), true);
    end if;

    insert into public.tenants (id, first_name, last_name, phone_1, phone_2, address, profile_id)
    values ((t #>> '{tenant,id}')::uuid, t #>> '{tenant,first_name}', t #>> '{tenant,last_name}',
            t #>> '{tenant,phone_1}', nullif(t #>> '{tenant,phone_2}', ''), nullif(t #>> '{tenant,address}', ''),
            (t #>> '{tenant,profile_id}')::uuid);

    v_tenancy_id := (t #>> '{tenancy,id}')::uuid;
    insert into public.tenancies (id, room_id, tenant_id, start_date, due_day, monthly_rent_centavos,
                                  starting_kwh, deposit_required_centavos, advance_required_centavos)
    values (v_tenancy_id, v_room.id, (t #>> '{tenant,id}')::uuid, (t #>> '{tenancy,start_date}')::date,
            (t #>> '{tenancy,due_day}')::smallint, (t #>> '{tenancy,monthly_rent}')::bigint,
            (t #>> '{tenancy,starting_kwh}')::int, (t #>> '{tenancy,deposit_required}')::bigint,
            (t #>> '{tenancy,advance_required}')::bigint);

    insert into public.meter_readings (tenancy_id, reading_date, reading_kwh, kind, created_by)
    values (v_tenancy_id, (t #>> '{tenancy,start_date}')::date, (t #>> '{tenancy,starting_kwh}')::int,
            'move_in', v_received_by);

    for r in select * from jsonb_array_elements(t -> 'readings') loop
      insert into public.meter_readings (id, tenancy_id, reading_date, reading_kwh, kind, created_by)
      values ((r ->> 'id')::uuid, v_tenancy_id, (r ->> 'date')::date, (r ->> 'kwh')::int, 'regular', v_received_by);
      -- Keep the notebook's rate for that date, so later readings have one too.
      insert into public.electricity_rates (effective_date, rate_centavos_per_kwh, source_note, created_by)
      values ((r ->> 'date')::date, (r ->> 'rate')::bigint, 'Imported from the notebook', v_received_by)
      on conflict (effective_date) do nothing;
      v_counts := jsonb_set(v_counts, '{readings}', to_jsonb((v_counts ->> 'readings')::int + 1));
    end loop;

    for c in select * from jsonb_array_elements(t -> 'charges') loop
      insert into public.charges (id, tenancy_id, type, description, period_start, period_end, due_date,
                                  amount_centavos, meter_reading_id, prev_kwh, curr_kwh, kwh_used,
                                  rate_centavos_per_kwh, created_by)
      values ((c ->> 'id')::uuid, v_tenancy_id, (c ->> 'type')::public.charge_type, c ->> 'description',
              (c ->> 'period_start')::date, (c ->> 'period_end')::date, (c ->> 'due_date')::date,
              (c ->> 'amount')::bigint, (c ->> 'reading_id')::uuid, (c ->> 'prev_kwh')::int,
              (c ->> 'curr_kwh')::int, (c ->> 'kwh_used')::int, (c ->> 'rate')::bigint, v_received_by);
      v_counts := jsonb_set(v_counts, '{charges}', to_jsonb((v_counts ->> 'charges')::int + 1));
    end loop;
    v_counts := jsonb_set(v_counts, '{tenants}', to_jsonb((v_counts ->> 'tenants')::int + 1));
  end loop;

  -- Payments in the order they were paid, so receipt numbers follow the notebook.
  for pay in select * from jsonb_array_elements(p -> 'payments') loop
    insert into public.payments (id, tenancy_id, paid_on, amount_centavos, method, reference_no, notes,
                                 status, submitted_by, reviewed_by, reviewed_at)
    values ((pay ->> 'id')::uuid, (pay ->> 'tenancy_id')::uuid, (pay ->> 'paid_on')::date,
            (pay ->> 'amount')::bigint, (pay ->> 'method')::public.payment_method,
            nullif(pay ->> 'reference_no', ''), nullif(pay ->> 'notes', ''), 'confirmed',
            v_received_by, v_received_by, (pay ->> 'paid_on')::timestamptz);
    for a in select * from jsonb_array_elements(pay -> 'allocations') loop
      insert into public.payment_allocations (payment_id, charge_id, amount_centavos, created_by)
      values ((pay ->> 'id')::uuid, (a ->> 'charge_id')::uuid, (a ->> 'amount')::bigint, v_received_by);
    end loop;
    v_counts := jsonb_set(v_counts, '{payments}', to_jsonb((v_counts ->> 'payments')::int + 1));
  end loop;

  return v_counts;
end;
$$;

revoke execute on function public.import_notebook from public, anon, authenticated;
grant execute on function public.import_notebook to service_role;
