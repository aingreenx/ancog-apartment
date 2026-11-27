// Production setup (#29): the 13 rooms from imports/private/rooms.csv. Pure (tested).

import { parsePesos } from "@/lib/money";

export interface RoomRow {
  number: number;
  rentCentavos: number;
  meterSerial: string | null;
}

/** Validates rooms.csv rows (`room`, `rent`, `meter_serial`): rooms 1–13, each once. */
export function planRooms(rows: Record<string, string>[]): { rooms: RoomRow[]; errors: string[] } {
  const errors: string[] = [];
  const rooms: RoomRow[] = [];
  rows.forEach((row, i) => {
    const line = `rooms.csv line ${i + 2}`;
    const number = Number(row.room);
    const rent = parsePesos(row.rent ?? "");
    const serial = (row.meter_serial ?? "").replace(/\s+/g, "").toUpperCase() || null;
    if (!Number.isInteger(number) || number < 1 || number > 13) {
      errors.push(`${line}: room must be 1–13 (got "${row.room ?? ""}").`);
      return;
    }
    if (rent === null || rent <= 0) {
      errors.push(`${line}: rent for room ${number} must be a peso amount like 3500.`);
      return;
    }
    rooms.push({ number, rentCentavos: rent, meterSerial: serial });
  });

  const seen = new Map<number, number>();
  for (const r of rooms) seen.set(r.number, (seen.get(r.number) ?? 0) + 1);
  for (const [n, count] of seen) if (count > 1) errors.push(`Room ${n} is listed ${count} times.`);
  const missing = Array.from({ length: 13 }, (_, i) => i + 1).filter((n) => !seen.has(n));
  if (missing.length > 0) errors.push(`Missing rooms: ${missing.join(", ")}.`);
  const serials = rooms.map((r) => r.meterSerial).filter((s): s is string => s !== null);
  const dupes = serials.filter((s, i) => serials.indexOf(s) !== i);
  if (dupes.length > 0)
    errors.push(`The same meter serial is on two rooms: ${[...new Set(dupes)].join(", ")}.`);

  return { rooms: rooms.sort((a, b) => a.number - b.number), errors };
}

/** Admin profile username from their email: "Maria.Ancog@gmail.com" → "maria.ancog". */
export function adminUsername(email: string): string | null {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  const name = local.replace(/[^a-z0-9._-]/g, "");
  return name.length >= 3 && name.length <= 64 ? name : null;
}
