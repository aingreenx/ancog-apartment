import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface UnpaidCharge {
  id: string;
  tenancyId: string;
  type: string;
  description: string;
  dueDate: string;
  amount: number;
  owed: number;
  status: string;
}

export interface StayOption {
  tenancyId: string;
  room: number;
  tenantName: string;
  active: boolean;
  credit: number;
  charges: UnpaidCharge[];
}

export interface RecentPayment {
  id: string;
  tenancyId: string;
  room: number | null;
  tenantName: string;
  paidOn: string;
  amount: number;
  method: string;
  referenceNo: string | null;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  receiptNo: number | null;
}

const name = (t: { first_name: string; last_name: string } | null) =>
  t ? `${t.first_name} ${t.last_name}` : "Unknown";

/** Unpaid (non-void) charges of one stay, oldest due first. Read fresh from the view. */
export async function getUnpaidCharges(tenancyId: string): Promise<UnpaidCharge[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("charge_balances")
    .select(
      "charge_id, tenancy_id, type, description, due_date, amount_centavos, owed_centavos, status",
    )
    .eq("tenancy_id", tenancyId)
    .gt("owed_centavos", 0)
    .order("due_date")
    // Same due date: rent, then electricity, then the rest (charge_type enum order).
    .order("type");
  if (error) throw new Error(`Couldn't load charges: ${error.message}`);
  return data.map((c) => ({
    id: c.charge_id!,
    tenancyId: c.tenancy_id!,
    type: c.type!,
    description: c.description!,
    dueDate: c.due_date!,
    amount: c.amount_centavos!,
    owed: c.owed_centavos!,
    status: c.status!,
  }));
}

/** Stays a payment can be recorded for: every active stay, plus past stays that still owe. */
export async function getStayOptions(): Promise<StayOption[]> {
  const supabase = await createClient();
  const [staysRes, chargesRes, balancesRes] = await Promise.all([
    supabase
      .from("tenancies")
      .select("id, status, room:rooms(number), tenant:tenants(first_name, last_name)"),
    supabase
      .from("charge_balances")
      .select(
        "charge_id, tenancy_id, type, description, due_date, amount_centavos, owed_centavos, status",
      )
      .gt("owed_centavos", 0)
      .order("due_date")
      .order("type"),
    supabase.from("tenancy_balances").select("tenancy_id, credit_centavos"),
  ]);
  for (const r of [staysRes, chargesRes, balancesRes]) {
    if (r.error) throw new Error(`Couldn't load stays: ${r.error.message}`);
  }
  const credit = new Map(balancesRes.data!.map((b) => [b.tenancy_id, b.credit_centavos ?? 0]));

  return staysRes
    .data!.map((s) => {
      const charges = chargesRes
        .data!.filter((c) => c.tenancy_id === s.id)
        .map((c) => ({
          id: c.charge_id!,
          tenancyId: c.tenancy_id!,
          type: c.type!,
          description: c.description!,
          dueDate: c.due_date!,
          amount: c.amount_centavos!,
          owed: c.owed_centavos!,
          status: c.status!,
        }));
      return {
        tenancyId: s.id,
        room: s.room?.number ?? 0,
        tenantName: name(s.tenant),
        active: s.status === "active",
        credit: credit.get(s.id) ?? 0,
        charges,
      };
    })
    .filter((s) => s.active || s.charges.length > 0)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.room - b.room);
}

export async function getRecentPayments(opts: { tenancyId?: string; limit?: number } = {}) {
  const supabase = await createClient();
  let q = supabase
    .from("payments")
    .select(
      "id, tenancy_id, paid_on, amount_centavos, method, reference_no, notes, voided_at, void_reason, status, receipts(receipt_no), tenancy:tenancies(room:rooms(number), tenant:tenants(first_name, last_name))",
    )
    .eq("status", "confirmed")
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 20);
  if (opts.tenancyId) q = q.eq("tenancy_id", opts.tenancyId);
  const { data, error } = await q;
  if (error) throw new Error(`Couldn't load payments: ${error.message}`);
  return data.map((p): RecentPayment => ({
    id: p.id,
    tenancyId: p.tenancy_id,
    room: p.tenancy?.room?.number ?? null,
    tenantName: name(p.tenancy?.tenant ?? null),
    paidOn: p.paid_on,
    amount: p.amount_centavos,
    method: p.method,
    referenceNo: p.reference_no,
    notes: p.notes,
    voidedAt: p.voided_at,
    voidReason: p.void_reason,
    receiptNo: p.receipts?.receipt_no ?? null,
  }));
}
