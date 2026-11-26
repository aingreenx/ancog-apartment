import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeFor, type Role } from "./login-id";

export interface SessionUser {
  id: string;
  role: Role;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
}

/** The signed-in user and their profile, or null. Verified with the Auth server. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, username, display_name, must_change_password")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return {
    id: user.id,
    role: profile.role,
    username: profile.username,
    displayName: profile.display_name,
    mustChangePassword: profile.must_change_password,
  };
});

/**
 * Use at the top of every protected page/action. Redirects:
 *   - not signed in → /login
 *   - must change password → /change-password
 *   - wrong area (tenant on /admin, admin on /portal) → their own home
 */
export async function requireUser(role: Role): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== role) redirect(homeFor(user.role));
  return user;
}
