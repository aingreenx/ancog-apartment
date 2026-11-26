import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { getDashboard } from "@/lib/admin/dashboard";
import { formatDate, formatPeso } from "@/lib/money";
import { RoomGrid } from "./_components/room-grid";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-sm text-zinc-500 tabular-nums">{sub}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

async function Dashboard() {
  await requireUser("admin");
  const data = await getDashboard();
  const month = new Intl.DateTimeFormat("en-PH", { month: "long", timeZone: "UTC" }).format(
    new Date(`${data.today}T00:00:00Z`),
  );

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-zinc-500">{formatDate(data.today)}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Occupancy"
          value={`${data.occupied} / ${data.rooms.length}`}
          sub={`${data.rooms.length - data.occupied} vacant`}
        />
        <Stat
          label={`Rent · ${month}`}
          value={formatPeso(data.totals.rentCollected)}
          sub={`of ${formatPeso(data.totals.rentExpected)} expected`}
        />
        <Stat
          label={`Electricity · ${month}`}
          value={formatPeso(data.totals.electricityCollected)}
          sub={`of ${formatPeso(data.totals.electricityBilled)} billed`}
        />
        <Stat label="Total unpaid" value={formatPeso(data.totals.totalUnpaid)} sub="all rooms" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Panel title={`Meter readings due today (${data.readingsDue.length})`}>
          {data.readingsDue.length === 0 ? (
            <p className="text-sm text-zinc-500">None due today.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.readingsDue.map((r) => (
                <li key={r.tenancyId} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    Room {r.room} · {r.tenantName}
                  </span>
                  <Link
                    href={`/admin/readings?room=${r.room}`}
                    className="font-medium underline underline-offset-4"
                  >
                    Record
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Payments to review (${data.paymentsToReview.length})`}>
          {data.paymentsToReview.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing to review.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.paymentsToReview.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    Room {p.room ?? "?"} · {p.tenantName}
                    <span className="block text-xs text-zinc-500">
                      {p.method.toUpperCase()} {p.referenceNo ? `· ${p.referenceNo} ` : ""}·{" "}
                      {formatDate(p.paidOn)}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">{formatPeso(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <RoomGrid rooms={data.rooms} />
    </div>
  );
}

export default function AdminPage() {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/payments"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Record payment
          </Link>
          <Link
            href="/admin/readings"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Record reading
          </Link>
          <Link
            href="/admin/move-in"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Move in
          </Link>
        </div>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Dashboard />
      </Suspense>
    </>
  );
}
