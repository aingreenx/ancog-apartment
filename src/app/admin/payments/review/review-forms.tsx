"use client";

import { useActionState, useState } from "react";
import { buttonClass, inputClass, secondaryButtonClass } from "@/components/form";
import { confirmPayment, rejectPayment, type ReviewState } from "./actions";

export function ReviewForms({
  paymentId,
  hasChosenBill,
}: {
  paymentId: string;
  hasChosenBill: boolean;
}) {
  const [confirmState, confirm, confirming] = useActionState<ReviewState, FormData>(
    confirmPayment,
    {
      status: "idle",
    },
  );
  const [rejectState, reject, rejecting] = useActionState<ReviewState, FormData>(rejectPayment, {
    status: "idle",
  });
  const [rejectOpen, setRejectOpen] = useState(false);
  const error =
    (confirmState.status === "error" && confirmState.error) ||
    (rejectState.status === "error" && rejectState.error);

  return (
    <div className="flex flex-col gap-3">
      <form action={confirm} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="paymentId" value={paymentId} />
        <label htmlFor={`mode-${paymentId}`} className="sr-only">
          Apply to
        </label>
        <select
          id={`mode-${paymentId}`}
          name="mode"
          defaultValue={hasChosenBill ? "chosen" : "oldest"}
          className={`${inputClass} w-auto py-1.5 text-sm`}
        >
          {hasChosenBill && <option value="chosen">The bill they chose, then oldest</option>}
          <option value="oldest">Oldest bills first</option>
          <option value="credit">Keep as credit</option>
        </select>
        <button type="submit" disabled={confirming} className={`${buttonClass} py-1.5 text-sm`}>
          {confirming ? "Confirming…" : "Confirm (received in GCash)"}
        </button>
        {!rejectOpen && (
          <button
            type="button"
            onClick={() => setRejectOpen(true)}
            className={`${secondaryButtonClass} py-1.5`}
          >
            Reject
          </button>
        )}
      </form>
      {rejectOpen && (
        <form action={reject} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="paymentId" value={paymentId} />
          <input
            name="reason"
            required
            autoFocus
            placeholder="Why? The tenant will see this."
            aria-label="Reason for rejecting"
            className={`${inputClass} max-w-sm py-1.5 text-sm`}
          />
          <button
            type="submit"
            disabled={rejecting}
            className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {rejecting ? "Rejecting…" : "Reject payment"}
          </button>
          <button type="button" onClick={() => setRejectOpen(false)} className="text-sm underline">
            Cancel
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
