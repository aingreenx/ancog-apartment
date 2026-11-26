import type { RecentPayment } from "@/lib/admin/payments";
import { formatDate, formatPeso } from "@/lib/money";
import { VoidPayment } from "./void-payment";

const METHOD: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank: "Bank",
  deposit: "Deposit",
};

/** Confirmed payments with a void action. Used on the payments page and the tenant page. */
export function PaymentsList({
  payments,
  showTenant = true,
}: {
  payments: RecentPayment[];
  showTenant?: boolean;
}) {
  if (payments.length === 0) return <p className="text-sm text-zinc-500">No payments yet.</p>;
  return (
    <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {payments.map((p) => (
        <li key={p.id} className={`px-4 py-3 text-sm ${p.voidedAt ? "opacity-60" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={p.voidedAt ? "line-through" : ""}>
                {showTenant && (
                  <>
                    Room {p.room ?? "?"} · {p.tenantName} ·{" "}
                  </>
                )}
                {formatDate(p.paidOn)} · {METHOD[p.method] ?? p.method}
                {p.referenceNo && ` · ${p.referenceNo}`}
              </p>
              {p.notes && <p className="text-xs text-zinc-500">{p.notes}</p>}
              {p.voidedAt && (
                <p className="text-xs text-red-700 dark:text-red-400">VOID: {p.voidReason}</p>
              )}
            </div>
            <div className="text-right">
              <p className={`font-medium tabular-nums ${p.voidedAt ? "line-through" : ""}`}>
                {formatPeso(p.amount)}
              </p>
              {p.receiptNo && (
                <span className="block text-xs">
                  <a
                    href={`/receipts/${p.receiptNo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                  >
                    Receipt #{p.receiptNo}
                  </a>{" "}
                  ·{" "}
                  <a
                    href={`/receipts/${p.receiptNo}?download=1`}
                    className="underline underline-offset-4"
                  >
                    PDF
                  </a>
                </span>
              )}
              {!p.voidedAt && <VoidPayment paymentId={p.id} />}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
