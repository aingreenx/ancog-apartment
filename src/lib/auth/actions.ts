"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "./dal";
import { homeFor, redirectAfterLogin, toLoginEmail } from "./login-id";

export interface FormState {
  error?: string;
}

const MIN_PASSWORD_LENGTH = 8;

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const login = String(formData.get("login") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const email = toLoginEmail(login);
  if (!email || !password) return { error: "Enter your username (or email) and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "Wrong username or password." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, must_change_password")
    .eq("id", data.user.id)
    .single();
  if (!profile) {
    await supabase.auth.signOut();
    return { error: "This account isn't set up yet. Please contact the admin." };
  }

  if (profile.must_change_password) redirect("/change-password");
  redirect(redirectAfterLogin(profile.role, next));
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error:
        error.code === "same_password"
          ? "Choose a password different from the temporary one."
          : "Couldn't change the password. Please try again.",
    };
  }

  const { error: flagError } = await supabase.rpc("mark_password_changed");
  if (flagError) return { error: "Password changed, but please try again to continue." };

  redirect(homeFor(user.role));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
