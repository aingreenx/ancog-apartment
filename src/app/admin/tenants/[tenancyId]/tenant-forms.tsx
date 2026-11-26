"use client";

import { useActionState } from "react";
import { Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/form";
import { addCharge, addOccupant, resetPassword, updateProfile, type FormResult } from "./actions";

function Message({ state }: { state: FormResult }) {
  if (state.status === "error") {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {state.error}
      </p>
    );
  }
  if (state.status === "done" && state.message) {
    return (
      <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
        {state.message}
      </p>
    );
  }
  return null;
}

export function ProfileForm(props: {
  tenancyId: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  phone1: string;
  phone2: string;
  address: string;
  startDate: string;
  dueDay: number;
}) {
  const [state, action, pending] = useActionState<FormResult, FormData>(updateProfile, {
    status: "idle",
  });
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="tenancyId" value={props.tenancyId} />
      <input type="hidden" name="tenantId" value={props.tenantId} />
      <Field label="First name" htmlFor="firstName">
        <input
          id="firstName"
          name="firstName"
          required
          defaultValue={props.firstName}
          className={inputClass}
        />
      </Field>
      <Field label="Last name" htmlFor="lastName">
        <input
          id="lastName"
          name="lastName"
          required
          defaultValue={props.lastName}
          className={inputClass}
        />
      </Field>
      <Field label="Phone 1" htmlFor="phone1">
        <input
          id="phone1"
          name="phone1"
          type="tel"
          required
          defaultValue={props.phone1}
          className={inputClass}
        />
      </Field>
      <Field label="Phone 2" htmlFor="phone2">
        <input
          id="phone2"
          name="phone2"
          type="tel"
          defaultValue={props.phone2}
          className={inputClass}
        />
      </Field>
      <Field label="Address" htmlFor="address" className="sm:col-span-2">
        <input id="address" name="address" defaultValue={props.address} className={inputClass} />
      </Field>
      <Field label="Move-in date" htmlFor="startDate">
        <input
          id="startDate"
          name="startDate"
          type="date"
          required
          defaultValue={props.startDate}
          className={inputClass}
        />
      </Field>
      <Field label="Due day" htmlFor="dueDay" hint="29–31 move to the last day of shorter months.">
        <input
          id="dueDay"
          name="dueDay"
          type="number"
          min={1}
          max={31}
          required
          defaultValue={props.dueDay}
          className={inputClass}
        />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save profile"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function OccupantForm({ tenancyId }: { tenancyId: string }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(addOccupant, {
    status: "idle",
  });
  return (
    <form
      action={action}
      key={state.status === "done" ? state.key : "f"}
      className="flex flex-wrap gap-2"
    >
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <input
        name="name"
        required
        placeholder="Name"
        aria-label="Occupant name"
        className={`${inputClass} max-w-48`}
      />
      <input
        name="phone"
        type="tel"
        placeholder="Phone (optional)"
        aria-label="Occupant phone"
        className={`${inputClass} max-w-48`}
      />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        Add occupant
      </button>
      <Message state={state} />
    </form>
  );
}

export function ChargeForm({ tenancyId, today }: { tenancyId: string; today: string }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(addCharge, {
    status: "idle",
  });
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_8rem_10rem_9rem]">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <Field label="Description" htmlFor="description">
        <input
          id="description"
          name="description"
          required
          placeholder="e.g. Replacement key"
          className={inputClass}
        />
      </Field>
      <Field label="Amount (₱)" htmlFor="chargeAmount">
        <input
          id="chargeAmount"
          name="amount"
          inputMode="decimal"
          required
          className={inputClass}
        />
      </Field>
      <Field label="Due date" htmlFor="dueDate">
        <input
          id="dueDate"
          name="dueDate"
          type="date"
          required
          defaultValue={today}
          className={inputClass}
        />
      </Field>
      <Field label="Type" htmlFor="chargeType">
        <select id="chargeType" name="type" className={inputClass}>
          <option value="custom">Custom</option>
          <option value="deduction">Deduction</option>
        </select>
      </Field>
      <div className="flex items-center gap-3 sm:col-span-4">
        <button type="submit" disabled={pending} className={secondaryButtonClass}>
          {pending ? "Adding…" : "Add charge"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function ResetPasswordForm({
  profileId,
  username,
}: {
  profileId: string;
  username: string;
}) {
  const [state, action, pending] = useActionState<FormResult, FormData>(resetPassword, {
    status: "idle",
  });
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="profileId" value={profileId} />
      <button type="submit" disabled={pending} className={`${secondaryButtonClass} self-start`}>
        {pending ? "Resetting…" : "Reset password"}
      </button>
      {state.status === "done" && state.message && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950">
          New temporary password for <span className="font-mono">{username}</span>:{" "}
          <strong className="font-mono">{state.message}</strong>. They must change it at next login.
        </p>
      )}
      {state.status === "error" && <Message state={state} />}
    </form>
  );
}
