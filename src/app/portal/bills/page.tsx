import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { getMyBills, getMyStay } from "@/lib/portal/data";
import { BillCard } from "../_components/bill-card";

export const metadata: Metadata = { title: "My bills" };

async function Bills() {
  await requireUser("tenant");
  const stay = await getMyStay();
  const bills = stay ? await getMyBills(stay.id) : [];
  if (bills.length === 0) return <p className="text-sm text-zinc-500">No bills yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {bills.map((b) => (
        <BillCard key={b.id} bill={b} />
      ))}
    </ul>
  );
}

export default function BillsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Bills</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Bills />
      </Suspense>
    </div>
  );
}
