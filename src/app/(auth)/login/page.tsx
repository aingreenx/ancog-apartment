import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/dal";
import { homeFor } from "@/lib/auth/login-id";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

async function Login({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const user = await getSessionUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : homeFor(user.role));

  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Login searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
