"use client";

import { useActionState } from "react";
import { Field, FormError, buttonClass, inputClass } from "@/components/form";
import { addRate, type AddRateState } from "./actions";

export function AddRateForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<AddRateState, FormData>(addRate, {
    status: "idle",
  });
  const errors = state.status === "error" ? state.errors : {};

  return (
    // Re-mount (clear the fields) after each successful save.
    <form
      key={state.status === "done" ? state.key : "form"}
      action={action}
      className="grid gap-4 sm:grid-cols-[10rem_8rem_1fr_auto] sm:items-start"
    >
      <Field label="Date entered" htmlFor="date" error={errors.date}>
        <input
          id="date"
          name="date"
          type="date"
          required
          defaultValue={today}
          className={inputClass}
        />
      </Field>
      <Field label="₱ per kWh" htmlFor="rate" error={errors.rate}>
        <input
          id="rate"
          name="rate"
          inputMode="decimal"
          required
          placeholder="13.75"
          className={inputClass}
        />
      </Field>
      <Field label="Note (optional)" htmlFor="note">
        <input
          id="note"
          name="note"
          placeholder="e.g. Davao Light, Dec 2026"
          className={inputClass}
        />
      </Field>
      <button type="submit" disabled={pending} className={`${buttonClass} sm:mt-6`}>
        {pending ? "Saving…" : "Add rate"}
      </button>
      <div className="sm:col-span-4">
        <FormError message={errors.form} />
        {state.status === "done" && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            Rate saved.
          </p>
        )}
      </div>
    </form>
  );
}
