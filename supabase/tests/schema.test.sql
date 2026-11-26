-- Schema rules (money, readings, voids, balances). Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table r (test text, ok boolean);
create function pg_temp.expect_fail(name text, stmt text) returns void language plpgsql as $f$
begin
  begin execute stmt; insert into r values (name, false);
  exception when others then insert into r values (name || ' -> ' || sqlerrm, true); end;
end $f$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'admin@test.local');
insert into profiles (id, role, username, display_name) values ('00000000-0000-0000-0000-000000000001','admin','admin1','Admin');
insert into rooms (id, number, base_rent_centavos) values ('10000000-0000-0000-0000-000000000003', 3, 250000);
insert into tenants (id, first_name, last_name, phone_1) values ('20000000-0000-0000-0000-000000000001','Juan','Cruz','0917');
insert into tenancies (id, room_id, tenant_id, start_date, due_day, monthly_rent_centavos, starting_kwh)
  values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','2026-09-26',26,250000,9433);
insert into electricity_rates (effective_date, rate_centavos_per_kwh) values ('2026-11-14',1500),('2026-12-15',1450);
insert into meter_readings (tenancy_id, reading_date, reading_kwh, kind) values
  ('30000000-0000-0000-0000-000000000001','2026-09-26',9433,'move_in'),
  ('30000000-0000-0000-0000-000000000001','2026-10-26',9764,'regular');

select pg_temp.expect_fail('second active tenancy in room 3', $q$insert into tenancies (room_id, tenant_id, start_date, due_day, monthly_rent_centavos, starting_kwh) values ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','2026-10-01',1,250000,0)$q$);
select pg_temp.expect_fail('room 14', $q$insert into rooms (number, base_rent_centavos) values (14, 1)$q$);
select pg_temp.expect_fail('negative money', $q$insert into charges (tenancy_id,type,description,due_date,amount_centavos) values ('30000000-0000-0000-0000-000000000001','custom','x','2026-10-01',-1)$q$);
select pg_temp.expect_fail('reading lower than previous', $q$insert into meter_readings (tenancy_id, reading_date, reading_kwh) values ('30000000-0000-0000-0000-000000000001','2026-11-26',9700)$q$);
select pg_temp.expect_fail('backdated reading higher than a later one', $q$insert into meter_readings (tenancy_id, reading_date, reading_kwh) values ('30000000-0000-0000-0000-000000000001','2026-10-10',9800)$q$);

savepoint s1;
insert into meter_readings (tenancy_id, reading_date, reading_kwh, kind) values ('30000000-0000-0000-0000-000000000001','2026-11-01',9800,'meter_change_old');
insert into meter_readings (tenancy_id, reading_date, reading_kwh, kind) values ('30000000-0000-0000-0000-000000000001','2026-11-01',5,'meter_change_new');
insert into meter_readings (tenancy_id, reading_date, reading_kwh) values ('30000000-0000-0000-0000-000000000001','2026-11-26',120);
rollback to s1;
insert into r values ('meter change: new meter may start lower', true);

insert into charges (id, tenancy_id,type,description,period_start,period_end,due_date,amount_centavos) values
  ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','rent','Rent Oct','2026-10-26','2026-11-25','2026-10-26',250000);
insert into charges (id, tenancy_id,type,description,due_date,amount_centavos,prev_kwh,curr_kwh,kwh_used,rate_centavos_per_kwh) values
  ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','electricity','Elec','2026-10-26',397200,9433,9764,331,1200);
select pg_temp.expect_fail('duplicate rent period', $q$insert into charges (tenancy_id,type,description,period_start,due_date,amount_centavos) values ('30000000-0000-0000-0000-000000000001','rent','dup','2026-10-26','2026-10-26',250000)$q$);
select pg_temp.expect_fail('bad electricity snapshot', $q$insert into charges (tenancy_id,type,description,due_date,amount_centavos,prev_kwh,curr_kwh,kwh_used,rate_centavos_per_kwh) values ('30000000-0000-0000-0000-000000000001','electricity','x','2026-10-26',1,10,20,5,1200)$q$);
select pg_temp.expect_fail('edit charge amount', $q$update charges set amount_centavos = 1 where id = '40000000-0000-0000-0000-000000000001'$q$);
select pg_temp.expect_fail('delete charge', $q$delete from charges where id = '40000000-0000-0000-0000-000000000001'$q$);
select pg_temp.expect_fail('void without reason', $q$update charges set voided_at = now() where id = '40000000-0000-0000-0000-000000000001'$q$);

insert into payments (id, tenancy_id, paid_on, amount_centavos, method, status) values
  ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','2026-10-27',300000,'cash','confirmed');
insert into payment_allocations (payment_id, charge_id, amount_centavos) values
  ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',250000),
  ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',30000);
select pg_temp.expect_fail('over-allocate payment', $q$insert into payment_allocations (payment_id, charge_id, amount_centavos) values ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',30000)$q$);
select pg_temp.expect_fail('delete payment', $q$delete from payments where id = '50000000-0000-0000-0000-000000000001'$q$);
select pg_temp.expect_fail('edit payment amount', $q$update payments set amount_centavos = 1 where id = '50000000-0000-0000-0000-000000000001'$q$);

insert into r select 'rate_for_date(2026-12-03) = 1500', (select rate_centavos_per_kwh from rate_for_date('2026-12-03')) = 1500;
insert into r select 'rate_for_date(2027-01-03) = 1450', (select rate_centavos_per_kwh from rate_for_date('2027-01-03')) = 1450;
insert into r select 'charge_balances: rent paid', (select status = 'paid' and owed_centavos = 0 from charge_balances where charge_id='40000000-0000-0000-0000-000000000001');
insert into r select 'charge_balances: electricity overdue, 367200 owed', (select status = 'overdue' and owed_centavos = 367200 and days_overdue > 0 from charge_balances where charge_id='40000000-0000-0000-0000-000000000002');
insert into r select 'tenancy_balances: owed 367200, credit 20000, balance 347200', (select owed_centavos = 367200 and credit_centavos = 20000 and balance_centavos = 347200 from tenancy_balances);
insert into r select 'monthly_summary Oct', (select rent_billed_centavos = 250000 and electricity_billed_centavos = 397200 and cash_collected_centavos = 300000 from monthly_summary where month = '2026-10-01');

select pg_temp.expect_fail('void charge that still has allocations', $q$update charges set voided_at = now(), void_reason = 'test' where id = '40000000-0000-0000-0000-000000000002'$q$);
update payment_allocations set voided_at = now(), void_reason = 'test' where charge_id = '40000000-0000-0000-0000-000000000002';
insert into r select 'voided allocation returns to credit (50000)', (select credit_centavos = 50000 from tenancy_balances);
update charges set voided_at = now(), void_reason = 'test' where id = '40000000-0000-0000-0000-000000000002';
select pg_temp.expect_fail('change a voided row', $q$update charges set void_reason = 'other' where id = '40000000-0000-0000-0000-000000000002'$q$);
insert into r select 'voided charge owes 0', (select owed_centavos = 0 and status = 'void' from charge_balances where charge_id='40000000-0000-0000-0000-000000000002');

insert into receipts (payment_id, received_by) values ('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
insert into r select 'receipt number assigned', (select receipt_no >= 1 from receipts);
insert into r select 'audit_log has rows incl. the void UPDATE', (select count(*) filter (where action = 'UPDATE') >= 1 and count(*) >= 8 from audit_log);
insert into r select 'RLS on every table', (select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r');

select ok(coalesce(ok, false), test) from r order by test;
select * from finish();
rollback;
