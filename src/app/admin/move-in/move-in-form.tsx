"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, FormError, buttonClass, inputClass, secondaryButtonClass } from "@/components/form";
import { suggestUsername } from "@/lib/admin/move-in";
import { centavosToInput, formatPeso } from "@/lib/money";
import { moveIn, type MoveInState } from "./actions";

export interface VacantRoom {
  number: number;
  rent: number;
}

export function MoveInForm({
  rooms,
  initialRoom,
  today,
  suggestedPassword,
}: {
  rooms: VacantRoom[];
  initialRoom: number | null;
  today: string;
  suggestedPassword: string;
}) {
  const [state, action, pending] = useActionState<MoveInState, FormData>(moveIn, {
    status: "idle",
  });

  const [room, setRoom] = useState<number | null>(
    rooms.some((r) => r.number === initialRoom) ? initialRoom : null,
  );
  const [firstName, setFirstName] = useState("");
  const [phone1, setPhone1] = useState("");
  const [username, setUsername] = useState<string | null>(null); // null = use suggestion
  const [advance, setAdvance] = useState<string | null>(null); // null = 1 month's rent
  const [deposit, setDeposit] = useState<string | null>(null);
  const [occupants, setOccupants] = useState<number[]>([]);

  const rent = rooms.find((r) => r.number === room)?.rent;
  const oneMonth = rent !== undefined ? centavosToInput(rent) : "";
  const errors = state.status === "error" ? state.errors : {};
  const err = (key: keyof typeof errors) =>
    errors[key] ? { "aria-invalid": true, "aria-describedby": `${key}-error` } : {};

  if (state.status === "done") {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
        <p className="font-medium">
          {state.name} moved into room {state.room}.
        </p>
        <div className="text-sm">
          <p>
            Give the tenant these login details. They will choose their own password on first login.
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-zinc-600 dark:text-zinc-400">Username</dt>
            <dd className="font-mono">{state.username}</dd>
            <dt className="text-zinc-600 dark:text-zinc-400">Temporary password</dt>
            <dd className="font-mono">{state.password}</dd>
          </dl>
        </div>
        <Link href="/admin" className={`${buttonClass} self-start`}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (rooms.length === 0) {
    return <p className="text-sm text-zinc-500">All 13 rooms are occupied.</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormError message={errors.form} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Tenant</legend>
        <Field label="First name" htmlFor="firstName" error={errors.firstName}>
          <input
            id="firstName"
            name="firstName"
            required
            autoComplete="off"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
            {...err("firstName")}
          />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={errors.lastName}>
          <input
            id="lastName"
            name="lastName"
            required
            autoComplete="off"
            className={inputClass}
            {...err("lastName")}
          />
        </Field>
        <Field label="Phone 1" htmlFor="phone1" error={errors.phone1}>
          <input
            id="phone1"
            name="phone1"
            type="tel"
            required
            value={phone1}
            onChange={(e) => setPhone1(e.target.value)}
            className={inputClass}
            {...err("phone1")}
          />
        </Field>
        <Field label="Phone 2 (optional)" htmlFor="phone2">
          <input id="phone2" name="phone2" type="tel" className={inputClass} />
        </Field>
        <Field label="Address (optional)" htmlFor="address" className="sm:col-span-2">
          <input id="address" name="address" autoComplete="off" className={inputClass} />
        </Field>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <p className="text-sm font-medium">Other occupants (optional)</p>
          {occupants.map((key, i) => (
            <div key={key} className="flex gap-2">
              <input
                name="occupantName"
                placeholder="Name"
                aria-label={`Occupant ${i + 1} name`}
                className={inputClass}
              />
              <input
                name="occupantPhone"
                type="tel"
                placeholder="Phone (optional)"
                aria-label={`Occupant ${i + 1} phone`}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setOccupants(occupants.filter((k) => k !== key))}
                aria-label={`Remove occupant ${i + 1}`}
                className={secondaryButtonClass}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setOccupants([...occupants, Date.now()])}
            className={`${secondaryButtonClass} self-start`}
          >
            + Add occupant
          </button>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Stay</legend>
        <Field
          label="Room"
          htmlFor="room"
          error={errors.room}
          hint={rent !== undefined ? `${formatPeso(rent)} a month` : undefined}
        >
          <select
            id="room"
            name="room"
            required
            value={room ?? ""}
            onChange={(e) => setRoom(e.target.value ? Number(e.target.value) : null)}
            className={inputClass}
            {...err("room")}
          >
            <option value="">Choose a vacant room</option>
            {rooms.map((r) => (
              <option key={r.number} value={r.number}>
                Room {r.number} · {formatPeso(r.rent)}/mo
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Move-in date"
          htmlFor="startDate"
          error={errors.startDate}
          hint="Rent is due on this day every month."
        >
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            defaultValue={today}
            className={inputClass}
            {...err("startDate")}
          />
        </Field>
        <Field
          label="Starting meter reading (kWh)"
          htmlFor="startingKwh"
          error={errors.startingKwh}
          hint="Whole number: the black digits only."
        >
          <input
            id="startingKwh"
            name="startingKwh"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            className={inputClass}
            {...err("startingKwh")}
          />
        </Field>
        <div className="hidden sm:block" />
        <Field
          label="Advance (₱)"
          htmlFor="advance"
          error={errors.advance}
          hint="First month's rent. 0 is allowed."
        >
          <input
            id="advance"
            name="advance"
            inputMode="decimal"
            required
            value={advance ?? oneMonth}
            onChange={(e) => setAdvance(e.target.value)}
            className={inputClass}
            {...err("advance")}
          />
        </Field>
        <Field
          label="Deposit (₱)"
          htmlFor="deposit"
          error={errors.deposit}
          hint="Usually 1 month. Can be paid later. 0 is allowed."
        >
          <input
            id="deposit"
            name="deposit"
            inputMode="decimal"
            required
            value={deposit ?? oneMonth}
            onChange={(e) => setDeposit(e.target.value)}
            className={inputClass}
            {...err("deposit")}
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Login</legend>
        <Field
          label="Username"
          htmlFor="username"
          error={errors.username}
          hint="Suggested: room#-firstname-last 4 digits of phone."
        >
          <input
            id="username"
            name="username"
            required
            autoCapitalize="none"
            spellCheck={false}
            value={username ?? suggestUsername(room, firstName, phone1)}
            onChange={(e) => setUsername(e.target.value)}
            className={`${inputClass} font-mono`}
            {...err("username")}
          />
        </Field>
        <Field
          label="Temporary password"
          htmlFor="password"
          error={errors.password}
          hint="The tenant changes it on first login."
        >
          <input
            id="password"
            name="password"
            required
            minLength={8}
            autoComplete="off"
            defaultValue={suggestedPassword}
            className={`${inputClass} font-mono`}
            {...err("password")}
          />
        </Field>
      </fieldset>

      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Saving…" : "Move in"}
      </button>
    </form>
  );
}
