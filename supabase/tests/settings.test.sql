-- Settings (#26): only admins change settings and settings images; shape checks.
begin;
create extension if not exists pgtap with schema extensions;
truncate public.profiles, public.rooms, public.tenants, public.audit_log cascade;
select plan(12);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@test.local'),
  ('a0000000-0000-0000-0000-00000000000a', 'a@test.local');
insert into public.profiles (id, role, username, display_name, must_change_password) values
  ('a0000000-0000-0000-0000-000000000001', 'admin', 'admin', 'Admin', false),
  ('a0000000-0000-0000-0000-00000000000a', 'tenant', 'room1-a-0001', 'A', false);
insert into public.rooms (id, number, base_rent_centavos) values
  ('b0000000-0000-0000-0000-000000000001', 1, 350000),
  ('b0000000-0000-0000-0000-000000000002', 2, 350000);
insert into storage.objects (bucket_id, name, owner_id)
values ('settings', 'gcash-qr/00000000-0000-0000-0000-000000000000.png', 'a0000000-0000-0000-0000-000000000001');

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Tenant
select pg_temp.login('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.app_settings), 1, 'tenants can read the settings (GCash details)');
update public.app_settings set gcash_number = '09999999999';
select is((select count(*)::int from public.app_settings where gcash_number = '09999999999'), 0, 'tenants cannot change settings');
update public.rooms set meter_serial = 'X1';
select is((select count(*)::int from public.rooms where meter_serial = 'X1'), 0, 'tenants cannot change meter serials');
select is((select count(*)::int from storage.objects where bucket_id = 'settings'), 0, 'tenants cannot list settings images');
select throws_ok($$
  insert into storage.objects (bucket_id, name) values ('settings', 'gcash-qr/evil.png')
$$, '42501', null, 'tenants cannot upload settings images');
reset role;

-- Admin
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select lives_ok($$
  update public.app_settings set gcash_name = 'MARIA A.', gcash_number = '09171234567', gcash_qr_path = 'gcash-qr/x.png'
$$, 'admins can change the GCash details');
select has_trigger('public', 'app_settings', 'app_settings_touch', 'updated_at is kept current');
select throws_ok($$ update public.app_settings set gcash_number = '0917 123 4567' $$, '23514', null,
  'the GCash number is stored as 11 digits');
select throws_ok($$ update public.app_settings set gcash_number = '12345' $$, '23514', null,
  'a wrong GCash number is refused');
select is((select count(*)::int from storage.objects where bucket_id = 'settings'), 1, 'admins can see settings images');
select lives_ok($$ update public.rooms set meter_serial = 'AB123' where number = 1 $$, 'admins can set a meter serial');
select throws_ok($$ update public.rooms set meter_serial = 'AB123' where number = 2 $$, '23505', null,
  'one serial belongs to one room');
reset role;

select * from finish();
rollback;
