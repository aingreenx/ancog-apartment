// Amount in words for receipts, e.g. 397200 → "Three Thousand Nine Hundred Seventy-Two Pesos Only".

const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion"];

function belowThousand(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest >= 20)
    parts.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${ONES[rest % 10]}` : ""));
  else if (rest > 0) parts.push(ONES[rest]);
  return parts.join(" ");
}

/** Whole number in English words (0 – 999,999,999,999). */
export function numberToWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0 || n >= 1e12) throw new Error(`Can't spell ${n}`);
  if (n === 0) return ONES[0];
  const groups: string[] = [];
  for (let scale = 0; n > 0; scale++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) groups.unshift(belowThousand(chunk) + (SCALES[scale] ? ` ${SCALES[scale]}` : ""));
  }
  return groups.join(" ");
}

/** Centavos → "… Pesos and NN/100 Only" (or "… Pesos Only" for whole pesos). */
export function pesoToWords(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0)
    throw new Error(`Invalid amount ${centavos}`);
  const pesos = Math.floor(centavos / 100);
  const cents = centavos % 100;
  const unit = pesos === 1 ? "Peso" : "Pesos";
  const words = `${numberToWords(pesos)} ${unit}`;
  return cents ? `${words} and ${String(cents).padStart(2, "0")}/100 Only` : `${words} Only`;
}
