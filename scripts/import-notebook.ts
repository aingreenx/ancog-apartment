/**
 * Import active tenants' history from the notebook (#21).
 *
 *   npm run import:notebook -- --dir imports/private                 # dry run (default)
 *   npm run import:notebook -- --dir imports/private --commit --received-by admin1@ancog.local
 *
 * Reads tenants.csv, readings.csv, charges.csv, payments.csv (see imports/README.md),
 * validates everything, prints each tenant's computed balance to compare with the
 * notebook, and only with --commit writes it, all in one database transaction.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local).
 */
import { randomInt, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { generateTempPassword } from "../src/lib/admin/move-in";
import { TENANT_EMAIL_DOMAIN } from "../src/lib/auth/login-id";
import { parseCsv, planImport, type ImportPlan } from "../src/lib/import/notebook";
import { todayInManila } from "../src/lib/money";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const dir = option("dir") ?? "imports/private";
const commit = flag("commit");
const receivedByEmail = option("received-by");
const peso = (c: number) => (c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 });

function readCsv(name: string, required: boolean) {
  const path = join(dir, name);
  if (!existsSync(path)) {
    if (required) throw new Error(`Missing ${path}. Copy imports/templates/${name} to start.`);
    return [];
  }
  return parseCsv(readFileSync(path, "utf8"));
}

function printPlan(plan: ImportPlan) {
  console.log(
    "\nTenant                         Room   Charged      Paid      Owed    Credit   Balance  Notebook",
  );
  for (const t of plan.tenants) {
    const x = t.totals;
    const check =
      t.expectedBalance === null
        ? "—"
        : t.expectedBalance === x.balance
          ? "✓ matches"
          : "✗ DIFFERENT";
    console.log(
      `${`${t.firstName} ${t.lastName}`.padEnd(30)} ${String(t.room).padStart(4)} ${peso(x.charged).padStart(10)} ${peso(x.paid).padStart(9)} ${peso(x.owed).padStart(9)} ${peso(x.credit).padStart(9)} ${peso(x.balance).padStart(9)}  ${check}`,
    );
  }
  for (const w of plan.warnings) console.log(`warning: ${w}`);
  for (const e of plan.errors) console.log(`ERROR:   ${e}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("number, base_rent_centavos, tenancies(id, status)");
  if (roomsError) throw new Error(roomsError.message);

  const plan = planImport(
    {
      tenants: readCsv("tenants.csv", true),
      readings: readCsv("readings.csv", false),
      charges: readCsv("charges.csv", false),
      payments: readCsv("payments.csv", false),
    },
    new Map(rooms.map((r) => [r.number, r.base_rent_centavos])),
    todayInManila(),
  );
  for (const t of plan.tenants) {
    const room = rooms.find((r) => r.number === t.room);
    if (room?.tenancies.some((s) => s.status === "active"))
      plan.errors.push(`room ${t.room} is not vacant`);
  }

  console.log(`Notebook import from ${dir} (${commit ? "COMMIT" : "dry run"})`);
  printPlan(plan);
  if (plan.errors.length > 0) {
    console.log(`\n${plan.errors.length} error(s). Nothing was written.`);
    process.exitCode = 1;
    return;
  }
  if (!commit) {
    console.log(
      "\nDry run OK. Compare the balances with the notebook, then run again with --commit.",
    );
    return;
  }

  if (!receivedByEmail)
    throw new Error("--commit needs --received-by <admin email> (shown on receipts).");
  const { data: admin } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("username", receivedByEmail.split("@")[0])
    .eq("role", "admin")
    .maybeSingle();
  if (!admin) throw new Error(`No admin with username "${receivedByEmail.split("@")[0]}".`);

  // 1. Logins (outside the transaction; removed again if the import fails).
  const created: string[] = [];
  const logins: { username: string; password: string }[] = [];
  const profileIds = new Map<string, string>();
  try {
    for (const t of plan.tenants.filter((x) => x.username)) {
      const password = t.password || generateTempPassword(randomInt);
      const { data, error } = await supabase.auth.admin.createUser({
        email: `${t.username}@${TENANT_EMAIL_DOMAIN}`,
        password,
        email_confirm: true,
      });
      if (error || !data.user)
        throw new Error(`Couldn't create login ${t.username}: ${error?.message}`);
      created.push(data.user.id);
      profileIds.set(t.key, data.user.id);
      logins.push({ username: t.username, password });
    }

    // 2. Everything else in one transaction.
    const ids = new Map<string, string>(); // charge key → uuid
    const tenancyIds = new Map<string, string>();
    const payload = {
      received_by: admin.id,
      tenants: plan.tenants.map((t) => {
        const tenancyId = randomUUID();
        tenancyIds.set(t.key, tenancyId);
        const readingIds = new Map(t.readings.map((r) => [r.date, randomUUID()]));
        return {
          username: t.username || null,
          tenant: {
            id: randomUUID(),
            first_name: t.firstName,
            last_name: t.lastName,
            phone_1: t.phone1,
            phone_2: t.phone2,
            address: t.address,
            profile_id: profileIds.get(t.key) ?? null,
          },
          tenancy: {
            id: tenancyId,
            room: t.room,
            start_date: t.startDate,
            due_day: t.dueDay,
            monthly_rent: t.monthlyRent,
            starting_kwh: t.startingKwh,
            deposit_required: t.depositRequired,
            advance_required: t.advanceRequired,
          },
          readings: t.charges
            .filter((c) => c.reading)
            .map((c) => ({
              id: readingIds.get(c.reading!.date),
              date: c.reading!.date,
              kwh: c.reading!.kwh,
              rate: c.reading!.rate,
            })),
          charges: t.charges.map((c) => {
            const id = randomUUID();
            ids.set(c.key, id);
            return {
              id,
              type: c.type,
              description: c.description,
              due_date: c.dueDate,
              amount: c.amount,
              period_start: c.periodStart ?? null,
              period_end: c.periodEnd ?? null,
              reading_id: c.reading ? readingIds.get(c.reading.date) : null,
              prev_kwh: c.reading?.prevKwh ?? null,
              curr_kwh: c.reading?.kwh ?? null,
              kwh_used: c.reading ? c.reading.kwh - c.reading.prevKwh : null,
              rate: c.reading?.rate ?? null,
            };
          }),
        };
      }),
      payments: plan.tenants
        .flatMap((t) => t.payments.map((p) => ({ t, p })))
        .sort((a, b) => a.p.paidOn.localeCompare(b.p.paidOn))
        .map(({ t, p }) => ({
          id: randomUUID(),
          tenancy_id: tenancyIds.get(t.key),
          paid_on: p.paidOn,
          amount: p.amount,
          method: p.method,
          reference_no: p.referenceNo,
          notes: p.notes,
          allocations: p.allocations.map((a) => ({
            charge_id: ids.get(a.chargeKey),
            amount: a.amount,
          })),
        })),
    };

    const { data: counts, error } = await supabase.rpc("import_notebook", { p: payload });
    if (error) throw new Error(`Import failed, nothing was saved: ${error.message}`);
    console.log("\nImported:", counts);
    if (logins.length > 0) {
      console.log("\nGive each tenant their login (they must change the password on first login):");
      for (const l of logins) console.log(`  ${l.username.padEnd(28)} ${l.password}`);
    }
  } catch (e) {
    for (const id of created) await supabase.auth.admin.deleteUser(id);
    throw e;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
