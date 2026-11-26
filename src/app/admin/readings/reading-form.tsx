"use client";

import { useState, useTransition } from "react";
import { Field, FormError, buttonClass, inputClass } from "@/components/form";
import {
  computeElectricityBill,
  rateForReading,
  type ElectricityRate,
} from "@/lib/billing/electricity";
import { formatDate, formatPeso } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { recordReading, type RecordReadingResult } from "./actions";

export interface StayForReading {
  tenancyId: string;
  room: number;
  tenantName: string;
  lastKwh: number;
  lastDate: string;
}

const WHOLE = /^\d+$/;

/** What the bill will be, using the same functions as the tests. Null if not computable yet. */
function preview(
  stay: StayForReading | undefined,
  kwhText: string,
  date: string,
  rates: ElectricityRate[],
) {
  if (!stay || !WHOLE.test(kwhText) || !date) return null;
  const kwh = Number(kwhText);
  if (kwh < stay.lastKwh) {
    return { error: `Lower than the last reading (${stay.lastKwh.toLocaleString()} kWh).` };
  }
  if (date < stay.lastDate) {
    return { error: `The date can't be before the last reading (${formatDate(stay.lastDate)}).` };
  }
  let rate: ElectricityRate;
  try {
    rate = rateForReading(rates, date);
  } catch {
    return {
      error: `No rate entered on or before ${formatDate(date)}. Add one on the Rates page.`,
    };
  }
  return { bill: computeElectricityBill(stay.lastKwh, kwh, rate.centavosPerKwh), rate };
}

export function ReadingForm({
  stays,
  rates,
  initialRoom,
  today,
}: {
  stays: StayForReading[];
  rates: ElectricityRate[];
  initialRoom: number | null;
  today: string;
}) {
  const [tenancyId, setTenancyId] = useState(
    stays.find((s) => s.room === initialRoom)?.tenancyId ?? "",
  );
  const [date, setDate] = useState(today);
  const [kwh, setKwh] = useState("");
  const [meterChange, setMeterChange] = useState(false);
  const [newMeterKwh, setNewMeterKwh] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [result, setResult] = useState<RecordReadingResult | null>(null);
  const [pending, startTransition] = useTransition();

  const stay = stays.find((s) => s.tenancyId === tenancyId);
  const p = preview(stay, kwh, date, rates);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stay) return;
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      setResult(null);
      // Photos go straight from the phone to storage (server actions have a 1 MB body limit).
      if (photo) {
        const ext = (photo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${stay.tenancyId}/${date}-${crypto.randomUUID()}.${ext}`;
        const { error } = await createClient()
          .storage.from("meter-photos")
          .upload(path, photo, { contentType: photo.type || undefined });
        if (error) {
          setResult({ ok: false, error: `Photo upload failed: ${error.message}`, field: "photo" });
          return;
        }
        form.set("photoPath", path);
      }
      form.set("room", String(stay.room));
      const saved = await recordReading(form);
      setResult(saved);
      if (saved.ok) {
        setKwh("");
        setNewMeterKwh("");
        setMeterChange(false);
        setPhoto(null);
        setFormKey((k) => k + 1);
      }
    });
  }

  if (stays.length === 0) return <p className="text-sm text-zinc-500">No occupied rooms.</p>;

  const fieldError = (f: string) =>
    result && !result.ok && result.field === f ? result.error : undefined;

  return (
    <form key={formKey} onSubmit={onSubmit} className="flex flex-col gap-5">
      {result?.ok && (
        <p
          role="status"
          className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
          Saved for room {result.room}: {result.kwhUsed.toLocaleString()} kWh ×{" "}
          {formatPeso(result.rate)} = <strong>{formatPeso(result.amount)}</strong>
        </p>
      )}
      {result && !result.ok && !result.field && <FormError message={result.error} />}

      <input type="hidden" name="tenancyId" value={tenancyId} />
      <Field label="Room" htmlFor="room">
        <select
          id="room"
          required
          value={tenancyId}
          onChange={(e) => {
            setTenancyId(e.target.value);
            setResult(null);
          }}
          className={inputClass}
        >
          <option value="">Choose a room</option>
          {stays.map((s) => (
            <option key={s.tenancyId} value={s.tenancyId}>
              Room {s.room} · {s.tenantName}
            </option>
          ))}
        </select>
      </Field>

      {stay && (
        <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800">
          Last reading:{" "}
          <strong className="tabular-nums">{stay.lastKwh.toLocaleString()} kWh</strong> on{" "}
          {formatDate(stay.lastDate)}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Reading date"
          htmlFor="date"
          error={fieldError("date")}
          hint="Any date; early or late is fine."
        >
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
          label={meterChange ? "Old meter: final reading (kWh)" : "New reading (kWh)"}
          htmlFor="kwh"
          error={fieldError("kwh")}
          hint="Whole kWh: the black digits only, ignore the red one."
        >
          <input
            id="kwh"
            name="kwh"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            value={kwh}
            onChange={(e) => setKwh(e.target.value.trim())}
            className={`${inputClass} tabular-nums`}
            aria-invalid={Boolean(p && "error" in p)}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="meterChange"
          checked={meterChange}
          onChange={(e) => setMeterChange(e.target.checked)}
          className="h-4 w-4"
        />
        The meter was replaced
      </label>
      {meterChange && (
        <Field
          label="New meter: starting reading (kWh)"
          htmlFor="newMeterKwh"
          error={fieldError("newMeterKwh")}
          hint="Next month's bill starts from this number."
        >
          <input
            id="newMeterKwh"
            name="newMeterKwh"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            value={newMeterKwh}
            onChange={(e) => setNewMeterKwh(e.target.value.trim())}
            className={`${inputClass} tabular-nums`}
          />
        </Field>
      )}

      <Field
        label="Photo of the meter (optional)"
        htmlFor="photo"
        error={fieldError("photo")}
        hint="Tenants can see it as proof."
      >
        <input
          id="photo"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-3 file:py-2 file:text-sm dark:file:border-zinc-700 dark:file:bg-zinc-900"
        />
      </Field>

      <div
        aria-live="polite"
        className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Bill preview</p>
        {!p ? (
          <p className="mt-1 text-sm text-zinc-500">Pick a room and enter the reading.</p>
        ) : "error" in p ? (
          <p className="mt-1 text-sm text-red-700 dark:text-red-400">{p.error}</p>
        ) : (
          <p className="mt-1 tabular-nums">
            {p.bill.currKwh.toLocaleString()} − {p.bill.prevKwh.toLocaleString()} ={" "}
            <strong>{p.bill.kwhUsed.toLocaleString()} kWh</strong> ×{" "}
            {formatPeso(p.rate.centavosPerKwh)} ={" "}
            <strong className="text-lg">{formatPeso(p.bill.amount)}</strong>
            <span className="block text-xs text-zinc-500">
              Rate entered {formatDate(p.rate.effectiveDate)} · rounded to the nearest peso
            </span>
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending || !p || "error" in p}
        className={`${buttonClass} self-start`}
      >
        {pending ? "Saving…" : "Save reading and bill"}
      </button>
    </form>
  );
}
