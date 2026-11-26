import type { Metadata } from "next";
import { randomInt } from "node:crypto";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { generateTempPassword } from "@/lib/admin/move-in";
import { todayInManila } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { MoveInForm } from "./move-in-form";

export const metadata: Metadata = { title: "Move in" };

async function MoveIn({ searchParams }: { searchParams: Promise<{ room?: string | string[] }> }) {
  await requireUser("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("number, base_rent_centavos, tenancies(id)")
    .eq("tenancies.status", "active")
    .order("number");
  if (error) throw new Error(`Couldn't load rooms: ${error.message}`);

  const vacant = data
    .filter((r) => r.tenancies.length === 0)
    .map((r) => ({ number: r.number, rent: r.base_rent_centavos }));
  const { room } = await searchParams;

  return (
    <MoveInForm
      rooms={vacant}
      initialRoom={typeof room === "string" ? Number(room) : null}
      today={todayInManila()}
      suggestedPassword={generateTempPassword(randomInt)}
    />
  );
}

export default function MoveInPage(props: PageProps<"/admin/move-in">) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Move in a tenant</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <MoveIn searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
