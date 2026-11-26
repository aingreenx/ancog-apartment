import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/lib/database.types";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Supabase client for Server Components, Server Functions and Route Handlers.
 * Create a new one per request; never share it between requests.
 */
export async function createClient() {
  // Session data is per request: never prerender it (incl. runtime prefetches, where
  // cookies are available but the auth client's Date.now() calls would be flagged).
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: the session is refreshed by the proxy (added with login, #10).
        }
      },
    },
  });
}
