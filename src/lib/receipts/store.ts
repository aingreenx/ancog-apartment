import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getReceiptData } from "./receipt-data";
import { renderReceiptPdf } from "./receipt-pdf";

/**
 * Render a receipt and keep a copy in the private `receipts` bucket at
 * `<tenancy>/receipt-<no>.pdf` (re-written when the receipt is voided, so the stored
 * copy says VOID too). Must be called with an admin's client.
 */
export async function storeReceiptPdf(supabase: SupabaseClient<Database>, receiptNo: number) {
  const data = await getReceiptData(supabase, receiptNo);
  if (!data) return null;
  const pdf = await renderReceiptPdf(data);
  const path = `${data.tenancyId}/receipt-${receiptNo}.pdf`;
  const { error } = await supabase.storage
    .from("receipts")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (!error && data.pdfPath !== path) {
    await supabase.from("receipts").update({ pdf_path: path }).eq("receipt_no", receiptNo);
  }
  return { pdf, data };
}

/** Receipt number for a payment, if it has one. */
export async function receiptNoForPayment(supabase: SupabaseClient<Database>, paymentId: string) {
  const { data } = await supabase
    .from("receipts")
    .select("receipt_no")
    .eq("payment_id", paymentId)
    .maybeSingle();
  return data?.receipt_no ?? null;
}
