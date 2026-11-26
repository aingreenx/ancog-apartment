import "server-only";
import { cache } from "react";
import { todayInManila } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

// Everything here runs as the signed-in tenant: row-level security limits every query to
// their own rows, so there is no "where tenant = me" to forget.

/** The tenant's current stay, or their most recent one after moving out. */
export const getMyStay = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenancies")
    .select("id, status, start_date, end_date, due_day, monthly_rent_centavos, room:rooms(number)")
    .order("status") // 'active' sorts before 'ended'
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load your stay: ${error.message}`);
  return data;
});

export type MyStay = NonNullable<Awaited<ReturnType<typeof getMyStay>>>;

export interface MyBill {
  id: string;
  type: string;
  description: string;
  dueDate: string;
  amount: number;
  paid: number;
  owed: number;
  status: string;
  daysOverdue: number;
  electricity: { prevKwh: number; currKwh: number; kwhUsed: number; rate: number } | null;
}

export async function getMyBills(tenancyId: string): Promise<MyBill[]> {
  const supabase = await createClient();
  const [balances, charges] = await Promise.all([
    supabase
      .from("charge_balances")
      .select(
        "charge_id, type, description, due_date, amount_centavos, paid_centavos, owed_centavos, status, days_overdue",
      )
      .eq("tenancy_id", tenancyId)
      .neq("status", "void")
      .order("due_date", { ascending: false })
      .order("type"),
    supabase
      .from("charges")
      .select("id, prev_kwh, curr_kwh, kwh_used, rate_centavos_per_kwh")
      .eq("tenancy_id", tenancyId)
      .eq("type", "electricity"),
  ]);
  if (balances.error) throw new Error(`Couldn't load your bills: ${balances.error.message}`);
  const snap = new Map((charges.data ?? []).map((c) => [c.id, c]));
  return balances.data.map((b) => {
    const e = snap.get(b.charge_id!);
    return {
      id: b.charge_id!,
      type: b.type!,
      description: b.description!,
      dueDate: b.due_date!,
      amount: b.amount_centavos!,
      paid: b.paid_centavos!,
      owed: b.owed_centavos!,
      status: b.status!,
      daysOverdue: b.days_overdue!,
      electricity:
        e && e.kwh_used !== null
          ? {
              prevKwh: e.prev_kwh!,
              currKwh: e.curr_kwh!,
              kwhUsed: e.kwh_used,
              rate: e.rate_centavos_per_kwh!,
            }
          : null,
    };
  });
}

export async function getMyBalance(tenancyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenancy_balances")
    .select("owed_centavos, credit_centavos, balance_centavos, overdue_centavos, max_days_overdue")
    .eq("tenancy_id", tenancyId)
    .maybeSingle();
  return {
    owed: data?.owed_centavos ?? 0,
    credit: data?.credit_centavos ?? 0,
    balance: data?.balance_centavos ?? 0,
    overdue: data?.overdue_centavos ?? 0,
    maxDaysOverdue: data?.max_days_overdue ?? 0,
  };
}

export async function getMyReadings(tenancyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meter_readings")
    .select("id, reading_date, reading_kwh, kind, photo_path")
    .eq("tenancy_id", tenancyId)
    .order("reading_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't load your readings: ${error.message}`);
  const paths = data.map((r) => r.photo_path).filter((p): p is string => Boolean(p));
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("meter-photos")
      .createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return data.map((r) => ({
    ...r,
    photoUrl: r.photo_path ? (urls.get(r.photo_path) ?? null) : null,
  }));
}

export async function getMyPayments(tenancyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, paid_on, amount_centavos, method, reference_no, status, review_note, voided_at, void_reason, created_at, receipts(receipt_no, voided_at)",
    )
    .eq("tenancy_id", tenancyId)
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't load your payments: ${error.message}`);
  return data;
}

export function todayForPortal() {
  return todayInManila();
}
