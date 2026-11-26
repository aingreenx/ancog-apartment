import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { formatDate, formatPeso } from "@/lib/money";
import { getMyPayments, getMyStay } from "@/lib/portal/data";

export const metadata: Metadata = { title: "My payments" };

const METHOD: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank: "Bank",
  deposit: "From deposit",
};

function status(p: { status: string; voided_at: string | null }) {
  if (p.voided_at)
    return { label: "Cancelled", className: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800" };
  if (p.status === "pending_review") {
    return {
      label: "Waiting for confirmation",
      className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    };
  }
  if (p.status === "rejected")
    return {
      label: "Not accepted",
      className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    };
  return {
    label: "Received",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  };
}

async function Payments() {
  await requireUser("tenant");
  const stay = await getMyStay();
  const payments = stay ? await getMyPayments(stay.id) : [];
  if (payments.length === 0) return <p className="text-sm text-zinc-500">No payments yet.</p>;

  return (
    <ul className="flex flex-col gap-3">
      {payments.map((p) => {
        const s = status(p);
        const receipt = p.receipts;
        return (
          <li
            key={p.id}
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  className={`text-lg font-semibold tabular-nums ${p.voided_at ? "line-through" : ""}`}
                >
                  {formatPeso(p.amount_centavos)}
                </p>
                <p className="text-sm text-zinc-500">
                  {formatDate(p.paid_on)} · {METHOD[p.method] ?? p.method}
                  {p.reference_no && ` · ${p.reference_no}`}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}
              >
                {s.label}
              </span>
            </div>
            {p.status === "rejected" && p.review_note && (
              <p className="text-sm text-red-700 dark:text-red-400">Reason: {p.review_note}</p>
            )}
            {p.voided_at && p.void_reason && (
              <p className="text-sm text-zinc-500">Reason: {p.void_reason}</p>
            )}
            {receipt && (
              <p className="flex gap-4 text-sm">
                <a
                  href={`/receipts/${receipt.receipt_no}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline underline-offset-4"
                >
                  View receipt #{receipt.receipt_no}
                </a>
                <a
                  href={`/receipts/${receipt.receipt_no}?download=1`}
                  className="underline underline-offset-4"
                >
                  Download
                </a>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function PaymentsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Payments</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Payments />
      </Suspense>
    </div>
  );
}
