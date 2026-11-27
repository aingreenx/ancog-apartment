/**
 * Create an admin login (#29). Prints a temporary password; they must change it at first
 * sign-in. Admins sign in with their email.
 *
 *   npx tsx --env-file=.env.production.local scripts/create-admin.ts --email maria@example.com --name "Maria Ancog"
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminUsername } from "../src/lib/import/rooms";

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const email = option("email")?.trim().toLowerCase();
  const name = option("name")?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
    throw new Error('Usage: create-admin.ts --email you@example.com --name "Your Name"');
  }
  const username = adminUsername(email);
  if (!username) throw new Error("The part of the email before @ must be 3–64 characters.");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Strong one-time password (admins can see everything): 16 random characters.
  const password = randomBytes(12).toString("base64url");
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Couldn't create ${email}: ${error?.message}`);

  const { error: profileError } = await supabase.from("profiles").insert({
    id: data.user.id,
    role: "admin",
    username,
    display_name: name,
    must_change_password: true,
  });
  if (profileError) {
    await supabase.auth.admin.deleteUser(data.user.id);
    throw new Error(`Couldn't create the admin profile: ${profileError.message}`);
  }

  console.log(`Admin created on ${url}`);
  console.log(`  Sign in with: ${email}`);
  console.log(`  Temporary password: ${password}`);
  console.log("  They must choose a new password at first sign-in. Share this privately.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
