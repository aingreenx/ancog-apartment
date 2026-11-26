import { describe, expect, it } from "vitest";
import { buildLedger, ledgerToCsv, monthBounds, shiftMonth, type LedgerCharge } from "./ledger";

const T = "t-3";
const stay = {
  tenancyId: T,
  room: 3,
  tenantName: "Frannie Reyes",
  startDate: "2026-05-14",
  endDate: null,
};
const charge = (
  c: Partial<LedgerCharge> & Pick<LedgerCharge, "id" | "type" | "dueDate" | "amount">,
): LedgerCharge => ({
  tenancyId: T,
  voided: false,
  prevKwh: null,
  currKwh: null,
  kwhUsed: null,
  rate: null,
  ...c,
});

// June on the notebook page: rent 2,500 + electricity 3,972 (331 kWh × ₱12), electricity
// paid 2,000 in June and 1,972 in July.
const charges: LedgerCharge[] = [
  charge({ id: "dep", type: "deposit", dueDate: "2026-05-14", amount: 250_000 }),
  charge({ id: "rent-may", type: "rent", dueDate: "2026-05-14", amount: 250_000 }),
  charge({ id: "rent-jun", type: "rent", dueDate: "2026-06-14", amount: 250_000 }),
  charge({
    id: "elec-jun",
    type: "electricity",
    dueDate: "2026-06-14",
    amount: 397_200,
    prevKwh: 9433,
    currKwh: 9764,
    kwhUsed: 331,
    rate: 1200,
  }),
  charge({ id: "void", type: "custom", dueDate: "2026-06-20", amount: 99_900, voided: true }),
];
const payments = [
  { id: "p1", tenancyId: T, paidOn: "2026-05-14", amount: 500_000 },
  { id: "p2", tenancyId: T, paidOn: "2026-06-14", amount: 450_000 },
  { id: "p3", tenancyId: T, paidOn: "2026-07-14", amount: 197_200 },
];
const allocations = [
  { paymentId: "p1", chargeId: "dep", amount: 250_000 },
  { paymentId: "p1", chargeId: "rent-may", amount: 250_000 },
  { paymentId: "p2", chargeId: "rent-jun", amount: 250_000 },
  { paymentId: "p2", chargeId: "elec-jun", amount: 200_000 },
  { paymentId: "p3", chargeId: "elec-jun", amount: 197_200 },
];

describe("month helpers", () => {
  it("knows month ends and leap years", () => {
    expect(monthBounds("2026-06")).toEqual({ start: "2026-06-01", end: "2026-06-30" });
    expect(monthBounds("2028-02").end).toBe("2028-02-29");
  });
  it("shifts months across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("buildLedger", () => {
  const june = buildLedger("2026-06", [1, 3], [stay], charges, payments, allocations);
  const row = june.rows.find((r) => r.room === 3)!;

  it("has one row per room, vacant rooms included", () => {
    expect(june.rows.map((r) => [r.room, r.tenantName])).toEqual([
      [1, null],
      [3, "Frannie Reyes"],
    ]);
  });

  it("shows the month's rent and when it was paid", () => {
    expect(row).toMatchObject({ rentDue: 250_000, rentPaid: 250_000, rentPaidOn: ["2026-06-14"] });
  });

  it("shows the electricity computation like the notebook", () => {
    expect(row.electricity).toEqual([
      { prevKwh: 9433, currKwh: 9764, kwhUsed: 331, rate: 1200, amount: 397_200 },
    ]);
    // Paid so far, including the 1,972 paid in July.
    expect(row.electricityPaid).toBe(397_200);
  });

  it("lists the month's payments with their actual dates", () => {
    expect(row.payments).toEqual([{ paidOn: "2026-06-14", amount: 450_000 }]);
  });

  it("balance at month end: due by then minus paid by then (voids ignored)", () => {
    // Due by Jun 30: 2,500 + 2,500 + 2,500 + 3,972 = 11,472. Paid by Jun 30: 5,000 + 4,500 = 9,500.
    expect(row.balance).toBe(197_200);
    expect(row.other).toBe(0);
    expect(june.totals.balance).toBe(197_200);
  });

  it("excludes stays that ended before the month or start after it", () => {
    const ended = { ...stay, tenancyId: "old", endDate: "2026-04-30" };
    const later = { ...stay, tenancyId: "new", startDate: "2026-07-01" };
    const ledger = buildLedger(
      "2026-06",
      [3],
      [ended, stay, later],
      charges,
      payments,
      allocations,
    );
    expect(ledger.rows.map((r) => r.tenancyId)).toEqual([T]);
  });
});

describe("ledgerToCsv", () => {
  it("is Excel-friendly: BOM, CRLF, pesos, quoted text", () => {
    const csv = ledgerToCsv(
      buildLedger(
        "2026-06",
        [3],
        [{ ...stay, tenantName: 'Reyes, "Frannie"' }],
        charges,
        payments,
        allocations,
      ),
    );
    expect(csv.startsWith("﻿Room,Tenant,")).toBe(true);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe(
      '3,"Reyes, ""Frannie""",2500.00,2500.00,2026-06-14,9433,9764,331,12.00,3972.00,3972.00,0.00,2026-06-14 4500.00,4500.00,1972.00',
    );
    expect(lines[2].startsWith("Total,,2500.00,2500.00")).toBe(true);
  });
});
