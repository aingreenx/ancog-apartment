import Link from "next/link";
import { Suspense } from "react";
import { AdminMenu } from "./_components/admin-menu";
import { BottomNav, Icon, TopNav } from "./_components/nav-links";

// Shared shell for every /admin page. It holds no auth logic: each page calls
// requireUser("admin") itself, because layouts don't re-run on navigation.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/admin" className="font-semibold tracking-tight">
            Ancog Apartment
          </Link>
          <nav aria-label="Main" className="hidden flex-1 md:block">
            <Suspense fallback={null}>
              <TopNav />
            </Suspense>
          </nav>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            {/* Placeholder until notifications (#24). */}
            <button
              type="button"
              disabled
              aria-label="Notifications (coming soon)"
              title="Notifications (coming soon)"
              className="rounded-full p-2 text-zinc-500 disabled:cursor-not-allowed"
            >
              <Icon d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
            </button>
            <Suspense
              fallback={<span className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />}
            >
              <AdminMenu />
            </Suspense>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 md:pb-10">{children}</div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-zinc-800 dark:bg-zinc-950"
      >
        <Suspense fallback={null}>
          <BottomNav />
        </Suspense>
      </nav>
    </div>
  );
}
