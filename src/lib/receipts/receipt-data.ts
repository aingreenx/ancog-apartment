import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { receiptFigures, type ReceiptFigures } from "./receipt-figures";

export const DEFAULT_ADDRESS = "Prk. 6, Salvacion, Davao del Norte";

export interface ReceiptData {
  receiptNo: number;
  tenancyId: string;
  issuedAt: string;
  voided: { at: string; reason: string | null } | null;
  pdfPath: string | null;
  paidOn: string;
  amount: number;
  method: string;
  referenceNo: string | null;
  receivedFrom: string;
  room: number | null;
  address: string;
  receivedBy: string;
  signature: Uint8Array | null;
  figures: ReceiptFigures;
}

/**
 * Everything printed on a receipt. Uses the caller's client, so row-level security
 * decides who may see it (admins: all; tenants: their own). Null if not visible.
 */
export async function getReceiptData(
  supabase: SupabaseClient<Database>,
  receiptNo: number,
): Promise<ReceiptData | null> {
  const { data: receipt } = await supabase
    .from("receipts")
    .select(
      "receipt_no, issued_at, voided_at, void_reason, pdf_path, received_by, payment:payments(id, tenancy_id, paid_on, amount_centavos, method, reference_no, created_at, tenancy:tenancies(room:rooms(number), tenant:tenants(first_name, last_name)))",
    )
    .eq("receipt_no", receiptNo)
    .maybeSingle();
  if (!receipt?.payment) return null;
  const payment = receipt.payment;
  const tenancyId = payment.tenancy_id;

  const [charges, payments, allocations, receiver, settings] = await Promise.all([
    supabase
      .from("charges")
      .select(
        "id, type, description, amount_centavos, due_date, voided_at, prev_kwh, curr_kwh, kwh_used, rate_centavos_per_kwh",
      )
      .eq("tenancy_id", tenancyId),
    supabase
      .from("payments")
      .select("id, amount_centavos, paid_on, created_at, status, voided_at")
      .eq("tenancy_id", tenancyId),
    supabase
      .from("payment_allocations")
      .select("payment_id, charge_id, amount_centavos, payment:payments!inner(tenancy_id)")
      .eq("payment.tenancy_id", tenancyId)
      .is("voided_at", null),
    // Tenants can't read admin profiles; fall back below.
    supabase.from("profiles").select("display_name").eq("id", receipt.received_by).maybeSingle(),
    supabase.from("app_settings").select("apartment_address, receipt_signature_path").maybeSingle(),
  ]);
  if (charges.error || payments.error || allocations.error) return null;

  let signature: Uint8Array | null = null;
  const sigPath = settings.data?.receipt_signature_path;
  if (sigPath) {
    const { data } = await supabase.storage.from("receipts").download(sigPath);
    if (data) signature = new Uint8Array(await data.arrayBuffer());
  }

  const voided = receipt.voided_at;
  const figures = receiptFigures(
    // A voided receipt still shows what it originally said.
    {
      id: payment.id,
      amount: payment.amount_centavos,
      paidOn: payment.paid_on,
      createdAt: payment.created_at,
      counts: true,
    },
    charges.data.map((c) => ({
      id: c.id,
      type: c.type,
      description: c.description,
      amount: c.amount_centavos,
      dueDate: c.due_date,
      voided: c.voided_at !== null,
      prevKwh: c.prev_kwh,
      currKwh: c.curr_kwh,
      kwhUsed: c.kwh_used,
      rate: c.rate_centavos_per_kwh,
    })),
    payments.data.map((p) => ({
      id: p.id,
      amount: p.amount_centavos,
      paidOn: p.paid_on,
      createdAt: p.created_at,
      counts: p.id === payment.id || (p.status === "confirmed" && p.voided_at === null),
    })),
    allocations.data.map((a) => ({
      paymentId: a.payment_id,
      chargeId: a.charge_id,
      amount: a.amount_centavos,
    })),
  );

  const tenant = payment.tenancy?.tenant;
  return {
    receiptNo: receipt.receipt_no,
    tenancyId,
    issuedAt: receipt.issued_at,
    voided: voided ? { at: voided, reason: receipt.void_reason } : null,
    pdfPath: receipt.pdf_path,
    paidOn: payment.paid_on,
    amount: payment.amount_centavos,
    method: payment.method,
    referenceNo: payment.reference_no,
    receivedFrom: tenant ? `${tenant.first_name} ${tenant.last_name}` : "Unknown",
    room: payment.tenancy?.room?.number ?? null,
    address: settings.data?.apartment_address || DEFAULT_ADDRESS,
    receivedBy: receiver.data?.display_name ?? "Ancog Apartment",
    signature,
    figures,
  };
}
