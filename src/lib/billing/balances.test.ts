import { describe, expect, it } from "vitest";
import {
  allocateChosenFirst,
  allocatePayment,
  chargeBalance,
  daysBetween,
  settleMoveOut,
  tenancyBalance,
  type Allocation,
  type Charge,
} from "./balances";

const peso = (n: number) => n * 100;

describe("notebook partial payments", () => {
  it("3,972 paid as 2,000 + 1,972", () => {
    const bill: Charge = { id: "elec-jun", dueDate: "2026-06-14", amount: peso(3972) };
    const allocations: Allocation[] = [];

    const first = allocatePayment(peso(2000), [bill], allocations);
    expect(first).toEqual({
      allocations: [{ chargeId: "elec-jun", amount: peso(2000) }],
      credit: 0,
    });
    allocations.push(...first.allocations);
    expect(chargeBalance(bill, allocations, "2026-06-14")).toMatchObject({
      paid: peso(2000),
      owed: peso(1972),
      status: "partial",
    });

    const second = allocatePayment(peso(1972), [bill], allocations);
    allocations.push(...second.allocations);
    expect(second.credit).toBe(0);
    expect(chargeBalance(bill, allocations, "2026-07-14")).toMatchObject({
      paid: peso(3972),
      owed: 0,
      status: "paid",
      daysOverdue: 0,
    });
  });

  it("945 paid as 500 + 445", () => {
    const bill: Charge = { id: "elec-nov", dueDate: "2026-11-14", amount: peso(945) };
    const allocations: Allocation[] = [];

    allocations.push(...allocatePayment(peso(500), [bill], allocations).allocations);
    expect(chargeBalance(bill, allocations, "2026-11-26")).toMatchObject({
      owed: peso(445),
      status: "overdue",
      daysOverdue: 12,
    });

    allocations.push(...allocatePayment(peso(445), [bill], allocations).allocations);
    expect(chargeBalance(bill, allocations, "2026-11-30").status).toBe("paid");
  });
});

describe("chargeBalance", () => {
  const charge: Charge = { id: "c1", dueDate: "2026-11-14", amount: peso(2500) };

  it("is unpaid up to and including the due date", () => {
    expect(chargeBalance(charge, [], "2026-11-14")).toMatchObject({
      status: "unpaid",
      daysOverdue: 0,
    });
  });

  it("is overdue from the day after the due date, counting days", () => {
    expect(chargeBalance(charge, [], "2026-11-15")).toMatchObject({
      status: "overdue",
      daysOverdue: 1,
    });
    expect(chargeBalance(charge, [], "2026-12-14")).toMatchObject({ daysOverdue: 30 });
  });

  it("ignores voided allocations", () => {
    const allocations: Allocation[] = [{ chargeId: "c1", amount: peso(2500), voided: true }];
    expect(chargeBalance(charge, allocations, "2026-11-10")).toMatchObject({
      paid: 0,
      owed: peso(2500),
    });
  });

  it("a voided charge owes nothing", () => {
    expect(chargeBalance({ ...charge, voided: true }, [], "2026-12-30")).toMatchObject({
      owed: 0,
      status: "void",
      daysOverdue: 0,
    });
  });
});

describe("allocatePayment", () => {
  const charges: Charge[] = [
    { id: "rent-dec", dueDate: "2026-12-05", amount: peso(3500) },
    { id: "rent-nov", dueDate: "2026-11-05", amount: peso(3500) },
    { id: "elec-nov", dueDate: "2026-11-05", amount: peso(3075) },
  ];

  it("pays oldest due first, ties in the given order", () => {
    const plan = allocatePayment(peso(5000), charges, []);
    expect(plan.allocations).toEqual([
      { chargeId: "rent-nov", amount: peso(3500) },
      { chargeId: "elec-nov", amount: peso(1500) },
    ]);
    expect(plan.credit).toBe(0);
  });

  it("skips what is already paid and keeps the leftover as credit", () => {
    const existing: Allocation[] = [{ chargeId: "rent-nov", amount: peso(3500) }];
    const plan = allocatePayment(peso(7000), charges, existing);
    expect(plan.allocations).toEqual([
      { chargeId: "elec-nov", amount: peso(3075) },
      { chargeId: "rent-dec", amount: peso(3500) },
    ]);
    expect(plan.credit).toBe(peso(425));
  });

  it("pays only the picked charges, in the order picked", () => {
    const plan = allocatePayment(peso(4000), charges, [], { pick: ["elec-nov"] });
    expect(plan.allocations).toEqual([{ chargeId: "elec-nov", amount: peso(3075) }]);
    expect(plan.credit).toBe(peso(925));
  });

  it("never allocates to voided charges", () => {
    const withVoid = [{ ...charges[1], voided: true }, charges[0]];
    expect(allocatePayment(peso(3500), withVoid, []).allocations).toEqual([
      { chargeId: "rent-dec", amount: peso(3500) },
    ]);
    expect(() => allocatePayment(peso(1), withVoid, [], { pick: ["rent-nov"] })).toThrow(/voided/);
  });

  it("rejects unknown charges and bad amounts", () => {
    expect(() => allocatePayment(peso(1), charges, [], { pick: ["nope"] })).toThrow(/Unknown/);
    expect(() => allocatePayment(-1, charges, [])).toThrow(/centavos/);
    expect(() => allocatePayment(10.5, charges, [])).toThrow(/centavos/);
  });
});

