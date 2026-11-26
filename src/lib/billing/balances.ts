// How payments settle charges. Pure functions: no database, no UI.
// All money is integer centavos (₱1.00 = 100). Dates are ISO strings (YYYY-MM-DD).
// Mirrors the charge_balances / tenancy_balances views in the database.

import type { Centavos } from "./electricity";

export interface Charge {
  id: string;
  dueDate: string;
  amount: Centavos;
  voided?: boolean;
}

export interface Allocation {
  chargeId: string;
  amount: Centavos;
  voided?: boolean;
}

export type ChargeStatus = "paid" | "partial" | "unpaid" | "overdue" | "void";

export interface ChargeBalance {
  chargeId: string;
  dueDate: string;
  amount: Centavos;
  paid: Centavos;
  owed: Centavos;
  status: ChargeStatus;
  daysOverdue: number;
}

function assertCentavos(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole, non-negative number of centavos`);
  }
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). Negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`Invalid date: ${from} or ${to}`);
  return Math.round(ms / 86_400_000);
}

/** Paid so far on a charge: its non-voided allocations. */
export function paidOn(chargeId: string, allocations: Allocation[]): Centavos {
  return allocations
    .filter((a) => a.chargeId === chargeId && !a.voided)
    .reduce((sum, a) => sum + a.amount, 0);
}

/**
 * Balance and status of one charge on `today`.
 * Overdue starts the day after the due date. There is no late fee.
 */
export function chargeBalance(
  charge: Charge,
  allocations: Allocation[],
  today: string,
): ChargeBalance {
  const paid = paidOn(charge.id, allocations);
  const base = { chargeId: charge.id, dueDate: charge.dueDate, amount: charge.amount, paid };

  if (charge.voided) return { ...base, owed: 0, status: "void", daysOverdue: 0 };

  const owed = Math.max(charge.amount - paid, 0);
  const late = daysBetween(charge.dueDate, today);

  if (owed === 0) return { ...base, owed, status: "paid", daysOverdue: 0 };
  if (late > 0) return { ...base, owed, status: "overdue", daysOverdue: late };
  return { ...base, owed, status: paid > 0 ? "partial" : "unpaid", daysOverdue: 0 };
}

export interface TenancyBalance {
  charges: ChargeBalance[];
  owed: Centavos;
  /** Confirmed payment money not allocated to any charge. */
  credit: Centavos;
  /** owed − credit. Negative means the tenant is ahead. */
  balance: Centavos;
  overdue: Centavos;
  maxDaysOverdue: number;
}

/**
 * Totals for a stay. `paymentsTotal` is the sum of confirmed, non-voided payments;
 * whatever isn't allocated to a charge is credit.
 */
export function tenancyBalance(
  charges: Charge[],
  allocations: Allocation[],
  paymentsTotal: Centavos,
  today: string,
): TenancyBalance {
  const balances = charges.map((c) => chargeBalance(c, allocations, today));
  const owed = balances.reduce((s, b) => s + b.owed, 0);
  const allocated = allocations.filter((a) => !a.voided).reduce((s, a) => s + a.amount, 0);
  const credit = paymentsTotal - allocated;
  const overdueRows = balances.filter((b) => b.status === "overdue");
  return {
    charges: balances,
    owed,
    credit,
    balance: owed - credit,
    overdue: overdueRows.reduce((s, b) => s + b.owed, 0),
    maxDaysOverdue: overdueRows.reduce((m, b) => Math.max(m, b.daysOverdue), 0),
  };
}

export interface AllocationPlan {
  allocations: { chargeId: string; amount: Centavos }[];
  /** Left over after paying the chosen charges; kept as credit on the stay. */
  credit: Centavos;
}

/**
 * Split a payment across charges.
 * - Default: oldest due date first (ties keep the given order).
 * - `pick`: pay only these charges, in the order given (the notebook often pays specific bills).
 * A charge is never paid beyond what is still owed. Partial payments are fine;
 * any leftover becomes credit.
 */
export function allocatePayment(
  amount: Centavos,
  charges: Charge[],
  allocations: Allocation[],
  options: { pick?: string[] } = {},
): AllocationPlan {
  assertCentavos(amount, "Payment amount");

  let targets: Charge[];
  if (options.pick) {
    targets = options.pick.map((id) => {
      const charge = charges.find((c) => c.id === id);
      if (!charge) throw new Error(`Unknown charge ${id}`);
      if (charge.voided) throw new Error(`Charge ${id} is voided`);
      return charge;
    });
  } else {
    targets = charges
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !c.voided)
      .sort((a, b) => a.c.dueDate.localeCompare(b.c.dueDate) || a.i - b.i)
      .map(({ c }) => c);
  }

  let remaining = amount;
  const plan: AllocationPlan["allocations"] = [];
  for (const charge of targets) {
    if (remaining === 0) break;
    const owed = charge.amount - paidOn(charge.id, allocations);
    if (owed <= 0) continue;
    const pay = Math.min(owed, remaining);
    plan.push({ chargeId: charge.id, amount: pay });
    remaining -= pay;
  }
  return { allocations: plan, credit: remaining };
}

export interface MoveOutInput {
  depositHeld: Centavos;
  /** Unpaid charges at move-out (rent, electricity, custom). */
  unpaid: Centavos;
  /** Cleaning, aircon cleaning, missing items… */
  deductions: Centavos;
}

export interface MoveOutSettlement {
  depositHeld: Centavos;
  /** Part of the deposit used for deductions. */
  depositToDeductions: Centavos;
  /** Part of the deposit used for unpaid charges. */
  depositToUnpaid: Centavos;
  /** Deposit left over, returned to the tenant. */
  refund: Centavos;
  /** What the tenant still owes when the deposit isn't enough. */
  remainingOwed: Centavos;
}

/**
 * Move-out: the deposit covers deductions first, then unpaid charges.
 * Any leftover is refunded; if it isn't enough, the tenant still owes the rest.
 */
export function settleMoveOut({
  depositHeld,
  unpaid,
  deductions,
}: MoveOutInput): MoveOutSettlement {
  assertCentavos(depositHeld, "Deposit");
  assertCentavos(unpaid, "Unpaid amount");
  assertCentavos(deductions, "Deductions");

  const depositToDeductions = Math.min(depositHeld, deductions);
  const depositToUnpaid = Math.min(depositHeld - depositToDeductions, unpaid);
  const used = depositToDeductions + depositToUnpaid;
  return {
    depositHeld,
    depositToDeductions,
    depositToUnpaid,
    refund: depositHeld - used,
    remainingOwed: deductions + unpaid - used,
  };
}

/**
 * A tenant's GCash payment for a specific bill: that bill first, then whatever else is
 * owed (oldest first). Anything left over is credit.
 */
export function allocateChosenFirst(
  amount: Centavos,
  charges: Charge[],
  allocations: Allocation[],
  chosenId: string | null,
): AllocationPlan {
  const chosen = chosenId && charges.some((c) => c.id === chosenId && !c.voided) ? chosenId : null;
  if (!chosen) return allocatePayment(amount, charges, allocations);
  const first = allocatePayment(amount, charges, allocations, { pick: [chosen] });
  const rest = allocatePayment(first.credit, charges, [...allocations, ...first.allocations]);
  return { allocations: [...first.allocations, ...rest.allocations], credit: rest.credit };
}
