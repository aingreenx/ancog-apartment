import Link from "next/link";
import { getSessionUser } from "@/lib/auth/dal";
import { signOut } from "@/lib/auth/actions";

/** Avatar + dropdown. No client JS: it's a <details> element. */
export async function AdminMenu() {
  const user = await getSessionUser();
  if (!user) return null;
  const initials = user.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <details className="relative">
      <summary
        aria-label="Admin menu"
        className="flex cursor-pointer list-none items-center gap-2 rounded-full p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
          {initials}
        </span>
        <span className="hidden text-sm font-medium sm:inline">{user.displayName}</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
        <p className="px-2 py-1 text-sm font-medium">{user.displayName}</p>
        <p className="px-2 pb-2 text-xs text-zinc-500">{user.username} · Admin</p>
        <Link
          href="/change-password"
          className="block rounded-md px-2 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Change password
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-md px-2 py-2 text-left text-sm text-red-600 hover:bg-zinc-100 dark:text-red-400 dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
