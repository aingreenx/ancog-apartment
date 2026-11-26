"use client";

import { useState, useTransition } from "react";
import { Field, FormError, buttonClass, inputClass } from "@/components/form";
import type { StayOption } from "@/lib/admin/payments";
import { allocatePayment } from "@/lib/billing/balances";
import { formatDate, formatPeso, parsePesos } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { recordPayment, type RecordPaymentResult } from "./actions";

export function PaymentForm({
  stays,
  initialTenancyId,
  today,
}: {
  stays: StayOption[];
  initialTenancyId: string | null;
  today: string;
}) {
  const [tenancyId, setTenancyId] = useState(
    stays.some((s) => s.tenancyId === initialTenancyId) ? initialTenancyId! : "",
  );
  const [amountText, setAmountText] = useState("");
  const [method, setMethod] = useState("cash");
  const [mode, setMode] = useState<"auto" | "pick">("auto");
  const [picked, setPicked] = useState<string[]>([]);
  const [proof, setProof] = useState<File | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [result, setResult] = useState<RecordPaymentResult | null>(null);
  const [pending, startTransition] = useTransition();

  const stay = stays.find((s) => s.tenancyId === tenancyId);
  const amount = parsePesos(amountText);
  const totalOwed = stay?.charges.reduce((s, c) => s + c.owed, 0) ?? 0;

  // Same function the server uses when saving.
  let plan: ReturnType<typeof allocatePayment> | null = null;
  if (stay && amount && amount > 0 && (mode === "auto" || picked.length > 0)) {
    plan = allocatePayment(
      amount,
      stay.charges.map((c) => ({ id: c.id, dueDate: c.dueDate, amount: c.owed })),
      [],
      mode === "pick" ? { pick: picked } : {},
    );
  }
  const allocatedTo = new Map(plan?.allocations.map((a) => [a.chargeId, a.amount]));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stay) return;
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      setResult(null);
      if (proof) {
        const ext = (proof.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${stay.tenancyId}/${form.get("paidOn")}-${crypto.randomUUID()}.${ext}`;
        const { error } = await createClient()
          .storage.from("payment-proofs")
          .upload(path, proof, { contentType: proof.type || undefined });
        if (error) {
          setResult({ ok: false, error: `Proof upload failed: ${error.message}`, field: "proof" });
          return;
        }
        form.set("proofPath", path);
      }
      const saved = await recordPayment(form);
      setResult(saved);
      if (saved.ok) {
        setAmountText("");
        setPicked([]);
        setProof(null);
        setFormKey((k) => k + 1);
      }
    });
  }

  const fieldError = (f: string) =>
    result && !result.ok && result.field === f ? result.error : undefined;

  return (
    <form key={formKey} onSubmit={onSubmit} className="flex flex-col gap-5">
      {result?.ok && (
        <p
          role="status"
          className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
          Payment saved: {formatPeso(result.allocated)} applied to charges
          {result.credit > 0 && `, ${formatPeso(result.credit)} kept as credit`}.
          {result.receiptNo && (
            <>
              {" "}
              <a
                href={`/receipts/${result.receiptNo}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-4"
              >
                Receipt #{result.receiptNo}
              </a>
            </>
          )}
        </p>
      )}
      {result && !result.ok && !result.field && <FormError message={result.error} />}

      <input type="hidden" name="tenancyId" value={tenancyId} />
      <input type="hidden" name="mode" value={mode} />
      <Field label="Tenant" htmlFor="stay">
        <select
          id="stay"
          required
          value={tenancyId}
          onChange={(e) => {
            setTenancyId(e.target.value);
            setPicked([]);
            setResult(null);
          }}
          className={inputClass}
        >
          <option value="">Choose a tenant</option>
          {stays.map((s) => (
            <option key={s.tenancyId} value={s.tenancyId}>
              Room {s.room} · {s.tenantName}
              {s.active ? "" : " (moved out)"}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Date paid"
          htmlFor="paidOn"
          error={fieldError("date")}
          hint="The day the money was actually received."
        >
          <input
            id="paidOn"
            name="paidOn"
            type="date"
            required
            defaultValue={today}
            className={inputClass}
          />
        </Field>
        <Field label="Amount (₱)" htmlFor="amount" error={fieldError("amount")}>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            required
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            className={`${inputClass} tabular-nums`}
          />
        </Field>
        <Field label="Method" htmlFor="method" error={fieldError("method")}>
          <select
            id="method"
            name="method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className={inputClass}
          >
            <option value="cash">Cash</option>
            <option value="gcash">GCash</option>
            <option value="bank">Bank</option>
          </select>
        </Field>
      </div>

      {method !== "cash" && (
        <Field label="Reference no." htmlFor="referenceNo">
          <input id="referenceNo" name="referenceNo" autoComplete="off" className={inputClass} />
        </Field>
      )}

      {stay && (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <legend className="px-1 font-semibold">What is it for?</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "auto"} onChange={() => setMode("auto")} />
              Oldest first (automatic)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "pick"} onChange={() => setMode("pick")} />
              Pick charges
            </label>
          </div>
          {fieldError("pick") && (
            <p className="text-sm text-red-600 dark:text-red-400">{fieldError("pick")}</p>
          )}

          {stay.charges.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Nothing owed. The whole payment will be kept as credit.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {stay.charges.map((c) => {
                const applied = allocatedTo.get(c.id) ?? 0;
                return (
                  <li key={c.id} className="flex items-center gap-3 py-2">
                    {mode === "pick" && (
                      <input
                        type="checkbox"
                        name="pick"
                        value={c.id}
                        checked={picked.includes(c.id)}
                        onChange={(e) =>
                          setPicked(
                            e.target.checked
                              ? [...picked, c.id]
                              : picked.filter((id) => id !== c.id),
                          )
                        }
                        aria-label={`Pay ${c.description}`}
                      />
                    )}
                    <span className="flex-1">
                      {c.description}
                      <span className="block text-xs text-zinc-500">
                        Due {formatDate(c.dueDate)}
                        {c.status === "overdue" && (
                          <span className="text-red-600 dark:text-red-400"> · overdue</span>
                        )}
                      </span>
                    </span>
                    <span className="text-right tabular-nums">
                      {formatPeso(c.owed)}
                      {applied > 0 && (
                        <span className="block text-xs text-emerald-700 dark:text-emerald-400">
                          − {formatPeso(applied)}
                          {applied < c.owed ? " (partial)" : ""}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-sm tabular-nums">
            Owed: <strong>{formatPeso(totalOwed)}</strong>
            {stay.credit > 0 && <> · existing credit {formatPeso(stay.credit)}</>}
            {plan && plan.credit > 0 && (
              <span className="block text-emerald-700 dark:text-emerald-400">
                {formatPeso(plan.credit)} left over will be kept as credit.
              </span>
            )}
          </p>
        </fieldset>
      )}

      <Field
        label="Proof (optional)"
        htmlFor="proof"
        error={fieldError("proof")}
        hint="GCash screenshot or a photo."
      >
        <input
          id="proof"
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setProof(e.target.files?.[0] ?? null)}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-3 file:py-2 file:text-sm dark:file:border-zinc-700 dark:file:bg-zinc-900"
        />
      </Field>
      <Field label="Notes (optional)" htmlFor="notes">
        <input id="notes" name="notes" autoComplete="off" className={inputClass} />
      </Field>

      <button type="submit" disabled={pending || !stay} className={`${buttonClass} self-start`}>
        {pending ? "Saving…" : "Save payment"}
      </button>
    </form>
  );
}
