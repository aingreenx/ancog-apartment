// Importing active tenants' history from the paper notebook (#21). Pure functions:
// parse the CSVs, validate everything, and compute each tenant's balance before anything
// is written. scripts/import-notebook.ts does the I/O.

import { allocatePayment } from "../billing/balances";
import { dueDateFor } from "../billing/electricity";
import { parsePesos } from "../money";

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180-ish CSV → array of objects keyed by the header row. Blank lines are skipped. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface ImportInput {
  tenants: Record<string, string>[];
  readings: Record<string, string>[];
  charges: Record<string, string>[];
  payments: Record<string, string>[];
}

export interface PlannedCharge {
  key: string;
  type: "rent" | "electricity" | "deposit" | "custom" | "deduction";
  description: string;
  dueDate: string;
  amount: number;
  periodStart?: string;
  periodEnd?: string;
  reading?: { date: string; kwh: number; prevKwh: number; rate: number };
}

export interface PlannedPayment {
  paidOn: string;
  amount: number;
  method: "cash" | "gcash" | "bank";
  referenceNo: string;
  notes: string;
  allocations: { chargeKey: string; amount: number }[];
}

export interface PlannedTenant {
  key: string;
  room: number;
  firstName: string;
  lastName: string;
  phone1: string;
  phone2: string;
  address: string;
  startDate: string;
  dueDay: number;
  monthlyRent: number;
  startingKwh: number;
  depositRequired: number;
  advanceRequired: number;
  username: string;
  password: string;
  readings: { date: string; kwh: number }[];
  charges: PlannedCharge[];
  payments: PlannedPayment[];
  totals: { charged: number; paid: number; owed: number; credit: number; balance: number };
  expectedBalance: number | null;
}

