import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { getMyBalance, getMyBills, getMyStay, todayForPortal } from "@/lib/portal/data";
import { getGcashDetails } from "@/lib/portal/gcash";
import { PayForm } from "./pay-form";

export const metadata: Metadata = { title: "Pay with GCash" };

async function Pay({ searchParams }: { searchParams: Promise<{ charge?: string | string[] }> }) {
  await requireUser("tenant");
  const stay = await getMyStay();
  if (!stay) return <p className="text-sm text-zinc-500">Your stay isn&apos;t set up yet.</p>;

  const [{ charge }, bills, balance, gcash] = await Promise.all([
    searchParams,
    getMyBills(stay.id),
    getMyBalance(stay.id),
    getGcashDetails(),
  ]);
  // Paying one bill, or the whole balance.
  const bill =
    typeof charge === "string" ? bills.find((b) => b.id === charge && b.owed > 0) : undefined;

  return (
    <PayForm
      tenancyId={stay.id}
      chargeId={bill?.id ?? null}
      chargeLabel={bill?.description ?? null}
      amount={bill ? bill.owed : Math.max(balance.balance, 0)}
      today={todayForPortal()}
      gcash={gcash}
    />
  );
}

export default function PayPage(props: PageProps<"/portal/pay">) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold">Pay with GCash</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Pay searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
