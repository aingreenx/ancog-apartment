import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata: Metadata = { title: "Admin" };

// Placeholder until the admin shell (#11) and dashboard (#12) are built.
// requireUser() keeps out anyone who isn't signed in as an admin.
async function AdminHome() {
  const user = await requireUser("admin");
  return (
    <>
      <p>
        Signed in as <strong>{user.displayName}</strong> ({user.username})
      </p>
      <SignOutButton />
    </>
  );
}

export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <AdminHome />
      </Suspense>
    </main>
  );
}