export interface ImportPlan {
  tenants: PlannedTenant[];
  errors: string[];
  warnings: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const USERNAME = /^[a-z0-9][a-z0-9-]{2,63}$/;
const validDate = (d: string) => DATE.test(d) && !Number.isNaN(Date.parse(d));
const shortDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** Rent due dates from the move-in date through `through` (inclusive), one per month. */
export function rentDueDates(startDate: string, dueDay: number, through: string): string[] {
  const out: string[] = [];
  let [y, m] = startDate.split("-").map(Number);
  for (;;) {
    const due = dueDateFor(y, m, dueDay);
    if (due > through) return out;
    if (due >= startDate) out.push(due);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
}

/**
 * Validate the four CSVs and build what would be written. Nothing is written if
 * `errors` is non-empty.
 *
 * @param roomRents  room number → base rent (centavos)
 * @param today      YYYY-MM-DD; nothing may be dated after it
 */
export function planImport(
  input: ImportInput,
  roomRents: Map<number, number>,
  today: string,
): ImportPlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tenants: PlannedTenant[] = [];
  const seenKeys = new Set<string>();
  const seenRooms = new Set<number>();
  const seenUsernames = new Set<string>();

  // ---- tenants ------------------------------------------------------------------
  input.tenants.forEach((t, i) => {
    const where = `tenants.csv row ${i + 2}`;
    const err = (m: string) => errors.push(`${where}: ${m}`);
    const key = t.key;
    const room = Number(t.room);
    if (!key) return err("key is required");
    if (seenKeys.has(key)) return err(`duplicate key "${key}"`);
    seenKeys.add(key);
    if (!Number.isInteger(room) || !roomRents.has(room))
      return err(`room "${t.room}" doesn't exist`);
    if (seenRooms.has(room)) return err(`room ${room} appears twice`);
    seenRooms.add(room);
    for (const f of ["first_name", "last_name", "phone_1"]) if (!t[f]) err(`${f} is required`);
    if (!validDate(t.start_date) || t.start_date > today)
      return err("start_date must be a date (YYYY-MM-DD), not in the future");
    if (!/^\d+$/.test(t.starting_kwh ?? "")) return err("starting_kwh must be a whole number");

    const monthlyRent = t.monthly_rent ? parsePesos(t.monthly_rent) : roomRents.get(room)!;
    const deposit = t.deposit_required ? parsePesos(t.deposit_required) : monthlyRent;
    const advance = t.advance_required ? parsePesos(t.advance_required) : monthlyRent;
    if (monthlyRent === null || deposit === null || advance === null)
      return err("money columns must be pesos, e.g. 2500 or 2,500.00");

    const username = (t.username || "").toLowerCase();
    if (username) {
      if (!USERNAME.test(username))
        err(`username "${t.username}" isn't valid (lowercase letters, numbers, dashes)`);
      if (seenUsernames.has(username)) err(`username "${username}" appears twice`);
      seenUsernames.add(username);
      if (t.temp_password && t.temp_password.length < 8)
        err("temp_password must be at least 8 characters");
    }

    const dueDay = Number(t.start_date.slice(8, 10));
    const charges: PlannedCharge[] = [];
    if (deposit > 0) {
      charges.push({
        key: `${key}:deposit`,
        type: "deposit",
        description: "Deposit",
        dueDate: t.start_date,
        amount: deposit,
      });
    }

    // Rent: one charge per month from the move-in date through rent_through.
    const through = t.rent_through || today;
    if (!validDate(through) || through > today)
      err("rent_through must be a date, not in the future");
    else {
      rentDueDates(t.start_date, dueDay, through).forEach((due, n) => {
        const [y, m] = due.split("-").map(Number);
        const next = dueDateFor(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, dueDay);
        const end = new Date(Date.parse(`${next}T00:00:00Z`) - 86_400_000)
          .toISOString()
          .slice(0, 10);
        const amount = n === 0 && advance !== monthlyRent ? advance : monthlyRent;
        if (amount === 0) return;
        charges.push({
          key: `${key}:rent:${due}`,
          type: "rent",
          description: `${n === 0 ? "Advance: rent" : "Rent"} ${shortDate(due)} – ${shortDate(end)}, ${end.slice(0, 4)}`,
          dueDate: due,
          amount,
          periodStart: due,
          periodEnd: end,
        });
      });
    }

    tenants.push({
      key,
      room,
      firstName: t.first_name,
      lastName: t.last_name,
      phone1: t.phone_1,
      phone2: t.phone_2 ?? "",
      address: t.address ?? "",
      startDate: t.start_date,
      dueDay,
      monthlyRent,
      startingKwh: Number(t.starting_kwh),
      depositRequired: deposit,
      advanceRequired: advance,
      username,
      password: t.temp_password ?? "",
      readings: [],
      charges,
      payments: [],
      totals: { charged: 0, paid: 0, owed: 0, credit: 0, balance: 0 },
      expectedBalance: t.expected_balance ? parsePesos(t.expected_balance.replace(/^-/, "")) : null,
    });
    const last = tenants[tenants.length - 1];
    if (t.expected_balance?.startsWith("-") && last.expectedBalance !== null)
      last.expectedBalance *= -1;
  });

  const byKey = new Map(tenants.map((t) => [t.key, t]));
  const tenantFor = (key: string, where: string) => {
    const t = byKey.get(key);
    if (!t) errors.push(`${where}: unknown tenant_key "${key}"`);
    return t;
  };

  // ---- readings → electricity charges ------------------------------------------
  const readingsByTenant = new Map<string, { row: Record<string, string>; line: number }[]>();
  input.readings.forEach((row, i) => {
    const list = readingsByTenant.get(row.tenant_key) ?? [];
    list.push({ row, line: i + 2 });
    readingsByTenant.set(row.tenant_key, list);
  });
  for (const [tenantKey, rows] of readingsByTenant) {
    const t = tenantFor(tenantKey, `readings.csv row ${rows[0].line}`);
    if (!t) continue;
    let prev = t.startingKwh;
    let prevDate = t.startDate;
    for (const { row, line } of [...rows].sort((a, b) => a.row.date.localeCompare(b.row.date))) {
      const where = `readings.csv row ${line} (${t.key})`;
      const kwh = Number(row.kwh);
      const rate = parsePesos(row.rate ?? "");
      if (!validDate(row.date) || row.date > today) {
        errors.push(`${where}: bad date "${row.date}"`);
        continue;
      }
      if (!/^\d+$/.test(row.kwh ?? "")) {
        errors.push(`${where}: kwh must be a whole number`);
        continue;
      }
      if (row.date < prevDate) {
        errors.push(`${where}: reading is dated before the move-in date`);
        continue;
      }
      if (kwh < prev) {
        errors.push(`${where}: ${kwh} kWh is lower than the previous reading ${prev} kWh`);
        continue;
      }
      if (rate === null || rate <= 0) {
        errors.push(`${where}: rate must be ₱ per kWh, e.g. 12 or 13.50`);
        continue;
      }
      const used = kwh - prev;
      const amount = Math.round((used * rate) / 100) * 100;
      if (row.amount) {
        const notebook = parsePesos(row.amount);
        if (notebook !== amount) {
          errors.push(
            `${where}: notebook says ${row.amount} but ${used} kWh × ${rate / 100} = ${amount / 100}`,
          );
        }
      }
      t.readings.push({ date: row.date, kwh });
      t.charges.push({
        key: `${t.key}:electricity:${row.date}`,
        type: "electricity",
        description: `Electricity ${shortDate(row.date)}, ${row.date.slice(0, 4)}`,
        dueDate: row.date,
        amount,
        reading: { date: row.date, kwh, prevKwh: prev, rate },
      });
      prev = kwh;
      prevDate = row.date;
    }
  }

  // ---- other charges -----------------------------------------------------------
  input.charges.forEach((row, i) => {
    const where = `charges.csv row ${i + 2}`;
    const t = tenantFor(row.tenant_key, where);
    if (!t) return;
    const type = row.type as PlannedCharge["type"];
    const amount = parsePesos(row.amount ?? "");
    if (!["custom", "deduction", "rent", "deposit"].includes(type))
      return void errors.push(`${where}: type must be custom, deduction, rent or deposit`);
    if (!validDate(row.due_date) || row.due_date > today)
      return void errors.push(`${where}: bad due_date`);
    if (amount === null || amount <= 0)
      return void errors.push(`${where}: amount must be more than 0`);
    if (!row.description) return void errors.push(`${where}: description is required`);
    t.charges.push({
      key: `${t.key}:extra:${i}`,
      type,
      description: row.description,
      dueDate: row.due_date,
      amount,
    });
  });

  // ---- payments, in the order they were paid -----------------------------------
  const payments = input.payments
    .map((row, i) => ({ row, line: i + 2 }))
    .sort((a, b) => a.row.paid_on.localeCompare(b.row.paid_on) || a.line - b.line);
  for (const t of tenants) t.charges.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const allocated = new Map<string, { chargeId: string; amount: number }[]>();

  for (const { row, line } of payments) {
    const where = `payments.csv row ${line}`;
    const t = tenantFor(row.tenant_key, where);
    if (!t) continue;
    const amount = parsePesos(row.amount ?? "");
    const method = (row.method || "cash").toLowerCase() as PlannedPayment["method"];
    if (!validDate(row.paid_on) || row.paid_on > today) {
      errors.push(`${where}: bad paid_on`);
      continue;
    }
    if (row.paid_on < t.startDate) {
      errors.push(`${where}: paid before the move-in date`);
      continue;
    }
    if (amount === null || amount <= 0) {
      errors.push(`${where}: amount must be more than 0`);
      continue;
    }
    if (!["cash", "gcash", "bank"].includes(method)) {
      errors.push(`${where}: method must be cash, gcash or bank`);
      continue;
    }

    const existing = allocated.get(t.key) ?? [];
    // "for" picks charges like "electricity:2026-06-14|rent:2026-06-14"; otherwise oldest first.
    let pick: string[] | undefined;
    if (row.for) {
      pick = [];
      for (const ref of row.for
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)) {
        const [type, due] = ref.split(":");
        const c = t.charges.find((x) => x.type === type && x.dueDate === due);
        if (!c) errors.push(`${where}: no ${type} charge due ${due} for ${t.key}`);
        else pick.push(c.key);
      }
    }
    const plan = allocatePayment(
      amount,
      t.charges.map((c) => ({ id: c.key, dueDate: c.dueDate, amount: c.amount })),
      existing,
      pick ? { pick } : {},
    );
    existing.push(...plan.allocations);
    allocated.set(t.key, existing);
    if (plan.credit > 0) {
      warnings.push(
        `${where}: ${t.key} paid ${amount / 100}; ${plan.credit / 100} more than owed becomes credit`,
      );
    }
    t.payments.push({
      paidOn: row.paid_on,
      amount,
      method,
      referenceNo: row.reference_no ?? "",
      notes: row.notes ?? "",
      allocations: plan.allocations.map((a) => ({ chargeKey: a.chargeId, amount: a.amount })),
    });
  }

  // ---- totals and the notebook check --------------------------------------------
  for (const t of tenants) {
    const charged = t.charges.reduce((s, c) => s + c.amount, 0);
    const paid = t.payments.reduce((s, p) => s + p.amount, 0);
    const allocatedTotal = (allocated.get(t.key) ?? []).reduce((s, a) => s + a.amount, 0);
    t.totals = {
      charged,
      paid,
      owed: charged - allocatedTotal,
      credit: paid - allocatedTotal,
      balance: charged - paid,
    };
    if (t.expectedBalance !== null && t.expectedBalance !== t.totals.balance) {
      errors.push(
        `${t.key}: balance ${t.totals.balance / 100} doesn't match the notebook's ${t.expectedBalance / 100}`,
      );
    }
  }

  return { tenants, errors, warnings };
}
