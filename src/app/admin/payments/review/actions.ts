"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { getUnpaidCharges } from "@/lib/admin/payments";
import { allocateChosenFirst, allocatePayment } from "@/lib/billing/balances";
import { receiptNoForPayment, storeReceiptPdf } from "@/lib/receipts/store";
import { createClient } from "@/lib/supabase/server";

export type ReviewState =
  { status: "idle" } | { status: "error"; error: string } | { status: "done" };

export async function confirmPayment(_prev: ReviewState, form: FormData): Promise<ReviewState> {
  await requireUser("admin");
  const paymentId = String(form.get("paymentId") ?? "");
  const mode = String(form.get("mode") ?? "chosen"); // chosen | oldest | credit

  const supabase = await createClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id, tenancy_id, amount_centavos, for_charge_id, status")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment || payment.status !== "pending_review") {
    return { status: "error", error: "This payment was already reviewed." };
  }

  // Allocate against what is owed right now.
  const unpaid = await getUnpaidCharges(payment.tenancy_id);
  const charges = unpaid.map((c) => ({ id: c.id, dueDate: c.dueDate, amount: c.owed }));
  const plan =
    mode === "credit"
      ? { allocations: [], credit: payment.amount_centavos }
      : mode === "oldest"
        ? allocatePayment(payment.amount_centavos, charges, [])
        : allocateChosenFirst(payment.amount_centavos, charges, [], payment.for_charge_id);

  const { error } = await supabase.rpc("confirm_payment", {
    p_payment_id: paymentId,
    p_allocations: plan.allocations.map((a) => ({
      charge_id: a.chargeId,
      amount_centavos: a.amount,
    })),
  });
  if (error) return { status: "error", error: "Couldn't confirm. Please try again." };

  const receiptNo = await receiptNoForPayment(supabase, paymentId);
  if (receiptNo) await storeReceiptPdf(supabase, receiptNo).catch(() => null);
  refresh();
  return { status: "done" };
}

export async function rejectPayment(_prev: ReviewState, form: FormData): Promise<ReviewState> {
  await requireUser("admin");
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { status: "error", error: "Tell the tenant why." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_payment", {
    p_payment_id: String(form.get("paymentId") ?? ""),
    p_reason: reason,
  });
  if (error) return { status: "error", error: "Couldn't reject. It may already be reviewed." };
  refresh();
  return { status: "done" };
}
