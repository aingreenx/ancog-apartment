import "server-only";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { buildLedger, monthBounds, type Ledger } from "./ledger";

/** Load everything the ledger needs for a month and build it. */
export async function getLedger(month: string): Promise<Ledger> {
  const supabase = await createClient();
  const { end } = monthBounds(month);

  const [rooms, stays, charges, payments, allocations] = await Promise.all([
    supabase.from("rooms").select("number"),
    supabase
      .from("tenancies")
      .select("id, start_date, end_date, room:rooms(number), tenant:tenants(first_name, last_name)")
      .lte("start_date", end),
    fetchAll((from, to) =>
      supabase
        .from("charges")
        .select(
          "id, tenancy_id, type, due_date, amount_centavos, voided_at, prev_kwh, curr_kwh, kwh_used, rate_centavos_per_kwh",
        )
        .lte("due_date", end)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("payments")
        .select("id, tenancy_id, paid_on, amount_centavos")
        .eq("status", "confirmed")
        .is("voided_at", null)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("payment_allocations")
        .select("payment_id, charge_id, amount_centavos")
        .is("voided_at", null)
        .order("id")
        .range(from, to),
    ),
  ]);
  for (const r of [rooms, stays]) {
    if (r.error) throw new Error(`Couldn't load the ledger: ${r.error.message}`);
  }

  return buildLedger(
    month,
    rooms.data!.map((r) => r.number),
    stays.data!.map((s) => ({
      tenancyId: s.id,
      room: s.room?.number ?? 0,
      tenantName: s.tenant ? `${s.tenant.first_name} ${s.tenant.last_name}` : "Unknown",
      startDate: s.start_date,
      endDate: s.end_date,
    })),
    charges.map((c) => ({
      id: c.id,
      tenancyId: c.tenancy_id,
      type: c.type,
      dueDate: c.due_date,
      amount: c.amount_centavos,
      voided: c.voided_at !== null,
      prevKwh: c.prev_kwh,
      currKwh: c.curr_kwh,
      kwhUsed: c.kwh_used,
      rate: c.rate_centavos_per_kwh,
    })),
    payments.map((p) => ({
      id: p.id,
      tenancyId: p.tenancy_id,
      paidOn: p.paid_on,
      amount: p.amount_centavos,
    })),
    allocations.map((a) => ({
      paymentId: a.payment_id,
      chargeId: a.charge_id,
      amount: a.amount_centavos,
    })),
  );
}

export function parseMonth(value: unknown, fallback: string): string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : fallback;
}
