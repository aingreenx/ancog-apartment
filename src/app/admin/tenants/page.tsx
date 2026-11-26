import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { getDirectory, type DirectoryRow } from "@/lib/admin/tenants";
import { formatDate, formatPeso } from "@/lib/money";

export const metadata: Metadata = { title: "Tenants" };

function Row({ t }: { t: DirectoryRow }) {
  const owes = t.balance > 0;
  // Past tenants who still owe are highlighted: nobody will see them on the dashboard.
  const highlight = !t.active && owes;
  return (
    <li>
      <Link
        href={`/admin/tenants/${t.tenancyId}`}
        className={`flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
          highlight ? "bg-red-50 dark:bg-red-950/40" : ""
        }`}
      >
        <span>
          <span className="font-medium">{t.tenantName}</span>
          <span className="block text-xs text-zinc-500">
            Room {t.room} · {formatDate(t.startDate)}
            {t.endDate ? ` – ${formatDate(t.endDate)}` : " – now"} · {t.phone}
          </span>
        </span>
        <span className="text-right tabular-nums">
          {owes ? (
            <span
              className={
                t.overdue > 0 || highlight ? "font-medium text-red-700 dark:text-red-400" : ""
              }
            >
              owes {formatPeso(t.balance)}
            </span>
          ) : t.balance < 0 ? (
            <span className="text-zinc-500">credit {formatPeso(-t.balance)}</span>
          ) : (
            <span className="text-zinc-500">paid up</span>
          )}
        </span>
      </Link>
    </li>
  );
}

async function Directory() {
  await requireUser("admin");
  const rows = await getDirectory();
  const active = rows.filter((r) => r.active).sort((a, b) => a.room - b.room);
  const past = rows
    .filter((r) => !r.active)
    .sort(
      (a, b) =>
        Number(b.balance > 0) - Number(a.balance > 0) ||
        (b.endDate ?? "").localeCompare(a.endDate ?? ""),
    );

  const list = (items: DirectoryRow[], empty: string) =>
    items.length === 0 ? (
      <p className="text-sm text-zinc-500">{empty}</p>
    ) : (
      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {items.map((t) => (
          <Row key={t.tenancyId} t={t} />
        ))}
      </ul>
    );

  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Active ({active.length})</h2>
        {list(active, "No active tenants.")}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Past ({past.length})</h2>
        {past.some((p) => p.balance > 0) && (
          <p className="text-sm text-red-700 dark:text-red-400">
            Highlighted: moved out but still owe.
          </p>
        )}
        {list(past, "No past tenants yet.")}
      </section>
    </>
  );
}

export default function TenantsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tenants</h1>
        <Link
          href="/admin/move-in"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Move in
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Directory />
      </Suspense>
    </div>
  );
}
