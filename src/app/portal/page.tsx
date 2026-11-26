import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata: Metadata = { title: "My account" };

// Placeholder until the tenant portal (#22) is built.
// requireUser() keeps out anyone who isn't signed in as a tenant.
async function PortalHome() {
  const user = await requireUser("tenant");
  return (
    <>
      <p>
        Signed in as <strong>{user.displayName}</strong> ({user.username})
      </p>
      <SignOutButton />
    </>
  );
}

export default function PortalPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">My account</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <PortalHome />
      </Suspense>
    </main>
  );
}
