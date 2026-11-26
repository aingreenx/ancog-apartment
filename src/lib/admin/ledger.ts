// The ledger: one month, one row per stay, like a page of the notebook. Pure functions.
// All money in centavos; dates are YYYY-MM-DD; month is YYYY-MM.

export interface LedgerStay {
  tenancyId: string;
  room: number;
  tenantName: string;
  startDate: string;
  endDate: string | null;
}
export interface LedgerCharge {
  id: string;
  tenancyId: string;
  type: string;
  dueDate: string;
  amount: number;
  voided: boolean;
  prevKwh: number | null;
  currKwh: number | null;
  kwhUsed: number | null;
  rate: number | null;
}
/** Confirmed, non-void payments only. */
export interface LedgerPayment {
  id: string;
  tenancyId: string;
  paidOn: string;
  amount: number;
}
/** Non-void allocations of the payments above. */
export interface LedgerAllocation {
  paymentId: string;
  chargeId: string;
  amount: number;
}

export interface LedgerRow {
  room: number;
  tenancyId: string | null;
  tenantName: string | null;
  rentDue: number;
  rentPaid: number;
  rentPaidOn: string[];
  electricity: {
    prevKwh: number;
    currKwh: number;
    kwhUsed: number;
    rate: number;
    amount: number;
  }[];
  electricityAmount: number;
  electricityPaid: number;
  other: number;
  payments: { paidOn: string; amount: number }[];
  paymentsTotal: number;
  /** Everything due up to the end of the month minus everything paid by then. Negative = credit. */
  balance: number;
}

export interface Ledger {
  month: string;
  monthStart: string;
  monthEnd: string;
  rows: LedgerRow[];
  totals: Omit<
    LedgerRow,
    "room" | "tenancyId" | "tenantName" | "rentPaidOn" | "electricity" | "payments"
  >;
}

export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export function buildLedger(
  month: string,
  rooms: number[],
  stays: LedgerStay[],
  charges: LedgerCharge[],
  payments: LedgerPayment[],
  allocations: LedgerAllocation[],
): Ledger {
  const { start, end } = monthBounds(month);
  const inMonth = (d: string) => d >= start && d <= end;
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const paidOnCharge = (chargeId: string) =>
    allocations.filter((a) => a.chargeId === chargeId && paymentById.has(a.paymentId));

  const rows: LedgerRow[] = [];
  for (const room of [...rooms].sort((a, b) => a - b)) {
    const roomStays = stays
      .filter(
        (s) => s.room === room && s.startDate <= end && (s.endDate === null || s.endDate >= start),
      )
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    if (roomStays.length === 0) {
      rows.push({
        room,
        tenancyId: null,
        tenantName: null,
        rentDue: 0,
        rentPaid: 0,
        rentPaidOn: [],
        electricity: [],
        electricityAmount: 0,
        electricityPaid: 0,
        other: 0,
        payments: [],
        paymentsTotal: 0,
        balance: 0,
      });
      continue;
    }

    for (const stay of roomStays) {
      const mine = charges.filter((c) => c.tenancyId === stay.tenancyId && !c.voided);
      const thisMonth = mine.filter((c) => inMonth(c.dueDate));
      const rent = thisMonth.filter((c) => c.type === "rent");
      const elec = thisMonth.filter((c) => c.type === "electricity");
      const other = thisMonth.filter((c) => c.type !== "rent" && c.type !== "electricity");

      const rentAllocs = rent.flatMap((c) => paidOnCharge(c.id));
      const myPayments = payments.filter((p) => p.tenancyId === stay.tenancyId);
      const monthPayments = myPayments
        .filter((p) => inMonth(p.paidOn))
        .sort((a, b) => a.paidOn.localeCompare(b.paidOn));

      const dueByEnd = mine.filter((c) => c.dueDate <= end).reduce((s, c) => s + c.amount, 0);
      const paidByEnd = myPayments.filter((p) => p.paidOn <= end).reduce((s, p) => s + p.amount, 0);

      rows.push({
        room,
        tenancyId: stay.tenancyId,
        tenantName: stay.tenantName,
        rentDue: rent.reduce((s, c) => s + c.amount, 0),
        rentPaid: rentAllocs.reduce((s, a) => s + a.amount, 0),
        rentPaidOn: [
          ...new Set(rentAllocs.map((a) => paymentById.get(a.paymentId)!.paidOn)),
        ].sort(),
        electricity: elec.map((c) => ({
          prevKwh: c.prevKwh ?? 0,
          currKwh: c.currKwh ?? 0,
          kwhUsed: c.kwhUsed ?? 0,
          rate: c.rate ?? 0,
          amount: c.amount,
        })),
        electricityAmount: elec.reduce((s, c) => s + c.amount, 0),
        electricityPaid: elec.flatMap((c) => paidOnCharge(c.id)).reduce((s, a) => s + a.amount, 0),
        other: other.reduce((s, c) => s + c.amount, 0),
        payments: monthPayments.map((p) => ({ paidOn: p.paidOn, amount: p.amount })),
        paymentsTotal: monthPayments.reduce((s, p) => s + p.amount, 0),
        balance: dueByEnd - paidByEnd,
      });
    }
  }

  const sum = (k: keyof Ledger["totals"]) => rows.reduce((s, r) => s + (r[k] as number), 0);
  return {
    month,
    monthStart: start,
    monthEnd: end,
    rows,
    totals: {
      rentDue: sum("rentDue"),
      rentPaid: sum("rentPaid"),
      electricityAmount: sum("electricityAmount"),
      electricityPaid: sum("electricityPaid"),
      other: sum("other"),
      paymentsTotal: sum("paymentsTotal"),
      balance: sum("balance"),
    },
  };
}

// ---------------------------------------------------------------------------
// CSV (opens in Excel: UTF-8 with BOM, CRLF, plain numbers in pesos)
// ---------------------------------------------------------------------------

const pesos = (c: number) => (c / 100).toFixed(2);

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ledgerToCsv(ledger: Ledger): string {
  const header = [
    "Room",
    "Tenant",
    "Rent due",
    "Rent paid",
    "Rent paid on",
    "Prev kWh",
    "Curr kWh",
    "kWh used",
    "Rate (PHP/kWh)",
    "Electricity",
    "Electricity paid",
    "Other charges",
    "Payments",
    "Payments total",
    "Balance end of month",
  ];
  const lines = [header];
  for (const r of ledger.rows) {
    const e = r.electricity;
    lines.push([
      String(r.room),
      r.tenantName ?? "Vacant",
      pesos(r.rentDue),
      pesos(r.rentPaid),
      r.rentPaidOn.join("; "),
      e.map((x) => x.prevKwh).join("; "),
      e.map((x) => x.currKwh).join("; "),
      e.map((x) => x.kwhUsed).join("; "),
      e.map((x) => pesos(x.rate)).join("; "),
      pesos(r.electricityAmount),
      pesos(r.electricityPaid),
      pesos(r.other),
      r.payments.map((p) => `${p.paidOn} ${pesos(p.amount)}`).join("; "),
      pesos(r.paymentsTotal),
      pesos(r.balance),
    ]);
  }
  const t = ledger.totals;
  lines.push([
    "Total",
    "",
    pesos(t.rentDue),
    pesos(t.rentPaid),
    "",
    "",
    "",
    "",
    "",
    pesos(t.electricityAmount),
    pesos(t.electricityPaid),
    pesos(t.other),
    "",
    pesos(t.paymentsTotal),
    pesos(t.balance),
  ]);
  return "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
