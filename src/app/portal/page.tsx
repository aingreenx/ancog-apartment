import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InstallPrompt } from "@/components/install-prompt";
import { requireUser } from "@/lib/auth/dal";
import { formatDate, formatPeso } from "@/lib/money";
import { getMyBalance, getMyBills, getMyStay, todayForPortal } from "@/lib/portal/data";
import { nextDueDate } from "@/lib/portal/due";
import { BillCard } from "./_components/bill-card";

export const metadata: Metadata = { title: "My account" };

async function Home() {
  const user = await requireUser("tenant");
  const stay = await getMyStay();
  if (!stay) {
    return (
      <p className="text-sm text-zinc-500">
        Your stay hasn&apos;t been set up yet. Please ask the admin.
      </p>
    );
  }
  const [balance, bills] = await Promise.all([getMyBalance(stay.id), getMyBills(stay.id)]);
  const today = todayForPortal();
  const unpaid = bills.filter((b) => b.owed > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const active = stay.status === "active";
  const next = active ? nextDueDate(today, stay.due_day) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-zinc-500">
          Room {stay.room?.number}
          {!active && stay.end_date && ` · moved out ${formatDate(stay.end_date)}`}
        </p>
        <h1 className="text-2xl font-semibold">Hi, {user.displayName.split(" ")[0]}</h1>
      </div>

      <section
        className={`rounded-xl p-5 ${
          balance.overdue > 0
            ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100"
            : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        }`}
      >
        <p className="text-sm opacity-80">Total to pay</p>
        <p className="text-4xl font-semibold tabular-nums">
          {formatPeso(Math.max(balance.balance, 0))}
        </p>
        {balance.overdue > 0 && (
          <p className="mt-1 text-sm">
            {formatPeso(balance.overdue)} is overdue (up to {balance.maxDaysOverdue} days).
          </p>
        )}
        {balance.balance > 0 && (
          <Link
            href="/portal/pay"
            className="mt-3 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          >
            Pay with GCash
          </Link>
        )}
        {balance.balance < 0 && (
          <p className="mt-1 text-sm">You have {formatPeso(-balance.balance)} credit.</p>
        )}
        {balance.credit > 0 && balance.balance > 0 && (
          <p className="mt-1 text-sm opacity-80">
            Includes {formatPeso(balance.credit)} credit already applied.
          </p>
        )}
      </section>

      {next && (
        <section className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <p className="text-sm text-zinc-500">Next rent</p>
            <p className="font-medium">{formatDate(next)}</p>
          </div>
          <p className="text-lg font-semibold tabular-nums">
            {formatPeso(stay.monthly_rent_centavos)}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Unpaid bills ({unpaid.length})</h2>
          <Link href="/portal/bills" className="text-sm underline underline-offset-4">
            All bills
          </Link>
        </div>
        {unpaid.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            You&apos;re all paid up. Thank you!
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {unpaid.map((b) => (
              <BillCard
                key={b.id}
                bill={b}
                action={
                  <Link
                    href={`/portal/pay?charge=${b.id}`}
                    className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                  >
                    Pay with GCash
                  </Link>
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function PortalPage() {
  return (
    <div className="flex flex-col gap-6">
      <InstallPrompt />
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Home />
      </Suspense>
    </div>
  );
}
