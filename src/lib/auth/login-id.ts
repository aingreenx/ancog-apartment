// One login box for everyone: admins type their email, tenants type their username
// (e.g. room3-frannie-4612). Tenant usernames are stored in Supabase Auth as an
// internal email, so both sign in with email + password behind the scenes.

export const TENANT_EMAIL_DOMAIN = "tenants.ancog.local";

const USERNAME = /^[a-z0-9][a-z0-9-]{2,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Turn what was typed in the login box into the email to sign in with, or null if invalid. */
export function toLoginEmail(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (value.includes("@")) return EMAIL.test(value) ? value : null;
  return USERNAME.test(value) ? `${value}@${TENANT_EMAIL_DOMAIN}` : null;
}

export type Role = "admin" | "tenant";

export function homeFor(role: Role): "/admin" | "/portal" {
  return role === "admin" ? "/admin" : "/portal";
}

/**
 * Where to go after login. A `next` path is honoured only if it is a local path inside
 * the user's own area, so a tenant can't be bounced into /admin (or off-site).
 */
export function redirectAfterLogin(role: Role, next?: string | null): string {
  const home = homeFor(role);
  if (next && next.startsWith(home) && !next.startsWith("//") && /^\/[\w\-/?=&%.]*$/.test(next)) {
    return next;
  }
  return home;
}
