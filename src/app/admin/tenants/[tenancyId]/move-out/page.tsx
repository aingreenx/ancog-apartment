import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { getTenantDetail } from "@/lib/admin/tenants";
import { todayInManila } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { MoveOutForm } from "./move-out-form";

export const metadata: Metadata = { title: "Move out" };

async function MoveOut({ params }: { params: Promise<{ tenancyId: string }> }) {
  await requireUser("admin");
  const { tenancyId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(tenancyId)) notFound();
  const data = await getTenantDetail(tenancyId);
  if (!data) notFound();
  if (data.stay.status !== "active") redirect(`/admin/tenants/${tenancyId}/settlement`);

  const supabase = await createClient();
  const { data: rates } = await supabase
    .from("electricity_rates")
    .select("effective_date, rate_centavos_per_kwh");
  const last = data.readings[0];
  const owedExceptDeposit = data.charges
    .filter((c) => c.type !== "deposit")
    .reduce((s, c) => s + (c.owed_centavos ?? 0), 0);
  const tenant = data.stay.tenant!;

  return (
    <>
      <p className="text-sm text-zinc-500">
        <Link href={`/admin/tenants/${tenancyId}`} className="underline underline-offset-4">
          {tenant.first_name} {tenant.last_name}
        </Link>{" "}
        · Room {data.stay.room?.number}
      </p>
      <MoveOutForm
        tenancyId={tenancyId}
        today={todayInManila()}
        lastKwh={last?.reading_kwh ?? data.stay.starting_kwh}
        lastDate={last?.reading_date ?? data.stay.start_date}
        rates={(rates ?? []).map((r) => ({
          effectiveDate: r.effective_date,
          centavosPerKwh: r.rate_centavos_per_kwh,
        }))}
        owed={owedExceptDeposit}
        credit={data.balance.credit}
        depositHeld={data.balance.depositHeld}
      />
    </>
  );
}

export default function MoveOutPage(props: PageProps<"/admin/tenants/[tenancyId]/move-out">) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Move out</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <MoveOut params={props.params} />
      </Suspense>
    </div>
  );
}
