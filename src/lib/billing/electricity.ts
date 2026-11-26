// Billing rules for Panabo Ancog Apartment.
// All money is in integer centavos (₱1.00 = 100). kWh readings are whole numbers.

export type Centavos = number;

export interface ElectricityRate {
  /** ISO date (YYYY-MM-DD) the rate was entered / takes effect */
  effectiveDate: string;
  /** ₱ per kWh in centavos, e.g. ₱13.50 → 1350 */
  centavosPerKwh: Centavos;
}

export interface ElectricityBill {
  prevKwh: number;
  currKwh: number;
  kwhUsed: number;
  centavosPerKwh: Centavos;
  amount: Centavos; // rounded to the nearest peso
}

/**
 * The rate for a reading is the newest rate entered on or before the reading date.
 * Example: Dec rate entered Dec 15 → a Dec 3 reading uses Nov's rate, a Dec 20 reading uses Dec's.
 */
export function rateForReading(rates: ElectricityRate[], readingDate: string): ElectricityRate {
  const eligible = rates
    .filter((r) => r.effectiveDate <= readingDate)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const rate = eligible.at(-1);
  if (!rate) throw new Error(`No electricity rate entered on or before ${readingDate}`);
  return rate;
}

/** Round centavos to the nearest whole peso (half up). */
export function roundToPeso(amount: Centavos): Centavos {
  return Math.round(amount / 100) * 100;
}

/** kWh used × rate, rounded to the nearest peso. */
export function computeElectricityBill(
  prevKwh: number,
  currKwh: number,
  centavosPerKwh: Centavos,
): ElectricityBill {
  if (!Number.isInteger(prevKwh) || !Number.isInteger(currKwh)) {
    throw new Error("Meter readings must be whole kWh (black digits only)");
  }
  if (currKwh < prevKwh) {
    throw new Error(`Reading ${currKwh} is lower than the previous reading ${prevKwh}`);
  }
  const kwhUsed = currKwh - prevKwh;
  return {
    prevKwh,
    currKwh,
    kwhUsed,
    centavosPerKwh,
    amount: roundToPeso(kwhUsed * centavosPerKwh),
  };
}

/**
 * Due date for a given month. Due days 29–31 move to the last day of shorter months.
 * month is 1–12.
 */
export function dueDateFor(year: number, month: number, dueDay: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(dueDay, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
