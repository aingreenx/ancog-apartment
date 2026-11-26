-- Move-in: everything after the auth user exists, in one transaction.
-- Called by the move-in server action (#13) as the signed-in admin, after it has
-- created the Supabase Auth user. If this fails, the action deletes that auth user.

create function public.move_in(
  p_user_id uuid,
  p_username text,
  p_first_name text,
  p_last_name text,
  p_phone_1 text,
  p_phone_2 text,
  p_address text,
  p_occupants jsonb,          -- [{"name": "...", "phone": "..."}]
  p_room_number smallint,
  p_start_date date,
  p_starting_kwh integer,
  p_advance_centavos bigint,
  p_deposit_centavos bigint
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_room public.rooms;
  v_tenant_id uuid;
  v_tenancy_id uuid;
  v_period_end date;
  o jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can move tenants in' using errcode = 'insufficient_privilege';
  end if;

  select * into v_room from public.rooms where number = p_room_number for update;
  if not found then
    raise exception 'Room % does not exist', p_room_number using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.tenancies where room_id = v_room.id and status = 'active') then
    raise exception 'Room % is not vacant', p_room_number using errcode = 'unique_violation';
  end if;

  insert into public.profiles (id, role, username, display_name, must_change_password)
  values (p_user_id, 'tenant', p_username, trim(p_first_name) || ' ' || trim(p_last_name), true);

  insert into public.tenants (first_name, last_name, phone_1, phone_2, address, profile_id)
  values (trim(p_first_name), trim(p_last_name), trim(p_phone_1),
          nullif(trim(p_phone_2), ''), nullif(trim(p_address), ''), p_user_id)
  returning id into v_tenant_id;

  -- The move-in day is the due day; rent is fixed for the stay at the room's rent.
  insert into public.tenancies (room_id, tenant_id, start_date, due_day, monthly_rent_centavos,
                                starting_kwh, deposit_required_centavos, advance_required_centavos)
  values (v_room.id, v_tenant_id, p_start_date, extract(day from p_start_date)::smallint,
          v_room.base_rent_centavos, p_starting_kwh, p_deposit_centavos, p_advance_centavos)
  returning id into v_tenancy_id;

  for o in select * from jsonb_array_elements(coalesce(p_occupants, '[]'::jsonb)) loop
    if length(trim(coalesce(o ->> 'name', ''))) > 0 then
      insert into public.tenancy_occupants (tenancy_id, name, phone)
      values (v_tenancy_id, trim(o ->> 'name'), nullif(trim(coalesce(o ->> 'phone', '')), ''));
    end if;
  end loop;

  insert into public.meter_readings (tenancy_id, reading_date, reading_kwh, kind, created_by)
  values (v_tenancy_id, p_start_date, p_starting_kwh, 'move_in', v_admin);

  -- The advance is the first month's rent: a rent charge for the first period, so the
  -- daily job (#20) won't create it again.
  if p_advance_centavos > 0 then
    v_period_end := (p_start_date + interval '1 month' - interval '1 day')::date;
    insert into public.charges (tenancy_id, type, description, period_start, period_end, due_date,
                                amount_centavos, created_by)
    values (v_tenancy_id, 'rent',
            'Advance: rent ' || to_char(p_start_date, 'Mon FMDD') || ' – ' || to_char(v_period_end, 'Mon FMDD, YYYY'),
            p_start_date, v_period_end, p_start_date, p_advance_centavos, v_admin);
  end if;

  if p_deposit_centavos > 0 then
    insert into public.charges (tenancy_id, type, description, due_date, amount_centavos, created_by)
    values (v_tenancy_id, 'deposit', 'Deposit', p_start_date, p_deposit_centavos, v_admin);
  end if;

  return v_tenancy_id;
end;
$$;

revoke execute on function public.move_in from public, anon;
grant execute on function public.move_in to authenticated;
