import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";

async function AdminOnly({ children }: { children: React.ReactNode }) {
  await requireUser("admin");
  return <>{children}</>;
}

/** Placeholder for admin sections that aren't built yet. */
export function ComingSoon({ title, issue }: { title: string; issue: number }) {
  return (
    <Suspense fallback={null}>
      <AdminOnly>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">Coming soon (issue #{issue}).</p>
      </AdminOnly>
    </Suspense>
  );
}
