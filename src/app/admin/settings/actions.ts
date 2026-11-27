"use server";

import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import type { Database } from "@/lib/database.types";
import {
  duplicateSerials,
  isSettingsImagePath,
  normalizeMobile,
  normalizeSerial,
  optionalText,
} from "@/lib/settings/format";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type SettingsResult =
  | { status: "idle" }
  | { status: "error"; error: string; field?: string }
  | { status: "done"; message: string; key: number };

const done = (message: string): SettingsResult => ({ status: "done", message, key: Date.now() });
const fail = (error: string, field?: string): SettingsResult => ({
  status: "error",
  error,
  field,
});

type ImageKind = "gcash-qr" | "signature";
type ImageChange = { keep: true } | { path: string | null } | { error: string };

/**
 * The image field sends `<name>Path`: a new upload's path, "remove", or "" (keep).
 */
function imageChange(form: FormData, name: string, kind: ImageKind): ImageChange {
  const value = String(form.get(`${name}Path`) ?? "");
  if (value === "") return { keep: true };
  if (value === "remove") return { path: null };
  if (!isSettingsImagePath(kind, value)) return { error: "The image didn't upload. Try again." };
  return { path: value };
}

/** Deletes a replaced or removed settings image. A failure only leaves an unused file. */
async function removeOld(oldPath: string | null | undefined, newPath: string | null) {
  if (!oldPath || oldPath === newPath) return;
  const supabase = await createClient();
  await supabase.storage.from("settings").remove([oldPath]);
}

export async function saveGcash(_prev: SettingsResult, form: FormData): Promise<SettingsResult> {
  await requireUser("admin");
  const name = optionalText(form.get("gcashName"));
  const rawNumber = optionalText(form.get("gcashNumber"));
  const number = rawNumber ? normalizeMobile(rawNumber) : null;
  if (rawNumber && !number) {
    return fail("Enter an 11-digit mobile number, e.g. 0917 123 4567.", "gcashNumber");
  }
  if (name && name.length > 80) return fail("Use at most 80 characters.", "gcashName");
  const qr = imageChange(form, "gcashQr", "gcash-qr");
  if ("error" in qr) return fail(qr.error, "gcashQr");

  const supabase = await createClient();
  const { data: current } = await supabase.from("app_settings").select("gcash_qr_path").single();
  const { error } = await supabase
    .from("app_settings")
    .update({
      gcash_name: name,
      gcash_number: number,
      ...("path" in qr ? { gcash_qr_path: qr.path } : {}),
    })
    .eq("id", true);
  if (error) return fail("Couldn't save. Please try again.");
  if ("path" in qr) await removeOld(current?.gcash_qr_path, qr.path);

  refresh();
  return done("GCash details saved. Tenants see them on the Pay with GCash screen.");
}

export async function saveReceipt(_prev: SettingsResult, form: FormData): Promise<SettingsResult> {
  await requireUser("admin");
  const address = optionalText(form.get("address"));
  if (address && address.length > 200) return fail("Use at most 200 characters.", "address");
  const sig = imageChange(form, "signature", "signature");
  if ("error" in sig) return fail(sig.error, "signature");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("app_settings")
    .select("receipt_signature_path")
    .single();
  const { error } = await supabase
    .from("app_settings")
    .update({
      apartment_address: address,
      ...("path" in sig ? { receipt_signature_path: sig.path } : {}),
    })
    .eq("id", true);
  if (error) return fail("Couldn't save. Please try again.");
  if ("path" in sig) await removeOld(current?.receipt_signature_path, sig.path);

  refresh();
  return done("Saved. New receipts use it; receipts already issued keep their PDF.");
}

export async function saveMeterSerials(
  _prev: SettingsResult,
  form: FormData,
): Promise<SettingsResult> {
  await requireUser("admin");
  const supabase = await createClient();
  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id, number, meter_serial");
  if (roomsError || !rooms) return fail("Couldn't load the rooms.");

  const wanted = rooms.map((r) => ({ ...r, next: normalizeSerial(form.get(`serial-${r.id}`)) }));
  const tooLong = wanted.find((r) => r.next && r.next.length > 40);
  if (tooLong) return fail(`Room ${tooLong.number}: use at most 40 characters.`);
  const dupes = duplicateSerials(wanted.map((r) => r.next));
  if (dupes.length > 0) return fail(`The same serial is on two rooms: ${dupes.join(", ")}.`);

  const changed = wanted.filter((r) => r.next !== r.meter_serial);
  // Clear first, then set, so swapping two rooms' serials doesn't hit the unique index.
  for (const r of changed.filter((c) => c.meter_serial !== null)) {
    const { error } = await supabase.from("rooms").update({ meter_serial: null }).eq("id", r.id);
    if (error) return fail(`Couldn't save room ${r.number}. Please try again.`);
  }
  for (const r of changed.filter((c) => c.next !== null)) {
    const { error } = await supabase.from("rooms").update({ meter_serial: r.next }).eq("id", r.id);
    if (error) return fail(`Couldn't save room ${r.number}. Please try again.`);
  }

  refresh();
  return done(
    changed.length === 0
      ? "Nothing changed."
      : `Saved ${changed.length} room${changed.length === 1 ? "" : "s"}.`,
  );
}

export async function saveMyName(_prev: SettingsResult, form: FormData): Promise<SettingsResult> {
  const me = await requireUser("admin");
  const name = optionalText(form.get("displayName"));
  if (!name) return fail("Enter your name.", "displayName");
  if (name.length > 60) return fail("Use at most 60 characters.", "displayName");

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", me.id);
  if (error) return fail("Couldn't save. Please try again.");
  refresh();
  return done("Name saved. Receipts you issue from now on show it.");
}

const MIN_PASSWORD_LENGTH = 8;

export async function changeMyPassword(
  _prev: SettingsResult,
  form: FormData,
): Promise<SettingsResult> {
  const me = await requireUser("admin");
  const current = String(form.get("current") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (!current) return fail("Enter your current password.", "current");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail(`Use at least ${MIN_PASSWORD_LENGTH} characters.`, "password");
  }
  if (password !== confirm) return fail("The two passwords don't match.", "confirm");
  if (password === current) return fail("Choose a different password.", "password");

  // Check the current password on a throwaway client, so the signed-in session isn't touched.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || user.id !== me.id) {
    return fail("Couldn't change the password. Please try again.");
  }
  const email = user.email;
  const check = createStatelessClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: wrong } = await check.auth.signInWithPassword({ email, password: current });
  if (wrong) return fail("That's not your current password.", "current");
  await check.auth.signOut({ scope: "local" });

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail("Couldn't change the password. Please try again.");
  return done("Password changed.");
}
