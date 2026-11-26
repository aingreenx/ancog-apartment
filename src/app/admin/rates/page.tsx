import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { rateForReading } from "@/lib/billing/electricity";
import { formatDate, formatPeso, todayInManila } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { AddRateForm } from "./add-rate-form";

export const metadata: Metadata = { title: "Electricity rates" };

async function Rates() {
  await requireUser("admin");
  const supabase = await createClient();
  const { data: rates, error } = await supabase
    .from("electricity_rates")
    .select("id, effective_date, rate_centavos_per_kwh, source_note")
    .order("effective_date", { ascending: false });
  if (error) throw new Error(`Couldn't load rates: ${error.message}`);

  const today = todayInManila();
  // Same rule the database uses when billing: newest rate on or before the reading date.
  let current: { id?: string; effectiveDate: string; centavosPerKwh: number } | null = null;
  try {
    current = rateForReading(
      rates.map((r) => ({
        id: r.id,
        effectiveDate: r.effective_date,
        centavosPerKwh: r.rate_centavos_per_kwh,
      })),
      today,
    );
  } catch {
    current = null;
  }

  return (
    <>
      <section
        aria-live="polite"
        className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {current ? (
          <p>
            A reading entered today ({formatDate(today)}) uses{" "}
            <strong>{formatPeso(current.centavosPerKwh)}/kWh</strong>, the rate entered{" "}
            {formatDate(current.effectiveDate)}.
          </p>
        ) : (
          <p className="text-red-700 dark:text-red-400">
            No rate yet for today. Add one before recording readings.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 font-semibold">Add a rate</h2>
        <AddRateForm today={today} />
        <p className="mt-3 text-xs text-zinc-500">
          Readings use the newest rate entered on or before the reading date. Bills already made
          keep their rate.
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">All rates</h2>
        {rates.length === 0 ? (
          <p className="text-sm text-zinc-500">No rates yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">Date entered</th>
                  <th className="px-3 py-2 text-right font-medium">₱/kWh</th>
                  <th className="px-3 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rates.map((r) => (
                  <tr
                    key={r.id}
                    className={r.id === current?.id ? "bg-emerald-50 dark:bg-emerald-950" : ""}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDate(r.effective_date)}
                      {r.id === current?.id && (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                          in use
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPeso(r.rate_centavos_per_kwh)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{r.source_note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function RatesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Electricity rates</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Rates />
      </Suspense>
    </div>
  );
}
