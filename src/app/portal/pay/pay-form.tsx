"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Field, FormError, buttonClass, inputClass, secondaryButtonClass } from "@/components/form";
import { centavosToInput, formatPeso } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { submitGcashPayment, type SubmitResult } from "./actions";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={`Copy ${label}`}
      className={`${secondaryButtonClass} py-1`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function PayForm({
  tenancyId,
  chargeId,
  chargeLabel,
  amount,
  today,
  gcash,
}: {
  tenancyId: string;
  chargeId: string | null;
  chargeLabel: string | null;
  amount: number;
  today: string;
  gcash: { name: string | null; number: string | null; qrUrl: string | null };
}) {
  const [amountText, setAmountText] = useState(amount > 0 ? centavosToInput(amount) : "");
  const [proof, setProof] = useState<File | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
        <p className="font-medium">Sent! Thank you.</p>
        <p className="text-sm">
          We&apos;ll check it in GCash and confirm it. You&apos;ll get a notification and your
          receipt when it&apos;s confirmed.
        </p>
        <Link href="/portal/payments" className={`${buttonClass} self-start`}>
          See my payments
        </Link>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      setResult(null);
      if (proof) {
        const ext = (proof.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${tenancyId}/gcash-${today}-${crypto.randomUUID()}.${ext}`;
        const { error } = await createClient()
          .storage.from("payment-proofs")
          .upload(path, proof, { contentType: proof.type || undefined });
        if (error) {
          setResult({
            ok: false,
            error: "The screenshot didn't upload. Try again or skip it.",
            field: "proof",
          });
          return;
        }
        form.set("proofPath", path);
      }
      setResult(await submitGcashPayment(form));
    });
  }

  const fieldError = (f: string) =>
    result && !result.ok && result.field === f ? result.error : undefined;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-white p-5 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">1. Send by GCash to</p>
        {gcash.qrUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img
            src={gcash.qrUrl}
            alt="GCash QR code"
            className="h-56 w-56 rounded-lg object-contain"
          />
        )}
        {gcash.number ? (
          <>
            <p className="text-2xl font-semibold tracking-wide tabular-nums">{gcash.number}</p>
            {gcash.name && <p className="text-sm text-zinc-600 dark:text-zinc-400">{gcash.name}</p>}
            <CopyButton text={gcash.number.replace(/\s/g, "")} label="GCash number" />
          </>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            The GCash number isn&apos;t set up yet. Please ask the admin.
          </p>
        )}
        {amount > 0 && (
          <div className="mt-2 flex items-center gap-3">
            <p>
              Amount: <strong className="tabular-nums">{formatPeso(amount)}</strong>
            </p>
            <CopyButton text={centavosToInput(amount)} label="amount" />
          </div>
        )}
        {chargeLabel && <p className="text-sm text-zinc-500">For: {chargeLabel}</p>}
      </section>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-zinc-500">2. Then tell us here:</p>
        {result && !result.ok && !result.field && <FormError message={result.error} />}
        <input type="hidden" name="chargeId" value={chargeId ?? ""} />
        <Field
          label="Amount sent (₱)"
          htmlFor="amount"
          error={fieldError("amount")}
          hint="You can pay part of it."
        >
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
        <Field
          label="GCash reference no."
          htmlFor="referenceNo"
          error={fieldError("referenceNo")}
          hint="It's on the GCash receipt, e.g. 1234 567 890123."
        >
          <input
            id="referenceNo"
            name="referenceNo"
            required
            autoComplete="off"
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <Field label="Date sent" htmlFor="paidOn" error={fieldError("paidOn")}>
          <input
            id="paidOn"
            name="paidOn"
            type="date"
            required
            defaultValue={today}
            max={today}
            className={inputClass}
          />
        </Field>
        <Field label="Screenshot (optional)" htmlFor="proof" error={fieldError("proof")}>
          <input
            id="proof"
            type="file"
            accept="image/*"
            onChange={(e) => setProof(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-3 file:py-2 file:text-sm dark:file:border-zinc-700 dark:file:bg-zinc-900"
          />
        </Field>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Sending…" : "I sent it"}
        </button>
      </form>
    </div>
  );
}
