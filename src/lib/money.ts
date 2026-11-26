// Money and date helpers shared by the admin and tenant screens.
// Money is always integer centavos (₱1.00 = 100).

import type { Centavos } from "./billing/electricity";

const pesoWhole = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const pesoCents = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₱3,972 for whole pesos, ₱13.75 otherwise. */
export function formatPeso(amount: Centavos): string {
  return amount % 100 === 0 ? pesoWhole.format(amount / 100) : pesoCents.format(amount / 100);
}

/**
 * Parse what an admin typed as pesos ("2,500", "₱13.5", "13.75") into centavos.
 * Up to 2 decimals, never negative. Returns null if it isn't a valid amount.
 */
export function parsePesos(input: string): Centavos | null {
  const value = input.replace(/[₱,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const centavos = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/** Centavos → the plain text an <input> should show, e.g. 250000 → "2500", 1375 → "13.75". */
export function centavosToInput(amount: Centavos): string {
  return amount % 100 === 0 ? String(amount / 100) : (amount / 100).toFixed(2);
}

/** Today's date in Manila as YYYY-MM-DD, whatever the server's timezone. */
export function todayInManila(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "Nov 26, 2026" from YYYY-MM-DD. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
