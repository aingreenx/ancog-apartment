import "server-only";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/admin";

export function pushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT,
  );
}

/**
 * Send every notification that hasn't been pushed yet (from the last day) to each of its
 * owner's subscribed devices, then mark it pushed. Subscriptions the push service says
 * are gone (404/410) are removed. Safe to call often and concurrently-ish: a row is
 * claimed by setting pushed_at before sending.
 */
export async function sendPendingPushes(): Promise<{ sent: number; notifications: number }> {
  if (!pushConfigured()) return { sent: 0, notifications: 0 };
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const db = createServiceClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  // Claim the pending rows first so two dispatchers don't send twice.
  const { data: claimed } = await db
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .is("pushed_at", null)
    .gte("created_at", since)
    .select("id, profile_id, title, body, link");
  if (!claimed || claimed.length === 0) return { sent: 0, notifications: 0 };

  const profileIds = [...new Set(claimed.map((n) => n.profile_id))];
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, profile_id, endpoint, keys")
    .in("profile_id", profileIds);

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    claimed.flatMap((n) =>
      (subs ?? [])
        .filter((s) => s.profile_id === n.profile_id)
        .map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
              JSON.stringify({ title: n.title, body: n.body ?? "", url: n.link ?? "/" }),
              { TTL: 60 * 60 * 24 },
            );
            sent++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) gone.push(s.id);
          }
        }),
    ),
  );
  if (gone.length > 0) await db.from("push_subscriptions").delete().in("id", gone);
  return { sent, notifications: claimed.length };
}
