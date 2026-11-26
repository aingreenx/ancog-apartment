# Database Design

Apartment Manager for a 13-room apartment, replacing a paper ledger.
Stack: Next.js + TypeScript, Supabase (Postgres, Auth, Storage). Migrations live in `supabase/migrations`.

## Business rules

- **Rooms:** 13. ₱2,500/month for rooms 3, 6, 7, 8, 9; ₱3,500/month for the rest. Rent is fixed for each stay.
- **Due date:** the move-in day of each month. Days 29–31 move to the last day of shorter months.
- **Rent:** paid in advance. The advance is the first month's rent.
- **Deposit:** usually 1 month, but flexible. It can be paid after move-in.
- **Electricity:**
  - Billed after use, separately from rent.
  - Amount = (current − previous kWh) × rate, rounded to the nearest peso.
  - Readings are whole kWh (the meter's black digits only).
- **Rate:** set monthly from the utility bill and the same for every room. A reading uses the newest rate entered on or before the reading date. Bills already made are never recomputed.
- **Readings:** taken by admins only, on any date. An optional photo is kept as proof, and tenants can see it.
- **Payments:**
  - Cash or GCash. Partial payments and paying off old balances bit by bit are normal.
  - Every payment keeps the date it was actually paid.
  - There's no late fee. A charge is overdue the day after its due date, and the app shows for how long.
- **Move-out:**
  - The deposit is applied to unpaid charges and to deductions (cleaning, aircon cleaning, missing items).
  - Any leftover is refunded. If the deposit isn't enough, the tenant still owes the rest.
- **Custom charges:** admins can add any charge with a name and amount.
- **Receipts:** "Acknowledgement Receipt". Each one has a sequential number, the amount in words and figures, full or partial, method and reference no., balance remaining, and received by. Electricity receipts also show the computation.
- **No room transfers.** If one happens, it's recorded as a move-out plus a new move-in.

## Users

- **2 admins:** full access, on phone and desktop.
- **Tenants:**
  - Accounts are created by admins, with usernames like `room3-name-1234` (stored as an internal email).
  - They get a temporary password that must be changed on first login.
  - They see only their own bills, readings, payments and receipts.
  - They can submit GCash payments for an admin to confirm.

## Ground rules

- Money is stored as integer centavos (`bigint`).
- Money rows are never deleted or edited. They are voided with a reason, and a corrected row is added.
- Balances are always computed from charges minus allocations, never stored by hand.
- Every change is written to `audit_log`.
- No real tenant data in this repository.

## Tables

| Table                | Key columns                                                                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| profiles             | id (auth.users), role admin/tenant, username, display_name, must_change_password                                                                                                                                                                      |
| tenants              | first_name, last_name, phone_1 (required), phone_2, address, profile_id (nullable)                                                                                                                                                                    |
| rooms                | number 1–13 (unique), base_rent_centavos, meter_serial                                                                                                                                                                                                |
| tenancies            | room_id, tenant_id, start_date, due_day, monthly_rent_centavos, starting_kwh, deposit_required_centavos, advance_required_centavos, status, end_date. One active tenancy per room.                                                                    |
| tenancy_occupants    | tenancy_id, name, phone                                                                                                                                                                                                                               |
| electricity_rates    | effective_date, rate_centavos_per_kwh, source_note                                                                                                                                                                                                    |
| meter_readings       | tenancy_id, reading_date, reading_kwh (int), photo_path, kind (regular / move_in / move_out / meter_change_old / meter_change_new). Never lower than the previous reading on the same meter.                                                          |
| charges              | tenancy_id, type (rent / electricity / deposit / custom / deduction), description, period_start, period_end, due_date, amount_centavos, electricity snapshot (prev_kwh, curr_kwh, kwh_used, rate), voided_at, void_reason. Rent is unique per period. |
| payments             | tenancy_id, paid_on, amount_centavos, method (cash / gcash / bank / deposit), reference_no, proof_path, status (pending_review / confirmed / rejected), voided_at                                                                                     |
| payment_allocations  | payment_id, charge_id, amount_centavos. Must be the same tenancy. Any unallocated amount is credit.                                                                                                                                                   |
| receipts             | receipt_no (sequential), payment_id (unique), received_by, pdf_path, voided_at                                                                                                                                                                        |
| move_out_settlements | deposit_held, deductions, applied_to_balance, refund, remaining_owed                                                                                                                                                                                  |
| notifications        | profile_id, type, title, body, link, read_at                                                                                                                                                                                                          |
| push_subscriptions   | profile_id, endpoint, keys                                                                                                                                                                                                                            |
| app_settings         | gcash_name, gcash_number, gcash_qr_path, apartment_address, receipt_signature_path                                                                                                                                                                    |
| audit_log            | table_name, row_id, action, actor, before, after, at                                                                                                                                                                                                  |

**Views:** `charge_balances` (paid, owed, status, days overdue), `tenancy_balances`, `monthly_summary`.

## Scheduled job (daily, 00:05 Asia/Manila)

1. Create the rent charge for each active stay whose due day is today. Safe to run twice.
2. Send reminders (due in 3 days, due today) and build the "readings due today" list.
3. Refresh overdue status.

## Security (row-level security)

- **Admins:** read and write everything.
- **Tenants:** read only their own rows. They can insert a payment only as `pending_review`. They can't add readings or charges.
- The service-role key is used only on the server, after checking the caller is an admin.
