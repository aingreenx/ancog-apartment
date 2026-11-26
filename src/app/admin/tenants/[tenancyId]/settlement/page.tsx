import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { DEFAULT_ADDRESS } from "@/lib/receipts/receipt-data";
import { formatDate, formatPeso } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Move-out settlement" };

async function Settlement({ params }: { params: Promise<{ tenancyId: string }> }) {
  await requireUser("admin");
  const { tenancyId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(tenancyId)) notFound();
  const supabase = await createClient();

  const [s, stay, charges, readings, settings] = await Promise.all([
    supabase.from("move_out_settlements").select("*").eq("tenancy_id", tenancyId).maybeSingle(),
    supabase
      .from("tenancies")
      .select(
        "start_date, end_date, monthly_rent_centavos, room:rooms(number), tenant:tenants(first_name, last_name)",
      )
      .eq("id", tenancyId)
      .maybeSingle(),
    supabase
      .from("charges")
      .select(
        "description, type, amount_centavos, due_date, kwh_used, prev_kwh, curr_kwh, rate_centavos_per_kwh, voided_at",
      )
      .eq("tenancy_id", tenancyId)
      .is("voided_at", null),
    supabase
      .from("meter_readings")
      .select("reading_kwh, reading_date")
      .eq("tenancy_id", tenancyId)
      .eq("kind", "move_out")
      .maybeSingle(),
    supabase.from("app_settings").select("apartment_address").maybeSingle(),
  ]);
  if (!stay.data) notFound();
  const settlement = s.data;
  const tenant = stay.data.tenant;

  if (!settlement) {
    return (
      <p className="text-sm text-zinc-500">
        This stay hasn&apos;t been settled.{" "}
        <Link href={`/admin/tenants/${tenancyId}/move-out`} className="underline">
          Move out
        </Link>
      </p>
    );
  }

  const onDay = charges.data?.filter((c) => c.due_date === settlement.settled_on) ?? [];
  const finalBill = onDay.find((c) => c.type === "electricity");
  const deductions = onDay.filter((c) => c.type === "deduction");

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-lg border border-zinc-200 bg-white p-6 text-sm print:border-0 print:p-0 dark:border-zinc-800 dark:bg-zinc-900 print:dark:bg-white print:dark:text-black">
      <header className="border-b-2 border-zinc-900 pb-3 dark:border-zinc-100 print:dark:border-zinc-900">
        <p className="text-xl font-bold tracking-wide">ANCOG APARTMENT</p>
        <p>Move-out settlement</p>
        <p className="text-xs text-zinc-500">
          {settings.data?.apartment_address || DEFAULT_ADDRESS}
        </p>
      </header>

      <dl className="grid grid-cols-[9rem_1fr] gap-y-1">
        <dt className="text-zinc-500">Tenant</dt>
        <dd>
          {tenant?.first_name} {tenant?.last_name}, Room {stay.data.room?.number}
        </dd>
        <dt className="text-zinc-500">Stay</dt>
        <dd>
          {formatDate(stay.data.start_date)} –{" "}
          {stay.data.end_date ? formatDate(stay.data.end_date) : "—"}
        </dd>
        <dt className="text-zinc-500">Settled on</dt>
        <dd>{formatDate(settlement.settled_on)}</dd>
      </dl>

      <section>
        <h2 className="mb-1 font-semibold">Final charges</h2>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {finalBill && (
            <li className="flex justify-between py-1 tabular-nums">
              <span>
                Final electricity: {readings.data?.reading_kwh.toLocaleString()} −{" "}
                {finalBill.prev_kwh?.toLocaleString()} = {finalBill.kwh_used} kWh ×{" "}
                {formatPeso(finalBill.rate_centavos_per_kwh ?? 0)}
              </span>
              <span>{formatPeso(finalBill.amount_centavos)}</span>
            </li>
          )}
          {deductions.map((d, i) => (
            <li key={i} className="flex justify-between py-1 tabular-nums">
              <span>Deduction: {d.description}</span>
              <span>{formatPeso(d.amount_centavos)}</span>
            </li>
          ))}
          {!finalBill && deductions.length === 0 && <li className="py-1 text-zinc-500">None</li>}
        </ul>
      </section>

      <section>
        <h2 className="mb-1 font-semibold">Deposit</h2>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 tabular-nums">
          <dt>Deposit held</dt>
          <dd className="text-right">{formatPeso(settlement.deposit_held_centavos)}</dd>
          <dt className="pl-3 text-zinc-500">Applied to deductions</dt>
          <dd className="text-right">− {formatPeso(settlement.deductions_centavos)}</dd>
          <dt className="pl-3 text-zinc-500">Applied to unpaid bills</dt>
          <dd className="text-right">− {formatPeso(settlement.applied_to_balance_centavos)}</dd>
          <dt className="mt-2 border-t border-zinc-300 pt-2 text-base font-semibold">
            Refund to tenant
          </dt>
          <dd className="mt-2 border-t border-zinc-300 pt-2 text-right text-base font-semibold">
            {formatPeso(settlement.refund_centavos)}
          </dd>
          <dt className="text-base font-semibold">Still owed by tenant</dt>
          <dd
            className={`text-right text-base font-semibold ${
              settlement.remaining_owed_centavos > 0 ? "text-red-700 print:text-black" : ""
            }`}
          >
            {formatPeso(settlement.remaining_owed_centavos)}
          </dd>
        </dl>
      </section>

      {settlement.notes && (
        <p>
          <span className="text-zinc-500">Notes:</span> {settlement.notes}
        </p>
      )}

      <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs">
        <p className="border-t border-zinc-900 pt-1 dark:border-zinc-100 print:dark:border-zinc-900">
          Received by (tenant)
        </p>
        <p className="border-t border-zinc-900 pt-1 dark:border-zinc-100 print:dark:border-zinc-900">
          For Ancog Apartment
        </p>
      </div>

      <div className="flex gap-3 print:hidden">
        <PrintButton />
        <Link href={`/admin/tenants/${tenancyId}`} className="text-sm underline underline-offset-4">
          Back to tenant
        </Link>
      </div>
    </article>
  );
}

export default function SettlementPage(props: PageProps<"/admin/tenants/[tenancyId]/settlement">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <Settlement params={props.params} />
    </Suspense>
  );
}
