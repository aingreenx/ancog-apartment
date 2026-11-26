import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { formatDate } from "@/lib/money";
import { getMyReadings, getMyStay } from "@/lib/portal/data";

export const metadata: Metadata = { title: "Meter readings" };

const KIND: Record<string, string> = {
  regular: "Monthly reading",
  move_in: "Move-in reading",
  move_out: "Move-out reading",
  meter_change_old: "Old meter (final)",
  meter_change_new: "New meter (start)",
};

async function Readings() {
  await requireUser("tenant");
  const stay = await getMyStay();
  const readings = stay ? await getMyReadings(stay.id) : [];
  if (readings.length === 0) return <p className="text-sm text-zinc-500">No readings yet.</p>;

  return (
    <ul className="flex flex-col gap-3">
      {readings.map((r, i) => {
        const older = readings[i + 1];
        const used = older && r.kind === "regular" ? r.reading_kwh - older.reading_kwh : null;
        return (
          <li
            key={r.id}
            className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {r.photoUrl ? (
              <a href={r.photoUrl} target="_blank" rel="noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img
                  src={r.photoUrl}
                  alt={`Meter on ${formatDate(r.reading_date)}`}
                  className="h-16 w-16 rounded-md object-cover"
                />
              </a>
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-800">
                No photo
              </span>
            )}
            <div className="flex-1">
              <p className="font-medium tabular-nums">{r.reading_kwh.toLocaleString()} kWh</p>
              <p className="text-sm text-zinc-500">
                {formatDate(r.reading_date)} · {KIND[r.kind] ?? r.kind}
              </p>
            </div>
            {used !== null && (
              <p className="text-right text-sm tabular-nums">
                <span className="font-medium">{used.toLocaleString()} kWh</span>
                <span className="block text-zinc-500">used</span>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function ReadingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Meter readings</h1>
      <p className="text-sm text-zinc-500">Tap a photo to see the meter as it was read.</p>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Readings />
      </Suspense>
    </div>
  );
}
