import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { formatDate, formatPeso } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { ReviewForms } from "./review-forms";

export const metadata: Metadata = { title: "Payments to review" };

async function Queue() {
  await requireUser("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, tenancy_id, paid_on, amount_centavos, method, reference_no, proof_path, created_at, for_charge:charges!payments_for_charge_id_fkey(description), tenancy:tenancies(room:rooms(number), tenant:tenants(first_name, last_name))",
    )
    .eq("status", "pending_review")
    .is("voided_at", null)
    .order("created_at");
  if (error) throw new Error(`Couldn't load payments: ${error.message}`);
  if (data.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Nothing to review.
      </p>
    );
  }

  const paths = data.map((p) => p.proof_path).filter((p): p is string => Boolean(p));
  const proofs = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("payment-proofs")
      .createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) proofs.set(s.path, s.signedUrl);
  }

  return (
    <ul className="flex flex-col gap-4">
      {data.map((p) => {
        const tenant = p.tenancy?.tenant;
        const proof = p.proof_path ? proofs.get(p.proof_path) : undefined;
        return (
          <li
            key={p.id}
            className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row dark:border-zinc-800 dark:bg-zinc-900"
          >
            {proof ? (
              <a href={proof} target="_blank" rel="noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img
                  src={proof}
                  alt="Payment screenshot"
                  className="h-40 w-32 rounded-md object-cover"
                />
              </a>
            ) : (
              <span className="flex h-20 w-32 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-800">
                No screenshot
              </span>
            )}
            <div className="flex flex-1 flex-col gap-3">
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {formatPeso(p.amount_centavos)}
                </p>
                <p className="text-sm">
                  <Link
                    href={`/admin/tenants/${p.tenancy_id}`}
                    className="font-medium hover:underline"
                  >
                    Room {p.tenancy?.room?.number} ·{" "}
                    {tenant ? `${tenant.first_name} ${tenant.last_name}` : "?"}
                  </Link>
                </p>
                <p className="text-sm text-zinc-500">
                  GCash ref. <span className="font-mono">{p.reference_no}</span> · sent{" "}
                  {formatDate(p.paid_on)}
                  {p.for_charge && <> · for {p.for_charge.description}</>}
                </p>
                <p className="text-xs text-zinc-500">
                  Check this reference number in the GCash app first.
                </p>
              </div>
              <ReviewForms paymentId={p.id} hasChosenBill={Boolean(p.for_charge)} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function ReviewPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Payments to review</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Queue />
      </Suspense>
    </div>
  );
}