describe("tenancyBalance", () => {
  it("adds up owed, credit and overdue", () => {
    const charges: Charge[] = [
      { id: "a", dueDate: "2026-11-01", amount: peso(3500) },
      { id: "b", dueDate: "2026-11-20", amount: peso(2000) },
      { id: "c", dueDate: "2026-12-01", amount: peso(3500) },
      { id: "v", dueDate: "2026-10-01", amount: peso(9999), voided: true },
    ];
    const allocations: Allocation[] = [
      { chargeId: "a", amount: peso(3500) },
      { chargeId: "b", amount: peso(500) },
    ];
    // ₱4,500 confirmed: ₱4,000 allocated, ₱500 credit.
    const result = tenancyBalance(charges, allocations, peso(4500), "2026-11-26");
    expect(result.owed).toBe(peso(1500 + 3500));
    expect(result.credit).toBe(peso(500));
    expect(result.balance).toBe(peso(4500));
    expect(result.overdue).toBe(peso(1500));
    expect(result.maxDaysOverdue).toBe(6);
  });
});

describe("settleMoveOut", () => {
  it("refunds what is left after deductions and unpaid charges", () => {
    expect(
      settleMoveOut({ depositHeld: peso(3500), deductions: peso(500), unpaid: peso(945) }),
    ).toEqual({
      depositHeld: peso(3500),
      depositToDeductions: peso(500),
      depositToUnpaid: peso(945),
      refund: peso(2055),
      remainingOwed: 0,
    });
  });

  it("leaves the rest owed when the deposit isn't enough", () => {
    expect(
      settleMoveOut({ depositHeld: peso(2500), deductions: peso(800), unpaid: peso(3500) }),
    ).toEqual({
      depositHeld: peso(2500),
      depositToDeductions: peso(800),
      depositToUnpaid: peso(1700),
      refund: 0,
      remainingOwed: peso(1800),
    });
  });

  it("handles no deposit", () => {
    expect(settleMoveOut({ depositHeld: 0, deductions: peso(300), unpaid: 0 })).toMatchObject({
      refund: 0,
      remainingOwed: peso(300),
    });
  });
});

describe("daysBetween", () => {
  it("counts across month ends and leap days", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-11-15", "2026-11-14")).toBe(-1);
  });
});

describe("allocateChosenFirst", () => {
  const charges: Charge[] = [
    { id: "old", dueDate: "2026-10-05", amount: peso(1000) },
    { id: "chosen", dueDate: "2026-11-05", amount: peso(3000) },
  ];

  it("pays the chosen bill first, then the oldest", () => {
    expect(allocateChosenFirst(peso(3500), charges, [], "chosen")).toEqual({
      allocations: [
        { chargeId: "chosen", amount: peso(3000) },
        { chargeId: "old", amount: peso(500) },
      ],
      credit: 0,
    });
  });

  it("falls back to oldest first without a (valid) choice", () => {
    expect(allocateChosenFirst(peso(1000), charges, [], null).allocations).toEqual([
      { chargeId: "old", amount: peso(1000) },
    ]);
    expect(allocateChosenFirst(peso(1000), charges, [], "gone").allocations[0].chargeId).toBe(
      "old",
    );
  });

  it("keeps the rest as credit", () => {
    expect(allocateChosenFirst(peso(4500), charges, [], "chosen").credit).toBe(peso(500));
  });
});
