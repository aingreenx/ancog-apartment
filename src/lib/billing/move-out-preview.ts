import { settleMoveOut, type MoveOutSettlement } from "./balances";
import type { Centavos } from "./electricity";

export interface MoveOutPreviewInput {
  /** Owed now on everything except deposit charges. */
  owed: Centavos;
  /** Unallocated payments. */
  credit: Centavos;
  /** Paid towards the deposit. */
  depositHeld: Centavos;
  finalBill: Centavos;
  deductions: Centavos;
}

export interface MoveOutPreview extends MoveOutSettlement {
  creditUsed: Centavos;
  /** Credit that nothing needed: returned with the refund. */
  creditLeft: Centavos;
}

/**
 * The order move_out() uses: existing credit pays the oldest charges first (the final
 * electricity bill counts before deductions), then the deposit covers deductions, then
 * the rest.
 */
export function previewMoveOut(i: MoveOutPreviewInput): MoveOutPreview {
  const other = i.owed + i.finalBill;
  const creditToOther = Math.min(i.credit, other);
  const creditToDeductions = Math.min(i.credit - creditToOther, i.deductions);
  const s = settleMoveOut({
    depositHeld: i.depositHeld,
    deductions: i.deductions - creditToDeductions,
    unpaid: other - creditToOther,
  });
  const creditUsed = creditToOther + creditToDeductions;
  return { ...s, creditUsed, creditLeft: i.credit - creditUsed };
}
