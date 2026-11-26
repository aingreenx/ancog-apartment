import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/dal";
import { SignOutButton } from "@/components/sign-out-button";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password" };

async function ChangePassword() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {user.mustChangePassword
          ? "Welcome! Please replace your temporary password before continuing."
          : "Choose a new password."}
      </p>
      <ChangePasswordForm />
      <SignOutButton />
    </>
  );
}

export default function ChangePasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Change password</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <ChangePassword />
      </Suspense>
    </main>
  );
}
