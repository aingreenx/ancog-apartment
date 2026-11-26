"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Field, FormError, buttonClass, inputClass, secondaryButtonClass } from "@/components/form";
import { SETTINGS_IMAGE_MAX_BYTES, SETTINGS_IMAGE_TYPES } from "@/lib/settings/format";
import { createClient } from "@/lib/supabase/client";
import {
  changeMyPassword,
  saveGcash,
  saveMeterSerials,
  saveMyName,
  saveReceipt,
  type SettingsResult,
} from "./actions";

const idle: SettingsResult = { status: "idle" };

/**
 * Like useActionState, but submits through onSubmit so React doesn't clear the form
 * afterwards: when a save fails, what the admin typed is still there to fix.
 */
function useSettingsForm(fn: (prev: SettingsResult, form: FormData) => Promise<SettingsResult>) {
  const [state, action, pending] = useActionState(fn, idle);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(() => action(form));
  };
  return [state, onSubmit, pending] as const;
}

function Status({ state }: { state: SettingsResult }) {
  if (state.status === "done") {
    return (
      <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
        {state.message}
      </p>
    );
  }
  if (state.status === "error" && !state.field) return <FormError message={state.error} />;
  return null;
}

const fieldError = (state: SettingsResult, field: string) =>
  state.status === "error" && state.field === field ? state.error : undefined;

/**
 * Picks an image, uploads it straight to the private `settings` bucket (admins only),
 * and puts its path in a hidden input. "remove" clears it; empty keeps the current one.
 */
function ImageField({
  name,
  kind,
  label,
  hint,
  currentUrl,
  pngOnly = false,
  error,
}: {
  name: string;
  kind: "gcash-qr" | "signature";
  label: string;
  hint: string;
  currentUrl: string | null;
  pngOnly?: boolean;
  error?: string;
}) {
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const types: readonly string[] = pngOnly ? ["image/png"] : SETTINGS_IMAGE_TYPES;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (!types.includes(file.type)) {
      setUploadError(pngOnly ? "Use a PNG image." : "Use a PNG, JPG or WebP image.");
      return;
    }
    if (file.size > SETTINGS_IMAGE_MAX_BYTES) {
      setUploadError("The image is over 2 MB. Use a smaller one.");
      return;
    }
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const newPath = `${kind}/${crypto.randomUUID()}.${ext}`;
    setUploading(true);
    const { error: upError } = await createClient()
      .storage.from("settings")
      .upload(newPath, file, { contentType: file.type });
    setUploading(false);
    if (upError) {
      setUploadError("The image didn't upload. Try again.");
      return;
    }
    setPath(newPath);
    setPreview(URL.createObjectURL(file));
  }

  return (
    <Field label={label} htmlFor={`${name}-file`} error={uploadError ?? error} hint={hint}>
      <input type="hidden" name={`${name}Path`} value={path} />
      <div className="flex flex-wrap items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL or local preview
          <img
            src={preview}
            alt={`${label} preview`}
            className="h-28 w-28 rounded-md border border-zinc-200 bg-white object-contain dark:border-zinc-700"
          />
        ) : (
          <span className="flex h-28 w-28 items-center justify-center rounded-md border border-dashed border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700">
            None
          </span>
        )}
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            id={`${name}-file`}
            type="file"
            accept={types.join(",")}
            onChange={onPick}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium dark:file:border-zinc-700 dark:file:bg-zinc-900"
          />
          {uploading && <span className="text-sm text-zinc-500">Uploading…</span>}
          {preview && (
            <button
              type="button"
              className={`${secondaryButtonClass} self-start`}
              onClick={() => {
                setPath("remove");
                setPreview(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}

export function GcashForm({
  name,
  number,
  qrUrl,
}: {
  name: string | null;
  number: string | null;
  qrUrl: string | null;
}) {
  const [state, onSubmit, pending] = useSettingsForm(saveGcash);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account name" htmlFor="gcashName" error={fieldError(state, "gcashName")}>
          <input
            id="gcashName"
            name="gcashName"
            defaultValue={name ?? ""}
            maxLength={80}
            placeholder="e.g. MARIA A."
            className={inputClass}
          />
        </Field>
        <Field label="GCash number" htmlFor="gcashNumber" error={fieldError(state, "gcashNumber")}>
          <input
            id="gcashNumber"
            name="gcashNumber"
            inputMode="tel"
            defaultValue={number ?? ""}
            placeholder="0917 123 4567"
            className={inputClass}
          />
        </Field>
      </div>
      <ImageField
        name="gcashQr"
        kind="gcash-qr"
        label="GCash QR code"
        hint="From GCash → QR → Download. PNG, JPG or WebP, up to 2 MB."
        currentUrl={qrUrl}
        error={fieldError(state, "gcashQr")}
      />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Saving…" : "Save GCash details"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function ReceiptForm({
  address,
  signatureUrl,
}: {
  address: string | null;
  signatureUrl: string | null;
}) {
  const [state, onSubmit, pending] = useSettingsForm(saveReceipt);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        label="Apartment address"
        htmlFor="address"
        error={fieldError(state, "address")}
        hint="Printed at the top of every receipt."
      >
        <input
          id="address"
          name="address"
          defaultValue={address ?? ""}
          maxLength={200}
          className={inputClass}
        />
      </Field>
      <ImageField
        name="signature"
        kind="signature"
        label="Signature on receipts"
        hint="A PNG of the signature, ideally on a transparent or white background. Up to 2 MB."
        currentUrl={signatureUrl}
        pngOnly
        error={fieldError(state, "signature")}
      />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Saving…" : "Save receipt details"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function MeterSerialsForm({
  rooms,
}: {
  rooms: { id: string; number: number; meter_serial: string | null }[];
}) {
  const [state, onSubmit, pending] = useSettingsForm(saveMeterSerials);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rooms.map((r) => (
          <Field key={r.id} label={`Room ${r.number}`} htmlFor={`serial-${r.id}`}>
            <input
              id={`serial-${r.id}`}
              name={`serial-${r.id}`}
              defaultValue={r.meter_serial ?? ""}
              maxLength={40}
              autoCapitalize="characters"
              placeholder="Serial no."
              className={`${inputClass} font-mono`}
            />
          </Field>
        ))}
      </div>
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Saving…" : "Save serial numbers"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function MyNameForm({ displayName }: { displayName: string }) {
  const [state, onSubmit, pending] = useSettingsForm(saveMyName);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field
        label="Your name"
        htmlFor="displayName"
        error={fieldError(state, "displayName")}
        className="flex-1"
      >
        <input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          maxLength={60}
          required
          className={inputClass}
        />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : "Save name"}
      </button>
      <div className="sm:basis-full">
        <Status state={state} />
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, onSubmit, pending] = useSettingsForm(changeMyPassword);
  return (
    <form
      key={state.status === "done" ? state.key : "form"}
      onSubmit={onSubmit}
      className="flex flex-col gap-3"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Current password" htmlFor="current" error={fieldError(state, "current")}>
          <input
            id="current"
            name="current"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </Field>
        <Field
          label="New password"
          htmlFor="password"
          error={fieldError(state, "password")}
          hint="At least 8 characters."
        >
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={inputClass}
          />
        </Field>
        <Field label="New password again" htmlFor="confirm" error={fieldError(state, "confirm")}>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            className={inputClass}
          />
        </Field>
      </div>
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Changing…" : "Change password"}
      </button>
      <Status state={state} />
    </form>
  );
}
