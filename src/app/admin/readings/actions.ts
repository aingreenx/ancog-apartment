"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type RecordReadingResult =
  | { ok: true; room: number; kwhUsed: number; rate: number; amount: number; prevKwh: number }
  | { ok: false; error: string; field?: "kwh" | "newMeterKwh" | "date" | "photo" };

const WHOLE = /^\d+$/;

export async function recordReading(formData: FormData): Promise<RecordReadingResult> {
  await requireUser("admin");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const room = Number(formData.get("room"));
  const date = String(formData.get("date") ?? "");
  const kwhText = String(formData.get("kwh") ?? "").trim();
  const meterChange = formData.get("meterChange") === "on";
  const newMeterText = String(formData.get("newMeterKwh") ?? "").trim();
  const photoPath = String(formData.get("photoPath") ?? "") || null;

  if (!tenancyId) return { ok: false, error: "Pick a room." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick a date.", field: "date" };
  if (!WHOLE.test(kwhText)) {
    return { ok: false, error: "Whole kWh only (the black digits).", field: "kwh" };
  }
  if (meterChange && !WHOLE.test(newMeterText)) {
    return { ok: false, error: "Enter the new meter's starting reading.", field: "newMeterKwh" };
  }
  if (photoPath && !photoPath.startsWith(`${tenancyId}/`)) {
    return {
      ok: false,
      error: "The photo upload didn't match this room. Try again.",
      field: "photo",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_meter_reading", {
    p_tenancy_id: tenancyId,
    p_reading_date: date,
    p_reading_kwh: Number(kwhText),
    p_photo_path: photoPath ?? undefined,
    p_new_meter_kwh: meterChange ? Number(newMeterText) : undefined,
  });

  if (error) {
    // Messages from record_meter_reading() are written for people; show them as-is.
    const known = /lower than|before the previous|No electricity rate|not active/.test(
      error.message,
    );
    if (photoPath) await supabase.storage.from("meter-photos").remove([photoPath]);
    return {
      ok: false,
      error: known ? error.message : "Couldn't save the reading. Please try again.",
      field: /lower/.test(error.message)
        ? "kwh"
        : /before the previous/.test(error.message)
          ? "date"
          : undefined,
    };
  }

  const result = data as {
    prev_kwh: number;
    kwh_used: number;
    rate_centavos_per_kwh: number;
    amount_centavos: number;
  };
  refresh();
  return {
    ok: true,
    room,
    prevKwh: result.prev_kwh,
    kwhUsed: result.kwh_used,
    rate: result.rate_centavos_per_kwh,
    amount: result.amount_centavos,
  };
}
