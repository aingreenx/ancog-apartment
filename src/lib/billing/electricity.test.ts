import { describe, expect, it } from "vitest";
import { computeElectricityBill, dueDateFor, rateForReading, roundToPeso } from "./electricity";

// Reference case: a real notebook page (tenant name changed). Starting meter 9,433.
const notebookRows = [
  { curr: 9764, rate: 1200, kwh: 331, amount: 3972 },
  { curr: 10018, rate: 1200, kwh: 254, amount: 3048 },
  { curr: 10276, rate: 1350, kwh: 258, amount: 3483 },
  { curr: 10505, rate: 1400, kwh: 229, amount: 3206 },
  { curr: 10775, rate: 1500, kwh: 270, amount: 4050 },
  { curr: 10838, rate: 1500, kwh: 63, amount: 945 },
];

describe("computeElectricityBill", () => {
  it("reproduces every row of the notebook page exactly", () => {
    let prev = 9433;
    for (const row of notebookRows) {
      const bill = computeElectricityBill(prev, row.curr, row.rate);
      expect(bill.kwhUsed).toBe(row.kwh);
      expect(bill.amount).toBe(row.amount * 100);
      prev = row.curr;
    }
  });

  it("rejects a reading lower than the previous one", () => {
    expect(() => computeElectricityBill(10505, 10500, 1500)).toThrow(/lower/);
  });

  it("rejects decimal readings (red tenths digit)", () => {
    expect(() => computeElectricityBill(100, 100.4, 1500)).toThrow(/whole kWh/);
  });
});

describe("roundToPeso", () => {
  it("rounds to the nearest peso", () => {
    expect(roundToPeso(12_349)).toBe(12_300); // ₱123.49 → ₱123
    expect(roundToPeso(12_350)).toBe(12_400); // ₱123.50 → ₱124
  });

  it("handles decimal rates like ₱13.75", () => {
    // 101 kWh × ₱13.75 = ₱1,388.75 → ₱1,389
    expect(computeElectricityBill(0, 101, 1375).amount).toBe(138_900);
  });
});

describe("rateForReading", () => {
  const rates = [
    { effectiveDate: "2026-11-14", centavosPerKwh: 1500 }, // November bill
    { effectiveDate: "2026-12-15", centavosPerKwh: 1450 }, // December bill
  ];

  it("uses November's rate before December's is entered", () => {
    expect(rateForReading(rates, "2026-12-03").centavosPerKwh).toBe(1500);
  });

  it("uses December's rate once it is entered", () => {
    expect(rateForReading(rates, "2026-12-20").centavosPerKwh).toBe(1450);
  });

  it("keeps using December's rate in January until January's is entered", () => {
    expect(rateForReading(rates, "2027-01-03").centavosPerKwh).toBe(1450);
  });

  it("throws if no rate exists yet", () => {
    expect(() => rateForReading(rates, "2026-10-01")).toThrow(/No electricity rate/);
  });
});

describe("dueDateFor", () => {
  it("keeps normal due days", () => {
    expect(dueDateFor(2026, 12, 26)).toBe("2026-12-26");
  });

  it("moves day 31 to the end of shorter months", () => {
    expect(dueDateFor(2027, 2, 31)).toBe("2027-02-28");
    expect(dueDateFor(2028, 2, 30)).toBe("2028-02-29"); // leap year
    expect(dueDateFor(2026, 11, 31)).toBe("2026-11-30");
  });
});
