"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { parsePesos } from "@/lib/money";
import { receiptNoForPayment, storeReceiptPdf } from "@/lib/receipts/store";
import { createClient } from "@/lib/supabase/server";

export type MoveOutState = { status: "idle" } | { status: "error"; error: string };

export async function moveOut(_prev: MoveOutState, form: FormData): Promise<MoveOutState> {
  await requireUser("admin");
  const tenancyId = String(form.get("tenancyId") ?? "");
  const date = String(form.get("date") ?? "");
  const kwhText = String(form.get("finalKwh") ?? "").trim();
  const notes = String(form.get("notes") ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { status: "error", error: "Pick the move-out date." };
  if (kwhText && !/^\d+$/.test(kwhText))
    return { status: "error", error: "Final reading: whole kWh only." };

  const names = form.getAll("deductionName").map((v) => String(v).trim());
  const amounts = form.getAll("deductionAmount").map((v) => String(v).trim());
  const deductions: { description: string; amount_centavos: number }[] = [];
  for (let i = 0; i < names.length; i++) {
    if (!names[i] && !amounts[i]) continue;
    const amount = parsePesos(amounts[i] ?? "");
    if (!names[i] || amount === null || amount <= 0) {
      return { status: "error", error: "Each deduction needs a description and an amount." };
    }
    deductions.push({ description: names[i], amount_centavos: amount });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("move_out", {
    p_tenancy_id: tenancyId,
    p_date: date,
    p_final_kwh: kwhText ? Number(kwhText) : (null as unknown as number),
    p_deductions: deductions,
    p_notes: notes,
  });
  if (error) {
    const known =
      /lower than|before the previous|No electricity rate|not active|before the move-in/.test(
        error.message,
      );
    return {
      status: "error",
      error: known ? error.message : "Couldn't save the move-out. Nothing was changed.",
    };
  }

  // Store the receipt for the deposit application, if there was one.
  const { data: dep } = await supabase
    .from("payments")
    .select("id")
    .eq("tenancy_id", tenancyId)
    .eq("method", "deposit")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (dep) {
    const no = await receiptNoForPayment(supabase, dep.id);
    if (no) await storeReceiptPdf(supabase, no).catch(() => null);
  }

  redirect(`/admin/tenants/${tenancyId}/settlement`);
}
