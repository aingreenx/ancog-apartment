"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { getUnpaidCharges } from "@/lib/admin/payments";
import { allocatePayment } from "@/lib/billing/balances";
import { parsePesos } from "@/lib/money";
import { receiptNoForPayment, storeReceiptPdf } from "@/lib/receipts/store";
import { createClient } from "@/lib/supabase/server";

export type RecordPaymentResult =
  | { ok: true; paymentId: string; allocated: number; credit: number; receiptNo: number | null }
  | { ok: false; error: string; field?: "amount" | "date" | "method" | "pick" | "proof" };

const METHODS = ["cash", "gcash", "bank"] as const;

export async function recordPayment(formData: FormData): Promise<RecordPaymentResult> {
  await requireUser("admin");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const paidOn = String(formData.get("paidOn") ?? "");
  const amount = parsePesos(String(formData.get("amount") ?? ""));
  const method = String(formData.get("method") ?? "") as (typeof METHODS)[number];
  const referenceNo = String(formData.get("referenceNo") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const proofPath = String(formData.get("proofPath") ?? "") || null;
  const mode = formData.get("mode") === "pick" ? "pick" : "auto";
  const picked = formData.getAll("pick").map(String);

  if (!tenancyId) return { ok: false, error: "Pick a tenant." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    return { ok: false, error: "Enter the date it was actually paid.", field: "date" };
  }
  if (amount === null || amount <= 0) {
    return { ok: false, error: "Enter the amount in pesos.", field: "amount" };
  }
  if (!METHODS.includes(method)) return { ok: false, error: "Pick a method.", field: "method" };
  if (mode === "pick" && picked.length === 0) {
    return { ok: false, error: "Tick the charges this payment is for.", field: "pick" };
  }
  if (proofPath && !proofPath.startsWith(`${tenancyId}/`)) {
    return { ok: false, error: "The proof upload didn't match this tenant.", field: "proof" };
  }

  // Allocate against what is owed right now (not what the form saw).
  const unpaid = await getUnpaidCharges(tenancyId);
  const charges = unpaid.map((c) => ({ id: c.id, dueDate: c.dueDate, amount: c.owed }));
  let plan;
  try {
    plan = allocatePayment(amount, charges, [], mode === "pick" ? { pick: picked } : {});
  } catch {
    return {
      ok: false,
      error: "Some ticked charges are already paid. Reload and try again.",
      field: "pick",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_payment", {
    p_tenancy_id: tenancyId,
    p_paid_on: paidOn,
    p_amount_centavos: amount,
    p_method: method,
    p_reference_no: referenceNo,
    p_proof_path: proofPath ?? "",
    p_notes: notes,
    p_allocations: plan.allocations.map((a) => ({
      charge_id: a.chargeId,
      amount_centavos: a.amount,
    })),
  });
  if (error || !data) {
    if (proofPath) await supabase.storage.from("payment-proofs").remove([proofPath]);
    return { ok: false, error: "Couldn't save the payment. Nothing was saved; please try again." };
  }

  // The receipt row is created by the database; render and store its PDF now. A failure
  // here doesn't undo the payment: the PDF is rendered again whenever it is opened.
  const receiptNo = await receiptNoForPayment(supabase, data);
  if (receiptNo) await storeReceiptPdf(supabase, receiptNo).catch(() => null);

  refresh();
  return {
    ok: true,
    paymentId: data,
    allocated: amount - plan.credit,
    credit: plan.credit,
    receiptNo,
  };
}

export type VoidState =
  { status: "idle" } | { status: "error"; error: string } | { status: "done" };

export async function voidPayment(_prev: VoidState, formData: FormData): Promise<VoidState> {
  await requireUser("admin");
  const paymentId = String(formData.get("paymentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { status: "error", error: "Give a reason." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) {
    return {
      status: "error",
      error: /already void/.test(error.message) ? "Already void." : "Couldn't void the payment.",
    };
  }
  // Re-store the receipt PDF so the kept copy says VOID too.
  const receiptNo = await receiptNoForPayment(supabase, paymentId);
  if (receiptNo) await storeReceiptPdf(supabase, receiptNo).catch(() => null);
  refresh();
  return { status: "done" };
}
