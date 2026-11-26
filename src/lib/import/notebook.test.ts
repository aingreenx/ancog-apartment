import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv, planImport, rentDueDates, type ImportInput } from "./notebook";

const dir = join(__dirname, "../../../imports/templates");
const load = (): ImportInput => ({
  tenants: parseCsv(readFileSync(join(dir, "tenants.csv"), "utf8")),
  readings: parseCsv(readFileSync(join(dir, "readings.csv"), "utf8")),
  charges: parseCsv(readFileSync(join(dir, "charges.csv"), "utf8")),
  payments: parseCsv(readFileSync(join(dir, "payments.csv"), "utf8")),
});
const rooms = new Map(
  Array.from({ length: 13 }, (_, i) => [
    i + 1,
    [3, 6, 7, 8, 9].includes(i + 1) ? 250_000 : 350_000,
  ]),
);
const TODAY = "2026-11-26";

describe("parseCsv", () => {
  it("handles quotes, commas, CRLF, BOM and blank lines", () => {
    expect(parseCsv('﻿a,b\r\n"x, ""y""",2\r\n\r\n3,\n')).toEqual([
      { a: 'x, "y"', b: "2" },
      { a: "3", b: "" },
    ]);
  });
});

describe("rentDueDates", () => {
  it("one per month, day 31 clamped", () => {
    expect(rentDueDates("2026-10-31", 31, "2027-03-01")).toEqual([
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
      "2027-01-31",
      "2027-02-28",
    ]);
  });
});

describe("planImport with the templates", () => {
  const plan = planImport(load(), rooms, TODAY);

  it("has no errors", () => {
    expect(plan.errors).toEqual([]);
  });

  it("reproduces the notebook page: bills and balance ₱445", () => {
    const juana = plan.tenants.find((t) => t.key === "juana")!;
    expect(
      juana.charges.filter((c) => c.type === "electricity").map((c) => c.amount / 100),
    ).toEqual([3972, 3048, 3483, 3206, 4050, 945]);
    expect(juana.charges.filter((c) => c.type === "rent")).toHaveLength(7);
    expect(juana.totals).toMatchObject({ balance: 44_500, owed: 44_500, credit: 0 });
  });

  it("allocates picked charges (3,972 paid as 2,000 + 1,972)", () => {
    const juana = plan.tenants.find((t) => t.key === "juana")!;
    const june = juana.payments.find((p) => p.paidOn === "2026-06-14")!;
    expect(june.allocations).toEqual([
      { chargeKey: "juana:rent:2026-06-14", amount: 250_000 },
      { chargeKey: "juana:electricity:2026-06-14", amount: 200_000 },
    ]);
  });

  it("second tenant balance ₱8,045 with a custom charge", () => {
    const pedro = plan.tenants.find((t) => t.key === "pedro")!;
    expect(pedro.totals.balance).toBe(804_500);
    expect(pedro.charges.some((c) => c.description === "Replacement key")).toBe(true);
  });
});

describe("planImport validation", () => {
  it("catches readings going down and notebook amounts that don't match", () => {
    const input = load();
    input.readings[1] = { ...input.readings[1], kwh: "9700" };
    input.readings[2] = { ...input.readings[2], amount: "3480" };
    const { errors } = planImport(input, rooms, TODAY);
    expect(errors.some((e) => /9700 kWh is lower than the previous reading 9764/.test(e))).toBe(
      true,
    );
    expect(errors.some((e) => /notebook says 3480/.test(e))).toBe(true);
  });

  it("flags a balance that doesn't match the notebook", () => {
    const input = load();
    input.tenants[0] = { ...input.tenants[0], expected_balance: "500" };
    expect(planImport(input, rooms, TODAY).errors).toContain(
      "juana: balance 445 doesn't match the notebook's 500",
    );
  });

  it("overpayment becomes credit (a warning, not an error)", () => {
    const input = load();
    input.payments.push({
      tenant_key: "juana",
      paid_on: "2026-11-20",
      amount: "1000",
      method: "cash",
    });
    input.tenants[0] = { ...input.tenants[0], expected_balance: "-555" };
    const plan = planImport(input, rooms, TODAY);
    expect(plan.errors).toEqual([]);
    expect(plan.warnings.some((w) => /555 more than owed becomes credit/.test(w))).toBe(true);
    expect(plan.tenants[0].totals).toMatchObject({ owed: 0, credit: 55_500, balance: -55_500 });
  });

  it("rejects bad rows: unknown tenant, duplicate room, future dates, bad method", () => {
    const input = load();
    input.tenants.push({ ...input.tenants[1], key: "dup" });
    input.payments.push({
      tenant_key: "nobody",
      paid_on: "2026-11-01",
      amount: "1",
      method: "cash",
    });
    input.payments.push({
      tenant_key: "juana",
      paid_on: "2027-01-01",
      amount: "1",
      method: "cash",
    });
    input.payments.push({
      tenant_key: "juana",
      paid_on: "2026-11-01",
      amount: "1",
      method: "bitcoin",
    });
    const { errors } = planImport(input, rooms, TODAY);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/room 5 appears twice/),
        expect.stringMatching(/unknown tenant_key "nobody"/),
        expect.stringMatching(/bad paid_on/),
        expect.stringMatching(/method must be cash, gcash or bank/),
      ]),
    );
  });
});
