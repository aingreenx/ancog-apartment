"use client";

import { useActionState, useState } from "react";
import { inputClass } from "@/components/form";
import { voidPayment, type VoidState } from "./actions";

/** "Void" link that opens a reason box. Payments are never deleted. */
export function VoidPayment({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<VoidState, FormData>(voidPayment, {
    status: "idle",
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-red-700 underline underline-offset-4 dark:text-red-400"
      >
        Void
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input
        name="reason"
        required
        autoFocus
        placeholder="Reason (required)"
        aria-label="Reason for voiding"
        className={`${inputClass} max-w-xs py-1 text-sm`}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-red-700 px-3 py-1 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Voiding…" : "Void payment"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm underline">
        Cancel
      </button>
      {state.status === "error" && (
        <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}
