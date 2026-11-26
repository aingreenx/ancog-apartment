"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { sendPendingPushes } from "@/lib/notifications/push";
import { requireUser } from "@/lib/auth/dal";
import { parsePesos, todayInManila } from "@/lib/money";
import { getMyStay } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

export type SubmitResult = { ok: true } | { ok: false; error: string; field?: string };

/** A tenant tells us they sent money by GCash. Saved as "waiting for confirmation". */
export async function submitGcashPayment(form: FormData): Promise<SubmitResult> {
  const user = await requireUser("tenant");
  const stay = await getMyStay();
  if (!stay) return { ok: false, error: "Your stay isn't set up yet." };

  const amount = parsePesos(String(form.get("amount") ?? ""));
  const referenceNo = String(form.get("referenceNo") ?? "").trim();
  const paidOn = String(form.get("paidOn") ?? "");
  const proofPath = String(form.get("proofPath") ?? "") || null;
  const chargeId = String(form.get("chargeId") ?? "") || null;

  if (amount === null || amount <= 0) {
    return { ok: false, error: "Enter the amount you sent.", field: "amount" };
  }
  if (!/^[A-Za-z0-9 -]{4,40}$/.test(referenceNo)) {
    return {
      ok: false,
      error: "Enter the GCash reference number (Ref No.).",
      field: "referenceNo",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > todayInManila() || paidOn < stay.start_date) {
    return { ok: false, error: "Enter the date you sent it.", field: "paidOn" };
  }
  if (proofPath && !proofPath.startsWith(`${stay.id}/`)) {
    return { ok: false, error: "The screenshot upload didn't work. Try again.", field: "proof" };
  }

  // Row-level security only lets this through as pending_review, for the tenant's own stay.
  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({
    tenancy_id: stay.id,
    paid_on: paidOn,
    amount_centavos: amount,
    method: "gcash",
    reference_no: referenceNo,
    proof_path: proofPath,
    status: "pending_review",
    submitted_by: user.id,
    for_charge_id: chargeId,
  });
  if (error) {
    if (proofPath) await supabase.storage.from("payment-proofs").remove([proofPath]);
    return { ok: false, error: "Couldn't send it. Please try again." };
  }
  after(() => sendPendingPushes().catch(() => null));
  refresh();
  return { ok: true };
}
