import Link from "next/link";
import { Suspense } from "react";
import { UserMenu } from "@/components/user-menu";
import { BottomNav, TopNav } from "@/components/app-nav";
import { ADMIN_NAV } from "@/components/nav-items";
import { NotificationBell } from "@/components/notifications";

// Shared shell for every /admin page. It holds no auth logic: each page calls
// requireUser("admin") itself, because layouts don't re-run on navigation.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b print:hidden border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/admin" className="font-semibold tracking-tight">
            Ancog Apartment
          </Link>
          <nav aria-label="Main" className="hidden flex-1 md:block">
            <Suspense fallback={null}>
              <TopNav items={ADMIN_NAV} />
            </Suspense>
          </nav>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <Suspense fallback={<span className="h-9 w-9" />}>
              <NotificationBell />
            </Suspense>
            <Suspense
              fallback={<span className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />}
            >
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 md:pb-10">{children}</main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t print:hidden border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-zinc-800 dark:bg-zinc-950"
      >
        <Suspense fallback={null}>
          <BottomNav items={ADMIN_NAV} />
        </Suspense>
      </nav>
    </div>
  );
}
