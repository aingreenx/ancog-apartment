# Importing the notebook

Use this once, to bring every **active** tenant's history from the paper notebook into the
app. The real files hold real names and phone numbers, so they live in
`imports/private/`, which git ignores. **Never commit them.**

## 1. Fill in the CSVs

Copy the four templates from `imports/templates/` into `imports/private/` and replace the
example rows (Juana and Pedro are made up; their numbers are from a real notebook page).
Save as CSV (UTF-8) from Excel or Google Sheets. Money is in pesos (`2500`, `13.50`);
dates are `YYYY-MM-DD`.

| File           | One row per…                    | Columns                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenants.csv`  | active tenant                   | `key` (any short name, used in the other files), `room`, `first_name`, `last_name`, `phone_1`, `phone_2`, `address`, `start_date` (move-in = due day), `starting_kwh`, `monthly_rent`\*, `deposit_required`\*, `advance_required`\*, `rent_through`\*\*, `username`, `temp_password`, `expected_balance` |
| `readings.csv` | meter reading after move-in     | `tenant_key`, `date`, `kwh` (black digits), `rate` (₱/kWh used that month), `amount` (optional: the notebook's bill, checked)                                                                                                                                                                            |
| `charges.csv`  | extra charge (key, cleaning, …) | `tenant_key`, `type` (`custom` or `deduction`), `description`, `due_date`, `amount`                                                                                                                                                                                                                      |
| `payments.csv` | payment, with the date paid     | `tenant_key`, `paid_on`, `amount`, `method` (`cash`, `gcash`, `bank`), `reference_no`, `for` (optional, e.g. `rent:2026-06-14\|electricity:2026-06-14`; otherwise oldest first), `notes`                                                                                                                 |

\* Defaults to the room's rent (1 month). \*\* Rent is charged every month from the move-in
date through this date (default: today). The deposit is charged on the move-in date.
Leave `username` empty for tenants who won't use the app; leave `temp_password` empty to
get a generated one.

`expected_balance` is the balance written in the notebook today (negative if they're
ahead). If it's filled in, the import refuses to run when the app computes something
different. That's how we know the import matches the notebook.

## 2. Dry run

```bash
npm run import:notebook -- --dir imports/private
```

Nothing is written. It checks every row (readings never go down, each bill matches the
notebook's amount, payments that are more than owed become credit) and prints each
tenant's charged / paid / owed / credit / balance next to the notebook's. Fix the CSVs
until there are no errors and every balance says **✓ matches**.

## 3. Import

```bash
npm run import:notebook -- --dir imports/private --commit --received-by admin1@ancog.local
```

It creates the tenant logins, then writes everything (tenants, stays, readings, bills,
payments, receipts) **in one transaction**: either all of it is saved or none of it is.
It prints each tenant's username and temporary password to hand out. The rooms must be
vacant in the app.

To try it locally first: `npm run db:reset`, then import the templates into rooms that
the seed leaves vacant (edit `room` in a copy of the templates).
