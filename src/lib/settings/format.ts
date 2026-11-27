// Settings input checks. Pure functions (tested).

/**
 * A Philippine mobile number as 11 digits ("09171234567"), or null if it isn't one.
 * Accepts spaces, dashes and the +63 / 63 prefix.
 */
export function normalizeMobile(input: string): string | null {
  let digits = input.replace(/[\s()-]/g, "");
  if (digits.startsWith("+63")) digits = `0${digits.slice(3)}`;
  else if (/^63\d{10}$/.test(digits)) digits = `0${digits.slice(2)}`;
  return /^09\d{9}$/.test(digits) ? digits : null;
}

/** "09171234567" → "0917 123 4567". Anything else is returned as is. */
export function formatMobile(number: string): string {
  return /^09\d{9}$/.test(number)
    ? `${number.slice(0, 4)} ${number.slice(4, 7)} ${number.slice(7)}`
    : number;
}

/** Trimmed text, or null when empty. */
export function optionalText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text === "" ? null : text;
}

/** Meter serials: trimmed, upper-case, inner spaces removed. Null when empty. */
export function normalizeSerial(value: FormDataEntryValue | null): string | null {
  const serial = String(value ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  return serial === "" ? null : serial;
}

/** Serials used by more than one room (after normalizing), e.g. ["AB123"]. */
export function duplicateSerials(serials: (string | null)[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const s of serials) {
    if (!s) continue;
    if (seen.has(s)) dupes.add(s);
    seen.add(s);
  }
  return [...dupes];
}

export const SETTINGS_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const SETTINGS_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Paths the admin's browser may upload to: `gcash-qr/<uuid>.<ext>` or `signature/<uuid>.png`. */
export function isSettingsImagePath(kind: "gcash-qr" | "signature", path: string): boolean {
  const ext = kind === "signature" ? "png" : "(png|jpg|jpeg|webp)";
  return new RegExp(`^${kind}/[0-9a-f-]{36}\.${ext}$`).test(path);
}
