// Move-in form: suggestions and validation. Pure functions (tested).

import { parsePesos } from "@/lib/money";

/** room3-frannie-4612: room number, first name, last 4 digits of phone 1. */
export function suggestUsername(room: number | null, firstName: string, phone: string): string {
  const name = firstName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)[0]
    .replace(/[^a-z0-9]/g, "");
  const last4 = phone.replace(/\D/g, "").slice(-4);
  return [room ? `room${room}` : "", name, last4].filter(Boolean).join("-");
}

const WORDS = [
  "mango",
  "papaya",
  "banana",
  "coconut",
  "lemon",
  "guava",
  "melon",
  "kalamansi",
  "river",
  "island",
  "harbor",
  "garden",
  "sunny",
  "breeze",
  "maple",
  "orchid",
];

/** Easy to read out loud, e.g. "mango-4821-orchid". The tenant must change it on first login. */
export function generateTempPassword(randomInt: (max: number) => number): string {
  const word = () => WORDS[randomInt(WORDS.length)];
  return `${word()}-${String(randomInt(10_000)).padStart(4, "0")}-${word()}`;
}

export interface MoveInInput {
  firstName: string;
  lastName: string;
  phone1: string;
  phone2: string;
  address: string;
  occupants: { name: string; phone: string }[];
  room: number;
  startDate: string;
  startingKwh: number;
  advance: number;
  deposit: number;
  username: string;
  password: string;
}

export type MoveInErrors = Partial<Record<keyof MoveInInput | "form", string>>;

const USERNAME = /^[a-z0-9][a-z0-9-]{2,63}$/;

export function parseMoveIn(
  form: FormData,
): { ok: true; value: MoveInInput } | { ok: false; errors: MoveInErrors } {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const errors: MoveInErrors = {};

  const firstName = text("firstName");
  const lastName = text("lastName");
  const phone1 = text("phone1");
  if (!firstName) errors.firstName = "Required.";
  if (!lastName) errors.lastName = "Required.";
  if (!phone1) errors.phone1 = "Required.";

  const room = Number(text("room"));
  if (!Number.isInteger(room) || room < 1 || room > 13) errors.room = "Pick a vacant room.";

  const startDate = text("startDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate))) {
    errors.startDate = "Pick the move-in date.";
  }

  const kwhText = text("startingKwh");
  const startingKwh = Number(kwhText);
  if (!/^\d+$/.test(kwhText) || !Number.isSafeInteger(startingKwh)) {
    errors.startingKwh = "Whole kWh only (the black digits).";
  }

  const advance = parsePesos(text("advance"));
  const deposit = parsePesos(text("deposit"));
  if (advance === null) errors.advance = "Enter an amount in pesos (0 is fine).";
  if (deposit === null) errors.deposit = "Enter an amount in pesos (0 is fine).";

  const username = text("username").toLowerCase();
  if (!USERNAME.test(username)) {
    errors.username = "3–64 characters: lowercase letters, numbers and dashes.";
  }
  const password = String(form.get("password") ?? "");
  if (password.length < 8) errors.password = "At least 8 characters.";

  const names = form.getAll("occupantName").map((v) => String(v).trim());
  const phones = form.getAll("occupantPhone").map((v) => String(v).trim());
  const occupants = names
    .map((name, i) => ({ name, phone: phones[i] ?? "" }))
    .filter((o) => o.name || o.phone);
  if (occupants.some((o) => !o.name)) errors.form = "Each extra occupant needs a name.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      firstName,
      lastName,
      phone1,
      phone2: text("phone2"),
      address: text("address"),
      occupants,
      room,
      startDate,
      startingKwh,
      advance: advance!,
      deposit: deposit!,
      username,
      password,
    },
  };
}
