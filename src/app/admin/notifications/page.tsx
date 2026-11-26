import type { Metadata } from "next";
import { Suspense } from "react";
import { NotificationsList } from "@/components/notifications";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Notifications" };

async function List() {
  await requireUser("admin");
  return <NotificationsList />;
}

export default function NotificationsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <List />
      </Suspense>
    </div>
  );
}
