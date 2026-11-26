-- Acknowledgement receipts (#19): every confirmed payment gets one, automatically.
-- receipt_no is the table's identity column, so numbers are sequential in the order
-- payments are confirmed. The PDF itself is rendered by the app and stored in the
-- private `receipts` bucket (pdf_path). void_payment() already marks the receipt void.

-- A receipt names who received the money, so it is issued only when that is known
-- (the app always records the confirming admin in reviewed_by).
create function public.issue_receipt()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_receiver uuid := coalesce(new.reviewed_by, new.submitted_by, auth.uid());
begin
  if new.status = 'confirmed' and new.voided_at is null and v_receiver is not null
     and not exists (select 1 from public.receipts r where r.payment_id = new.id) then
    insert into public.receipts (payment_id, received_by) values (new.id, v_receiver);
  end if;
  return new;
end;
$$;

create trigger payments_issue_receipt
  after insert or update of status on public.payments
  for each row execute function public.issue_receipt();

-- Payments confirmed before this migration (none in production yet; keeps local data whole).
insert into public.receipts (payment_id, received_by)
select p.id, coalesce(p.reviewed_by, p.submitted_by)
from public.payments p
where p.status = 'confirmed'
  and p.voided_at is null
  and coalesce(p.reviewed_by, p.submitted_by) is not null
  and not exists (select 1 from public.receipts r where r.payment_id = p.id)
order by p.paid_on, p.created_at;
