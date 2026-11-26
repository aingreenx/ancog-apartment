import Link from "next/link";
import { getSessionUser } from "@/lib/auth/dal";
import { markAllRead, openNotification } from "@/lib/notifications/actions";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "./app-nav";
import { BELL_ICON } from "./nav-items";
import { PushToggle } from "./push-toggle";

/** Header bell with the unread count. */
export async function NotificationBell() {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .is("read_at", null);
  const unread = count ?? 0;
  const href = user.role === "admin" ? "/admin/notifications" : "/portal/notifications";
  return (
    <Link
      href={href}
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative rounded-full p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      <Icon d={BELL_ICON} />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

const timeAgo = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(iso));
};

/** The notifications page, for admins and tenants alike. */
export async function NotificationsList() {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, link, read_at, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const items = data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="flex flex-col gap-4">
      <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{unread > 0 ? `${unread} unread` : "All read"}</p>
        {unread > 0 && (
          <form action={markAllRead}>
            <button type="submit" className="text-sm underline underline-offset-4">
              Mark all as read
            </button>
          </form>
        )}
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No notifications yet.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {items.map((n) => (
            <li key={n.id}>
              <form action={openNotification}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="link" value={n.link ?? ""} />
                <button
                  type="submit"
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                    n.read_at ? "text-zinc-500" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-blue-600"}`}
                  />
                  <span className="flex-1">
                    <span className={n.read_at ? "" : "font-medium"}>{n.title}</span>
                    {n.body && <span className="block">{n.body}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">{timeAgo(n.created_at)}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
