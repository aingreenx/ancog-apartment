import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { todayInManila } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { ReadingForm, type StayForReading } from "./reading-form";

export const metadata: Metadata = { title: "Record meter reading" };

// Same-day order used by the database: meter_change_old < others < meter_change_new.
const KIND_RANK: Record<string, number> = { meter_change_old: 0, meter_change_new: 2 };

async function Readings({ searchParams }: { searchParams: Promise<{ room?: string | string[] }> }) {
  await requireUser("admin");
  const supabase = await createClient();

  const [staysRes, ratesRes] = await Promise.all([
    supabase
      .from("tenancies")
      .select(
        "id, room:rooms(number), tenant:tenants(first_name, last_name), meter_readings(reading_date, reading_kwh, kind, created_at)",
      )
      .eq("status", "active"),
    supabase.from("electricity_rates").select("effective_date, rate_centavos_per_kwh"),
  ]);
  if (staysRes.error) throw new Error(`Couldn't load rooms: ${staysRes.error.message}`);
  if (ratesRes.error) throw new Error(`Couldn't load rates: ${ratesRes.error.message}`);

  const stays: StayForReading[] = staysRes.data
    .flatMap((s) => {
      const last = [...s.meter_readings].sort(
        (a, b) =>
          b.reading_date.localeCompare(a.reading_date) ||
          (KIND_RANK[b.kind] ?? 1) - (KIND_RANK[a.kind] ?? 1) ||
          b.created_at.localeCompare(a.created_at),
      )[0];
      if (!last || !s.room) return [];
      return [
        {
          tenancyId: s.id,
          room: s.room.number,
          tenantName: s.tenant ? `${s.tenant.first_name} ${s.tenant.last_name}` : "Unknown",
          lastKwh: last.reading_kwh,
          lastDate: last.reading_date,
        },
      ];
    })
    .sort((a, b) => a.room - b.room);

  const { room } = await searchParams;
  return (
    <ReadingForm
      stays={stays}
      rates={ratesRes.data.map((r) => ({
        effectiveDate: r.effective_date,
        centavosPerKwh: r.rate_centavos_per_kwh,
      }))}
      initialRoom={typeof room === "string" ? Number(room) : null}
      today={todayInManila()}
    />
  );
}

export default function ReadingsPage(props: PageProps<"/admin/readings">) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Record meter reading</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Readings searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
