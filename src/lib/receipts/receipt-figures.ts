// What a receipt says, computed as of the payment's date, so a receipt reads the same no
// matter when it is (re)printed or when the payment was typed in. Pure functions.

export interface ReceiptCharge {
  id: string;
  type: string;
  description: string;
  amount: number;
  dueDate: string;
  voided: boolean;
  prevKwh: number | null;
  currKwh: number | null;
  kwhUsed: number | null;
  rate: number | null;
}

export interface ReceiptPayment {
  id: string;
  amount: number;
  /** Date actually paid (YYYY-MM-DD). */
  paidOn: string;
  /** When it was recorded; orders payments made on the same day. */
  createdAt: string;
  /** Confirmed and not voided. */
  counts: boolean;
}

export interface ReceiptAllocation {
  paymentId: string;
  chargeId: string;
  amount: number;
}

export interface ReceiptFigures {
  kind: "Full payment" | "Partial payment" | "Advance / credit";
  items: { description: string; amount: number; paid: number; full: boolean }[];
  credit: number;
  balanceRemaining: number;
  electricity: {
    description: string;
    prevKwh: number;
    currKwh: number;
    kwhUsed: number;
    rate: number;
    amount: number;
  }[];
}

/** Was `p` made before `q`? By date paid, then by when it was recorded. */
function before(p: ReceiptPayment, q: ReceiptPayment): boolean {
  return p.paidOn < q.paidOn || (p.paidOn === q.paidOn && p.createdAt < q.createdAt);
}

/**
 * @param thisPayment  the receipt's payment
 * @param charges      every charge of the stay
 * @param payments     every payment of the stay
 * @param allocations  every non-void allocation of the stay
 */
export function receiptFigures(
  thisPayment: ReceiptPayment,
  charges: ReceiptCharge[],
  payments: ReceiptPayment[],
  allocations: ReceiptAllocation[],
): ReceiptFigures {
  const counted = new Map(payments.filter((p) => p.counts).map((p) => [p.id, p]));
  counted.set(thisPayment.id, thisPayment);
  const earlier = (paymentId: string) => {
    const p = counted.get(paymentId);
    return p !== undefined && p.id !== thisPayment.id && before(p, thisPayment);
  };
  const upToThis = [...counted.values()].filter(
    (p) => p.id === thisPayment.id || before(p, thisPayment),
  );

  const mine = allocations.filter((a) => a.paymentId === thisPayment.id);
  const items = mine.map((a) => {
    const charge = charges.find((c) => c.id === a.chargeId)!;
    const paidBefore = allocations
      .filter((x) => x.chargeId === a.chargeId && earlier(x.paymentId))
      .reduce((s, x) => s + x.amount, 0);
    return {
      description: charge.description,
      amount: charge.amount,
      paid: a.amount,
      full: paidBefore + a.amount >= charge.amount,
    };
  });

  // Owed by then: charges due by the payment date, plus any not-yet-due charges that
  // were already paid (in advance) by this or earlier payments.
  const paidAhead = new Set(
    allocations
      .filter((a) => a.paymentId === thisPayment.id || earlier(a.paymentId))
      .map((a) => a.chargeId),
  );
  const due = charges
    .filter((c) => !c.voided && (c.dueDate <= thisPayment.paidOn || paidAhead.has(c.id)))
    .reduce((s, c) => s + c.amount, 0);
  const paid = upToThis.reduce((s, p) => s + p.amount, 0);

  const electricity = mine
    .map((a) => charges.find((c) => c.id === a.chargeId)!)
    .filter((c) => c.type === "electricity" && c.kwhUsed !== null)
    .map((c) => ({
      description: c.description,
      prevKwh: c.prevKwh!,
      currKwh: c.currKwh!,
      kwhUsed: c.kwhUsed!,
      rate: c.rate!,
      amount: c.amount,
    }));

  const allocated = mine.reduce((s, a) => s + a.amount, 0);
  return {
    kind:
      items.length === 0
        ? "Advance / credit"
        : items.every((i) => i.full)
          ? "Full payment"
          : "Partial payment",
    items,
    credit: thisPayment.amount - allocated,
    balanceRemaining: Math.max(due - paid, 0),
    electricity,
  };
}
