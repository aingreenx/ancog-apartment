import type { MyBill } from "@/lib/portal/data";
import { formatDate, formatPeso } from "@/lib/money";

export const STATUS: Record<string, { label: string; className: string }> = {
  paid: {
    label: "Paid",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  partial: {
    label: "Partly paid",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  unpaid: {
    label: "Unpaid",
    className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
  overdue: {
    label: "Overdue",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
};

/** One bill. Electricity bills show how the amount was computed. */
export function BillCard({ bill, action }: { bill: MyBill; action?: React.ReactNode }) {
  const status = STATUS[bill.status] ?? STATUS.unpaid;
  const e = bill.electricity;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{bill.description}</p>
          <p className="text-sm text-zinc-500">
            Due {formatDate(bill.dueDate)}
            {bill.status === "overdue" &&
              ` · ${bill.daysOverdue} day${bill.daysOverdue === 1 ? "" : "s"} overdue`}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      {e && (
        <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm tabular-nums dark:bg-zinc-950">
          {e.currKwh.toLocaleString()} − {e.prevKwh.toLocaleString()} ={" "}
          <strong>{e.kwhUsed.toLocaleString()} kWh</strong> × {formatPeso(e.rate)} ={" "}
          {formatPeso(bill.amount)}
        </p>
      )}

      <div className="flex items-end justify-between gap-3">
        <p className="text-sm tabular-nums">
          {formatPeso(bill.amount)}
          {bill.paid > 0 && bill.owed > 0 && (
            <span className="text-zinc-500"> · {formatPeso(bill.paid)} paid</span>
          )}
          {bill.owed > 0 && (
            <span className="block text-lg font-semibold">{formatPeso(bill.owed)} to pay</span>
          )}
        </p>
        {bill.owed > 0 && action}
      </div>
    </li>
  );
}
