-- Settings (#26): GCash details and QR, apartment address and receipt signature,
-- room meter serial numbers.

-- Images for settings (GCash QR, receipt signature). Private: the app hands out
-- short-lived links with the service role after checking who is asking.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('settings', 'settings', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "admins: manage settings files" on storage.objects
  for all to authenticated
  using (bucket_id = 'settings' and (select public.is_admin()))
  with check (bucket_id = 'settings' and (select public.is_admin()));

-- Basic shape checks; empty strings are stored as null by the app.
alter table public.app_settings
  add constraint app_settings_gcash_number_format
    check (gcash_number is null or gcash_number ~ '^09[0-9]{9}$'),
  add constraint app_settings_gcash_name_length
    check (gcash_name is null or length(trim(gcash_name)) between 1 and 80),
  add constraint app_settings_address_length
    check (apartment_address is null or length(trim(apartment_address)) between 1 and 200);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- A meter serial belongs to one room.
create unique index rooms_meter_serial_key on public.rooms (meter_serial)
  where meter_serial is not null;
alter table public.rooms
  add constraint rooms_meter_serial_length
    check (meter_serial is null or length(trim(meter_serial)) between 1 and 40);
