import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Dashboard" };

// Placeholder until the dashboard (#12).
async function Dashboard() {
  const user = await requireUser("admin");
  return <p className="mt-2 text-sm text-zinc-500">Welcome, {user.displayName}.</p>;
}

export default function AdminPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Suspense fallback={null}>
        <Dashboard />
      </Suspense>
    </>
  );
}
