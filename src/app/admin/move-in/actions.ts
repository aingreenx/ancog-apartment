"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { TENANT_EMAIL_DOMAIN } from "@/lib/auth/login-id";
import { parseMoveIn, type MoveInErrors } from "@/lib/admin/move-in";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type MoveInState =
  | { status: "idle" }
  | { status: "error"; errors: MoveInErrors }
  | { status: "done"; room: number; name: string; username: string; password: string };

export async function moveIn(_prev: MoveInState, formData: FormData): Promise<MoveInState> {
  // 1. Admins only, checked BEFORE the service-role key is used.
  await requireUser("admin");

  const parsed = parseMoveIn(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const input = parsed.value;

  const supabase = await createClient();

  // Friendly checks first (the database enforces both anyway).
  const [{ data: taken }, { data: room }] = await Promise.all([
    supabase.from("profiles").select("id").eq("username", input.username).maybeSingle(),
    supabase
      .from("rooms")
      .select("id, tenancies(id)")
      .eq("number", input.room)
      .eq("tenancies.status", "active")
      .single(),
  ]);
  if (taken) return { status: "error", errors: { username: "This username is already taken." } };
  if (!room || room.tenancies.length > 0) {
    return { status: "error", errors: { room: `Room ${input.room} is not vacant.` } };
  }

  // 2. Create the login. Tenants sign in with their username, stored as an internal email.
  const service = createServiceClient();
  const { data: created, error: authError } = await service.auth.admin.createUser({
    email: `${input.username}@${TENANT_EMAIL_DOMAIN}`,
    password: input.password,
    email_confirm: true,
  });
  if (authError || !created.user) {
    const exists = authError?.code === "email_exists" || authError?.status === 422;
    return {
      status: "error",
      errors: exists
        ? { username: "This username is already taken." }
        : { form: "Couldn't create the login. Please try again." },
    };
  }

  // 3. Everything else in one transaction (profile, tenant, stay, occupants, move-in
  //    reading, advance + deposit charges). If it fails, remove the login again.
  const { error } = await supabase.rpc("move_in", {
    p_user_id: created.user.id,
    p_username: input.username,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_phone_1: input.phone1,
    p_phone_2: input.phone2,
    p_address: input.address,
    p_occupants: input.occupants,
    p_room_number: input.room,
    p_start_date: input.startDate,
    p_starting_kwh: input.startingKwh,
    p_advance_centavos: input.advance,
    p_deposit_centavos: input.deposit,
  });
  if (error) {
    await service.auth.admin.deleteUser(created.user.id);
    const notVacant = error.code === "23505" && /vacant|one_active/.test(error.message);
    return {
      status: "error",
      errors: notVacant
        ? { room: `Room ${input.room} is not vacant.` }
        : { form: "Couldn't save the move-in. Nothing was saved; please try again." },
    };
  }

  refresh();
  return {
    status: "done",
    room: input.room,
    name: `${input.firstName} ${input.lastName}`,
    username: input.username,
    password: input.password,
  };
}
