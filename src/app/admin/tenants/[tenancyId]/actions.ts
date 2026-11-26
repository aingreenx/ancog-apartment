"use server";

import { randomInt } from "node:crypto";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { generateTempPassword } from "@/lib/admin/move-in";
import { parsePesos } from "@/lib/money";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type FormResult =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "done"; message?: string; key?: number };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function updateProfile(_prev: FormResult, form: FormData): Promise<FormResult> {
  await requireUser("admin");
  const tenancyId = String(form.get("tenancyId"));
  const tenantId = String(form.get("tenantId"));
  const text = (k: string) => String(form.get(k) ?? "").trim();
  const dueDay = Number(text("dueDay"));

  if (!text("firstName") || !text("lastName") || !text("phone1")) {
    return { status: "error", error: "First name, last name and phone 1 are required." };
  }
  if (!DATE.test(text("startDate"))) return { status: "error", error: "Pick the move-in date." };
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    return { status: "error", error: "Due day must be 1–31." };
  }

  const supabase = await createClient();
  const [t, s] = await Promise.all([
    supabase
      .from("tenants")
      .update({
        first_name: text("firstName"),
        last_name: text("lastName"),
        phone_1: text("phone1"),
        phone_2: text("phone2") || null,
        address: text("address") || null,
      })
      .eq("id", tenantId),
    supabase
      .from("tenancies")
      .update({ start_date: text("startDate"), due_day: dueDay })
      .eq("id", tenancyId),
  ]);
  if (t.error || s.error) return { status: "error", error: "Couldn't save the changes." };
  refresh();
  return { status: "done", message: "Saved." };
}

export async function addOccupant(_prev: FormResult, form: FormData): Promise<FormResult> {
  await requireUser("admin");
  const nameText = String(form.get("name") ?? "").trim();
  if (!nameText) return { status: "error", error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("tenancy_occupants").insert({
    tenancy_id: String(form.get("tenancyId")),
    name: nameText,
    phone: String(form.get("phone") ?? "").trim() || null,
  });
  if (error) return { status: "error", error: "Couldn't add the occupant." };
  refresh();
  return { status: "done", key: Date.now() };
}

export async function removeOccupant(form: FormData): Promise<void> {
  await requireUser("admin");
  const supabase = await createClient();
  await supabase
    .from("tenancy_occupants")
    .delete()
    .eq("id", String(form.get("occupantId")));
  refresh();
}

export async function addCharge(_prev: FormResult, form: FormData): Promise<FormResult> {
  const admin = await requireUser("admin");
  const description = String(form.get("description") ?? "").trim();
  const amount = parsePesos(String(form.get("amount") ?? ""));
  const dueDate = String(form.get("dueDate") ?? "");
  const type = form.get("type") === "deduction" ? "deduction" : "custom";

  if (!description) return { status: "error", error: "Describe the charge." };
  if (amount === null || amount <= 0)
    return { status: "error", error: "Enter the amount in pesos." };
  if (!DATE.test(dueDate)) return { status: "error", error: "Pick the due date." };

  const supabase = await createClient();
  const { error } = await supabase.from("charges").insert({
    tenancy_id: String(form.get("tenancyId")),
    type,
    description,
    due_date: dueDate,
    amount_centavos: amount,
    created_by: admin.id,
  });
  if (error) return { status: "error", error: "Couldn't add the charge." };
  refresh();
  return { status: "done", message: "Charge added." };
}

/** New temporary password; the tenant must change it on next login. */
export async function resetPassword(_prev: FormResult, form: FormData): Promise<FormResult> {
  // Admins only, checked BEFORE the service-role key is used.
  await requireUser("admin");
  const profileId = String(form.get("profileId") ?? "");
  if (!profileId) return { status: "error", error: "This tenant has no login." };

  const password = generateTempPassword(randomInt);
  const { error } = await createServiceClient().auth.admin.updateUserById(profileId, { password });
  if (error) return { status: "error", error: "Couldn't reset the password." };

  const supabase = await createClient();
  await supabase.from("profiles").update({ must_change_password: true }).eq("id", profileId);
  refresh();
  return { status: "done", message: password };
}
