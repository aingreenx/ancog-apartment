"use client";

import { useActionState, useState } from "react";
import { Field, FormError, buttonClass, inputClass, secondaryButtonClass } from "@/components/form";
import {
  computeElectricityBill,
  rateForReading,
  type ElectricityRate,
} from "@/lib/billing/electricity";
import { previewMoveOut } from "@/lib/billing/move-out-preview";
import { formatDate, formatPeso, parsePesos } from "@/lib/money";
import { moveOut, type MoveOutState } from "./actions";

export function MoveOutForm(props: {
  tenancyId: string;
  today: string;
  lastKwh: number;
  lastDate: string;
  rates: ElectricityRate[];
  owed: number;
  credit: number;
  depositHeld: number;
}) {
  const [state, action, pending] = useActionState<MoveOutState, FormData>(moveOut, {
    status: "idle",
  });
  const [date, setDate] = useState(props.today);
  const [kwh, setKwh] = useState("");
  const [rows, setRows] = useState([{ key: 0, name: "", amount: "" }]);
  const [confirmed, setConfirmed] = useState(false);

  // Final bill preview (same functions as the readings screen).
  let finalBill = 0;
  let billNote: string | null = null;
  if (kwh) {
    const n = Number(kwh);
    if (!/^\d+$/.test(kwh)) billNote = "Whole kWh only.";
    else if (n < props.lastKwh)
      billNote = `Lower than the last reading (${props.lastKwh.toLocaleString()} kWh).`;
    else {
      try {
        const rate = rateForReading(props.rates, date);
        const bill = computeElectricityBill(props.lastKwh, n, rate.centavosPerKwh);
        finalBill = bill.amount;
        billNote = `${bill.kwhUsed.toLocaleString()} kWh × ${formatPeso(rate.centavosPerKwh)} = ${formatPeso(bill.amount)}`;
      } catch {
        billNote = "No electricity rate for this date.";
      }
    }
  }
  const deductions = rows.reduce((s, r) => s + (parsePesos(r.amount) ?? 0), 0);
  const p = previewMoveOut({
    owed: props.owed,
    credit: props.credit,
    depositHeld: props.depositHeld,
    finalBill,
    deductions,
  });

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="tenancyId" value={props.tenancyId} />
      {state.status === "error" && <FormError message={state.error} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Move-out date" htmlFor="date">
          <input
            id="date"
            name="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Final meter reading (kWh)"
          htmlFor="finalKwh"
          hint={
            billNote ??
            `Last: ${props.lastKwh.toLocaleString()} kWh on ${formatDate(props.lastDate)}. Leave empty to skip.`
          }
        >
          <input
            id="finalKwh"
            name="finalKwh"
            inputMode="numeric"
            pattern="[0-9]*"
            value={kwh}
            onChange={(e) => setKwh(e.target.value.trim())}
            className={`${inputClass} tabular-nums`}
          />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Deductions</legend>
        <p className="text-sm text-zinc-500">
          Cleaning, aircon cleaning, missing items… Taken from the deposit first.
        </p>
        {rows.map((r, i) => (
          <div key={r.key} className="flex gap-2">
            <input
              name="deductionName"
              placeholder="e.g. Aircon cleaning"
              aria-label={`Deduction ${i + 1}`}
              value={r.name}
              onChange={(e) =>
                setRows(rows.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))
              }
              className={inputClass}
            />
            <input
              name="deductionAmount"
              inputMode="decimal"
              placeholder="₱"
              aria-label={`Deduction ${i + 1} amount`}
              value={r.amount}
              onChange={(e) =>
                setRows(rows.map((x) => (x.key === r.key ? { ...x, amount: e.target.value } : x)))
              }
              className={`${inputClass} w-32 tabular-nums`}
            />
            <button
              type="button"
              aria-label={`Remove deduction ${i + 1}`}
              onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
              className={secondaryButtonClass}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows([...rows, { key: Date.now(), name: "", amount: "" }])}
          className={`${secondaryButtonClass} self-start`}
        >
          + Add deduction
        </button>
      </fieldset>

      <Field label="Notes (optional)" htmlFor="notes">
        <input id="notes" name="notes" placeholder="e.g. Keys returned" className={inputClass} />
      </Field>

      <section
        aria-live="polite"
        className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 className="mb-2 font-semibold">Settlement preview</h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
          <dt>Unpaid now</dt>
          <dd className="text-right">{formatPeso(props.owed)}</dd>
          <dt>Final electricity</dt>
          <dd className="text-right">{formatPeso(finalBill)}</dd>
          <dt>Deductions</dt>
          <dd className="text-right">{formatPeso(deductions)}</dd>
          {p.creditUsed > 0 && (
            <>
              <dt>Credit already paid</dt>
              <dd className="text-right">− {formatPeso(p.creditUsed)}</dd>
            </>
          )}
          <dt>Deposit held</dt>
          <dd className="text-right">{formatPeso(props.depositHeld)}</dd>
          <dt className="pl-3 text-zinc-500">used for deductions</dt>
          <dd className="text-right text-zinc-500">{formatPeso(p.depositToDeductions)}</dd>
          <dt className="pl-3 text-zinc-500">used for unpaid bills</dt>
          <dd className="text-right text-zinc-500">{formatPeso(p.depositToUnpaid)}</dd>
          <dt className="mt-2 border-t border-zinc-300 pt-2 font-semibold dark:border-zinc-700">
            {p.remainingOwed > 0 ? "Tenant still owes" : "Refund to tenant"}
          </dt>
          <dd className="mt-2 border-t border-zinc-300 pt-2 text-right text-lg font-semibold dark:border-zinc-700">
            {formatPeso(p.remainingOwed > 0 ? p.remainingOwed : p.refund + p.creditLeft)}
          </dd>
        </dl>
        {p.creditLeft > 0 && (
          <p className="mt-1 text-xs text-zinc-500">
            Includes {formatPeso(p.creditLeft)} of unused credit.
          </p>
        )}
      </section>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        I understand this ends the stay and the room becomes vacant. It can&apos;t be undone here.
      </label>
      <button
        type="submit"
        disabled={pending || !confirmed}
        className={`${buttonClass} self-start`}
      >
        {pending ? "Saving…" : "Move out and settle"}
      </button>
    </form>
  );
}
