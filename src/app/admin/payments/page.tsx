import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { getRecentPayments, getStayOptions } from "@/lib/admin/payments";
import { todayInManila } from "@/lib/money";
import { PaymentForm } from "./payment-form";
import { PaymentsList } from "./payments-list";

export const metadata: Metadata = { title: "Record payment" };

async function Payments({
  searchParams,
}: {
  searchParams: Promise<{ tenancy?: string | string[]; room?: string | string[] }>;
}) {
  await requireUser("admin");
  const [stays, recent, params] = await Promise.all([
    getStayOptions(),
    getRecentPayments({ limit: 20 }),
    searchParams,
  ]);
  const byRoom =
    typeof params.room === "string"
      ? stays.find((s) => s.active && s.room === Number(params.room))?.tenancyId
      : undefined;

  return (
    <>
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <PaymentForm
          stays={stays}
          initialTenancyId={typeof params.tenancy === "string" ? params.tenancy : (byRoom ?? null)}
          today={todayInManila()}
        />
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Recent payments</h2>
        <PaymentsList payments={recent} />
      </section>
    </>
  );
}

export default function PaymentsPage(props: PageProps<"/admin/payments">) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Record payment</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Payments searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
