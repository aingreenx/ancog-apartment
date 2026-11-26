import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { secondaryButtonClass } from "@/components/form";
import { requireUser } from "@/lib/auth/dal";
import { getTenantDetail } from "@/lib/admin/tenants";
import { formatDate, formatPeso, todayInManila } from "@/lib/money";
import { PaymentsList } from "../../payments/payments-list";
import { removeOccupant } from "./actions";
import { ChargeForm, OccupantForm, ProfileForm, ResetPasswordForm } from "./tenant-forms";

export const metadata: Metadata = { title: "Tenant" };

const STATUS_BADGE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  unpaid: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  overdue: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  void: "bg-zinc-100 text-zinc-500 line-through dark:bg-zinc-800",
};
const KIND: Record<string, string> = {
  regular: "Reading",
  move_in: "Move-in",
  move_out: "Move-out",
  meter_change_old: "Old meter (final)",
  meter_change_new: "New meter (start)",
};

function Card({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

async function Tenant({ params }: { params: Promise<{ tenancyId: string }> }) {
  await requireUser("admin");
  const { tenancyId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(tenancyId)) notFound();
  const data = await getTenantDetail(tenancyId);
  if (!data) notFound();

  const { stay, balance, charges, readings, payments } = data;
  const tenant = stay.tenant!;
  const active = stay.status === "active";
  const room = stay.room?.number;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            <Link href="/admin/tenants" className="underline underline-offset-4">
              Tenants
            </Link>{" "}
            / Room {room}
          </p>
          <h1 className="text-2xl font-semibold">
            {tenant.first_name} {tenant.last_name}
          </h1>
          <p className="text-sm text-zinc-500">
            Room {room} · {formatPeso(stay.monthly_rent_centavos)}/mo · moved in{" "}
            {formatDate(stay.start_date)} · due day {stay.due_day}
            {!active && stay.end_date && <> · moved out {formatDate(stay.end_date)}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/payments?tenancy=${stay.id}`} className={secondaryButtonClass}>
            Record payment
          </Link>
          {active && (
            <Link href={`/admin/readings?room=${room}`} className={secondaryButtonClass}>
              Add reading
            </Link>
          )}
          <a href="#charges" className={secondaryButtonClass}>
            Add charge
          </a>
          {active && (
            <button
              type="button"
              disabled
              title="Coming with move-out settlement (#25)"
              className={`${secondaryButtonClass} cursor-not-allowed opacity-50`}
            >
              Move out
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [
            "Total owed",
            formatPeso(balance.owed),
            balance.overdue > 0 ? `${formatPeso(balance.overdue)} overdue` : "nothing overdue",
          ],
          ["Credit", formatPeso(balance.credit), "unallocated payments"],
          [
            "Balance",
            formatPeso(Math.max(balance.balance, 0)),
            balance.balance < 0 ? `ahead by ${formatPeso(-balance.balance)}` : "owed − credit",
          ],
          [
            "Deposit held",
            formatPeso(balance.depositHeld),
            `of ${formatPeso(stay.deposit_required_centavos)} required`,
          ],
        ].map(([label, value, sub]) => (
          <div
            key={label}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
            <p className="text-sm text-zinc-500">{sub}</p>
          </div>
        ))}
      </div>

      <Card title="Charges" actions={<span id="charges" />}>
        <div className="mb-4 rounded-md bg-zinc-50 p-3 dark:bg-zinc-950">
          <p className="mb-2 text-sm font-medium">Add a custom charge</p>
          <ChargeForm tenancyId={stay.id} today={todayInManila()} />
        </div>
        {charges.length === 0 ? (
          <p className="text-sm text-zinc-500">No charges.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Charge</th>
                  <th className="py-2 pr-3 font-medium">Due</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2 pr-3 text-right font-medium">Paid</th>
                  <th className="py-2 pr-3 text-right font-medium">Owed</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {charges.map((c) => (
                  <tr key={c.charge_id}>
                    <td className="py-2 pr-3">{c.description}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDate(c.due_date!)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatPeso(c.amount_centavos!)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatPeso(c.paid_centavos!)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatPeso(c.owed_centavos!)}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status!] ?? ""}`}
                      >
                        {c.status}
                        {c.status === "overdue" && ` · ${c.days_overdue}d`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Payments"
        actions={
          <Link
            href={`/admin/payments?tenancy=${stay.id}`}
            className="text-sm font-medium underline underline-offset-4"
          >
            Record payment
          </Link>
        }
      >
        <PaymentsList payments={payments} showTenant={false} />
      </Card>

      <Card title="Meter readings">
        {readings.length === 0 ? (
          <p className="text-sm text-zinc-500">No readings.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {readings.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {formatDate(r.reading_date)} · {KIND[r.kind] ?? r.kind}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{r.reading_kwh.toLocaleString()} kWh</span>
                  {r.photoUrl && (
                    <a href={r.photoUrl} target="_blank" rel="noreferrer" title="Open photo">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                      <img
                        src={r.photoUrl}
                        alt={`Meter photo ${r.reading_date}`}
                        className="h-10 w-10 rounded object-cover"
                      />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Profile">
        <ProfileForm
          tenancyId={stay.id}
          tenantId={tenant.id}
          firstName={tenant.first_name}
          lastName={tenant.last_name}
          phone1={tenant.phone_1}
          phone2={tenant.phone_2 ?? ""}
          address={tenant.address ?? ""}
          startDate={stay.start_date}
          dueDay={stay.due_day}
        />
        <p className="mt-3 text-xs text-zinc-500">
          The room can&apos;t be changed: a transfer is a move-out plus a new move-in.
        </p>
      </Card>

      <Card title="Other occupants">
        {stay.tenancy_occupants.length > 0 && (
          <ul className="mb-3 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {stay.tenancy_occupants.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2">
                <span>
                  {o.name}
                  {o.phone && <span className="text-zinc-500"> · {o.phone}</span>}
                </span>
                <form action={removeOccupant}>
                  <input type="hidden" name="occupantId" value={o.id} />
                  <button
                    type="submit"
                    className="text-xs text-red-700 underline dark:text-red-400"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <OccupantForm tenancyId={stay.id} />
      </Card>

      <Card title="Login">
        {tenant.profile ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              Username: <span className="font-mono">{tenant.profile.username}</span>
              {tenant.profile.must_change_password && (
                <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                  (temporary password not changed yet)
                </span>
              )}
            </p>
            <ResetPasswordForm profileId={tenant.profile.id} username={tenant.profile.username} />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No login account.</p>
        )}
      </Card>
    </div>
  );
}

export default function TenantPage(props: PageProps<"/admin/tenants/[tenancyId]">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <Tenant params={props.params} />
    </Suspense>
  );
}
