"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { parsePesos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type AddRateState =
  | { status: "idle" }
  | { status: "error"; errors: { date?: string; rate?: string; form?: string } }
  | { status: "done"; key: number };

export async function addRate(_prev: AddRateState, formData: FormData): Promise<AddRateState> {
  const admin = await requireUser("admin");

  const date = String(formData.get("date") ?? "");
  const rate = parsePesos(String(formData.get("rate") ?? ""));
  const note = String(formData.get("note") ?? "").trim();

  const errors: { date?: string; rate?: string } = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    errors.date = "Pick a date.";
  }
  if (rate === null || rate <= 0) errors.rate = "Enter ₱ per kWh, up to 2 decimals (e.g. 13.75).";
  if (Object.keys(errors).length > 0) return { status: "error", errors };

  const supabase = await createClient();
  const { error } = await supabase.from("electricity_rates").insert({
    effective_date: date,
    rate_centavos_per_kwh: rate!,
    source_note: note || null,
    created_by: admin.id,
  });
  if (error) {
    return {
      status: "error",
      errors:
        error.code === "23505"
          ? { date: "There is already a rate for this date." }
          : { form: "Couldn't save the rate. Please try again." },
    };
  }

  refresh();
  return { status: "done", key: Date.now() };
}
