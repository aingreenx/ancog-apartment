"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getSessionUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

async function signedIn() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Open a notification: mark it read, then go where it points (own area only). */
export async function openNotification(form: FormData): Promise<void> {
  const user = await signedIn();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", String(form.get("id")))
    .is("read_at", null);
  const link = String(form.get("link") ?? "");
  const home = user.role === "admin" ? "/admin" : "/portal";
  redirect(link.startsWith(home) ? link : home);
}

export async function markAllRead(): Promise<void> {
  const user = await signedIn();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", user.id)
    .is("read_at", null);
  refresh();
}

export async function savePushSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ ok: boolean }> {
  const user = await signedIn();
  if (!/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth)
    return { ok: false };
  const supabase = await createClient();
  // One row per device (endpoint). Re-subscribing replaces the old row.
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await supabase
    .from("push_subscriptions")
    .insert({ profile_id: user.id, endpoint: sub.endpoint, keys: sub.keys });
  return { ok: !error };
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await signedIn();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}
