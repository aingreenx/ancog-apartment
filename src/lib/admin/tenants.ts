import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getRecentPayments } from "./payments";

const name = (t: { first_name: string; last_name: string } | null) =>
  t ? `${t.first_name} ${t.last_name}` : "Unknown";

export interface DirectoryRow {
  tenancyId: string;
  tenantName: string;
  phone: string;
  room: number;
  startDate: string;
  endDate: string | null;
  active: boolean;
  balance: number;
  overdue: number;
}

/** Every stay, current and past, with its balance. */
export async function getDirectory(): Promise<DirectoryRow[]> {
  const supabase = await createClient();
  const [stays, balances] = await Promise.all([
    supabase
      .from("tenancies")
      .select(
        "id, start_date, end_date, status, room:rooms(number), tenant:tenants(first_name, last_name, phone_1)",
      ),
    supabase.from("tenancy_balances").select("tenancy_id, balance_centavos, overdue_centavos"),
  ]);
  if (stays.error) throw new Error(`Couldn't load tenants: ${stays.error.message}`);
  if (balances.error) throw new Error(`Couldn't load balances: ${balances.error.message}`);
  const byStay = new Map(balances.data.map((b) => [b.tenancy_id, b]));

  return stays.data.map((s) => ({
    tenancyId: s.id,
    tenantName: name(s.tenant),
    phone: s.tenant?.phone_1 ?? "",
    room: s.room?.number ?? 0,
    startDate: s.start_date,
    endDate: s.end_date,
    active: s.status === "active",
    balance: byStay.get(s.id)?.balance_centavos ?? 0,
    overdue: byStay.get(s.id)?.overdue_centavos ?? 0,
  }));
}

export async function getTenantDetail(tenancyId: string) {
  const supabase = await createClient();
  const [stayRes, chargesRes, balanceRes, readingsRes, depositRes, payments] = await Promise.all([
    supabase
      .from("tenancies")
      .select(
        "id, status, start_date, end_date, due_day, monthly_rent_centavos, starting_kwh, deposit_required_centavos, advance_required_centavos, room:rooms(number), tenant:tenants(id, first_name, last_name, phone_1, phone_2, address, profile:profiles(id, username, must_change_password)), tenancy_occupants(id, name, phone)",
      )
      .eq("id", tenancyId)
      .maybeSingle(),
    supabase
      .from("charge_balances")
      .select(
        "charge_id, type, description, due_date, amount_centavos, paid_centavos, owed_centavos, status, days_overdue",
      )
      .eq("tenancy_id", tenancyId)
      .order("due_date", { ascending: false }),
    supabase
      .from("tenancy_balances")
      .select("owed_centavos, credit_centavos, balance_centavos, overdue_centavos")
      .eq("tenancy_id", tenancyId)
      .maybeSingle(),
    supabase
      .from("meter_readings")
      .select("id, reading_date, reading_kwh, kind, photo_path")
      .eq("tenancy_id", tenancyId)
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("charge_balances")
      .select("paid_centavos")
      .eq("tenancy_id", tenancyId)
      .eq("type", "deposit")
      .neq("status", "void"),
    getRecentPayments({ tenancyId, limit: 200 }),
  ]);
  for (const r of [stayRes, chargesRes, balanceRes, readingsRes, depositRes]) {
    if (r.error) throw new Error(`Couldn't load the tenant: ${r.error.message}`);
  }
  const stay = stayRes.data;
  if (!stay) return null;

  // Short-lived links to the private meter photos.
  const paths = readingsRes.data!.map((r) => r.photo_path).filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await supabase.storage.from("meter-photos").createSignedUrls(paths, 60 * 60);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  return {
    stay,
    charges: chargesRes.data!,
    balance: {
      owed: balanceRes.data?.owed_centavos ?? 0,
      credit: balanceRes.data?.credit_centavos ?? 0,
      balance: balanceRes.data?.balance_centavos ?? 0,
      overdue: balanceRes.data?.overdue_centavos ?? 0,
      depositHeld: depositRes.data!.reduce((s, d) => s + (d.paid_centavos ?? 0), 0),
    },
    readings: readingsRes.data!.map((r) => ({
      ...r,
      photoUrl: r.photo_path ? (signed.get(r.photo_path) ?? null) : null,
    })),
    payments,
  };
}

export type TenantDetail = NonNullable<Awaited<ReturnType<typeof getTenantDetail>>>;
