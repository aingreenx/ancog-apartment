import { describe, expect, it } from "vitest";
import { receiptFigures, type ReceiptCharge, type ReceiptPayment } from "./receipt-figures";

const charge = (
  c: Partial<ReceiptCharge> & Pick<ReceiptCharge, "id" | "amount" | "dueDate">,
): ReceiptCharge => ({
  type: "rent",
  description: c.id,
  voided: false,
  prevKwh: null,
  currKwh: null,
  kwhUsed: null,
  rate: null,
  ...c,
});
const payment = (id: string, amount: number, paidOn: string, createdAt = "2026-12-01T00:00:00Z") =>
  ({ id, amount, paidOn, createdAt, counts: true }) satisfies ReceiptPayment;

// Notebook: electricity 3,972 (Jun 14) paid as 2,000 (Jun 20) then 1,972 (Jul 14); rent
// 2,500 due Jul 14. All typed in later on the same day, so createdAt doesn't help.
const elec = charge({
  id: "elec",
  type: "electricity",
  description: "Electricity Jun 14, 2026",
  amount: 397_200,
  dueDate: "2026-06-14",
  prevKwh: 9433,
  currKwh: 9764,
  kwhUsed: 331,
  rate: 1200,
});
const rent = charge({ id: "rent", amount: 250_000, dueDate: "2026-07-14" });
const p1 = payment("p1", 200_000, "2026-06-20");
const p2 = payment("p2", 197_200, "2026-07-14");
const allocations = [
  { paymentId: "p1", chargeId: "elec", amount: 200_000 },
  { paymentId: "p2", chargeId: "elec", amount: 197_200 },
];

describe("receiptFigures", () => {
  it("first part of 3,972: partial, 1,972 remaining, with the computation", () => {
    const f = receiptFigures(p1, [elec, rent], [p1, p2], allocations);
    expect(f.kind).toBe("Partial payment");
    expect(f.items[0]).toMatchObject({ paid: 200_000, full: false });
    expect(f.balanceRemaining).toBe(197_200);
    expect(f.electricity).toEqual([
      {
        description: "Electricity Jun 14, 2026",
        prevKwh: 9433,
        currKwh: 9764,
        kwhUsed: 331,
        rate: 1200,
        amount: 397_200,
      },
    ]);
  });

  it("second part: full; balance is what was due by Jul 14 (rent 2,500)", () => {
    const f = receiptFigures(p2, [elec, rent], [p1, p2], allocations);
    expect(f.kind).toBe("Full payment");
    expect(f.items).toEqual([
      { description: "Electricity Jun 14, 2026", amount: 397_200, paid: 197_200, full: true },
    ]);
    expect(f.balanceRemaining).toBe(250_000);
  });

  it("doesn't change when later payments arrive", () => {
    const p3 = payment("p3", 250_000, "2026-08-01");
    const later = receiptFigures(
      p1,
      [elec, rent],
      [p1, p2, p3],
      [...allocations, { paymentId: "p3", chargeId: "rent", amount: 250_000 }],
    );
    expect(later.balanceRemaining).toBe(197_200);
    expect(later.kind).toBe("Partial payment");
  });

  it("orders same-day payments by when they were recorded", () => {
    const a = payment("a", 100_000, "2026-06-20", "2026-06-20T01:00:00Z");
    const b = payment("b", 297_200, "2026-06-20", "2026-06-20T02:00:00Z");
    const allocs = [
      { paymentId: "a", chargeId: "elec", amount: 100_000 },
      { paymentId: "b", chargeId: "elec", amount: 297_200 },
    ];
    expect(receiptFigures(a, [elec], [a, b], allocs).kind).toBe("Partial payment");
    expect(receiptFigures(b, [elec], [a, b], allocs)).toMatchObject({
      kind: "Full payment",
      balanceRemaining: 0,
    });
  });

  it("counts a charge paid before its due date (advance)", () => {
    const early = payment("e", 250_000, "2026-07-10");
    const f = receiptFigures(
      early,
      [rent],
      [early],
      [{ paymentId: "e", chargeId: "rent", amount: 250_000 }],
    );
    expect(f).toMatchObject({ kind: "Full payment", balanceRemaining: 0, credit: 0 });
  });

  it("ignores voided payments and charges", () => {
    const voided = { ...p1, counts: false };
    const f = receiptFigures(p2, [elec, { ...rent, voided: true }], [voided, p2], [allocations[1]]);
    expect(f.balanceRemaining).toBe(200_000);
    expect(f.kind).toBe("Partial payment");
  });

  it("a payment with nothing allocated is an advance / credit", () => {
    const p = payment("px", 50_000, "2026-07-20");
    const f = receiptFigures(p, [elec], [p1, p2, p], allocations);
    expect(f).toMatchObject({ kind: "Advance / credit", credit: 50_000, balanceRemaining: 0 });
  });
});
