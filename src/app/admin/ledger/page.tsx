import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { inputClass, secondaryButtonClass } from "@/components/form";
import { requireUser } from "@/lib/auth/dal";
import { shiftMonth } from "@/lib/admin/ledger";
import { getLedger, parseMonth } from "@/lib/admin/ledger-data";
import { formatDate, formatPeso, todayInManila } from "@/lib/money";

export const metadata: Metadata = { title: "Ledger" };

const short = (iso: string) => formatDate(iso).replace(/, \d{4}$/, "");
const kwh = (n: number) => n.toLocaleString();

async function LedgerView({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  await requireUser("admin");
  const month = parseMonth((await searchParams).month, todayInManila().slice(0, 7));
  const ledger = await getLedger(month);
  const label = new Intl.DateTimeFormat("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
  const t = ledger.totals;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/ledger?month=${shiftMonth(month, -1)}`}
            aria-label="Previous month"
            className={secondaryButtonClass}
          >
            ‹
          </Link>
          <form className="flex items-center gap-2">
            <label htmlFor="month" className="sr-only">
              Month
            </label>
            <input
              id="month"
              name="month"
              type="month"
              defaultValue={month}
              className={`${inputClass} w-44`}
            />
            <button type="submit" className={secondaryButtonClass}>
              Show
            </button>
          </form>
          <Link
            href={`/admin/ledger?month=${shiftMonth(month, 1)}`}
            aria-label="Next month"
            className={secondaryButtonClass}
          >
            ›
          </Link>
        </div>
        {/* A plain link: the route handler sends the file as a download. */}
        <a href={`/admin/ledger/export?month=${month}`} className={secondaryButtonClass} download>
          Export {label} to CSV
        </a>
      </div>

      <h2 className="text-lg font-semibold">{label}</h2>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[60rem] text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-500 uppercase dark:bg-zinc-950">
            <tr>
              <th className="px-3 py-2 font-medium">Room</th>
              <th className="px-3 py-2 font-medium">Tenant</th>
              <th className="px-3 py-2 text-right font-medium">Rent</th>
              <th className="px-3 py-2 font-medium">Rent paid</th>
              <th className="px-3 py-2 font-medium">Meter (prev → curr)</th>
              <th className="px-3 py-2 text-right font-medium">Rate</th>
              <th className="px-3 py-2 text-right font-medium">Electricity</th>
              <th className="px-3 py-2 text-right font-medium">Other</th>
              <th className="px-3 py-2 font-medium">Payments</th>
              <th className="px-3 py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 align-top dark:divide-zinc-800">
            {ledger.rows.map((r, i) => (
              <tr
                key={r.tenancyId ?? `vacant-${r.room}-${i}`}
                className={r.tenancyId ? "" : "text-zinc-400"}
              >
                <td className="px-3 py-2 font-medium">{r.room}</td>
                <td className="px-3 py-2">
                  {r.tenancyId ? (
                    <Link href={`/admin/tenants/${r.tenancyId}`} className="hover:underline">
                      {r.tenantName}
                    </Link>
                  ) : (
                    "Vacant"
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.rentDue ? formatPeso(r.rentDue) : ""}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {r.rentDue > 0 &&
                    (r.rentPaid >= r.rentDue ? (
                      <span>✓ {r.rentPaidOn.map(short).join(", ")}</span>
                    ) : r.rentPaid > 0 ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        {formatPeso(r.rentPaid)} · {r.rentPaidOn.map(short).join(", ")}
                      </span>
                    ) : (
                      <span className="text-red-700 dark:text-red-400">unpaid</span>
                    ))}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {r.electricity.map((e, j) => (
                    <div key={j}>
                      {kwh(e.prevKwh)} → {kwh(e.currKwh)} = {kwh(e.kwhUsed)} kWh
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.electricity.map((e, j) => (
                    <div key={j}>{formatPeso(e.rate)}</div>
                  ))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.electricityAmount > 0 && (
                    <>
                      {formatPeso(r.electricityAmount)}
                      {r.electricityPaid < r.electricityAmount && (
                        <div className="text-xs text-amber-700 dark:text-amber-400">
                          {formatPeso(r.electricityPaid)} paid
                        </div>
                      )}
                    </>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.other ? formatPeso(r.other) : ""}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {r.payments.map((p, j) => (
                    <div key={j} className="whitespace-nowrap">
                      {short(p.paidOn)} · {formatPeso(p.amount)}
                    </div>
                  ))}
                </td>
                <td
                  className={`px-3 py-2 text-right font-medium tabular-nums ${
                    r.balance > 0 ? "text-red-700 dark:text-red-400" : ""
                  }`}
                >
                  {r.tenancyId &&
                    (r.balance < 0 ? `${formatPeso(-r.balance)} credit` : formatPeso(r.balance))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold tabular-nums dark:border-zinc-700 dark:bg-zinc-950">
            <tr>
              <td className="px-3 py-2" colSpan={2}>
                Total
              </td>
              <td className="px-3 py-2 text-right">{formatPeso(t.rentDue)}</td>
              <td className="px-3 py-2">{formatPeso(t.rentPaid)} paid</td>
              <td className="px-3 py-2" colSpan={2} />
              <td className="px-3 py-2 text-right">
                {formatPeso(t.electricityAmount)}
                <div className="text-xs font-normal">{formatPeso(t.electricityPaid)} paid</div>
              </td>
              <td className="px-3 py-2 text-right">{formatPeso(t.other)}</td>
              <td className="px-3 py-2">{formatPeso(t.paymentsTotal)}</td>
              <td className="px-3 py-2 text-right">{formatPeso(t.balance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        Rent and electricity are the charges due this month; &ldquo;paid&rdquo; includes payments
        made later. Payments are those made this month, by the date actually paid. Balance is
        everything due by {formatDate(ledger.monthEnd)} minus everything paid by then.
      </p>
    </>
  );
}

export default function LedgerPage(props: PageProps<"/admin/ledger">) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Ledger</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <LedgerView searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
