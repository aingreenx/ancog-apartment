import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Settings images (GCash QR, receipt signature) live in the private `settings` bucket.
 * Only admins can read it directly, so these use the service role: call them only
 * after checking the caller may see the image (any signed-in user for the QR; the
 * receipt's reader for the signature).
 */
export async function settingsImageUrl(path: string | null, seconds = 60 * 30) {
  if (!path) return null;
  const { data } = await createServiceClient()
    .storage.from("settings")
    .createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export async function settingsImageBytes(path: string | null): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data } = await createServiceClient().storage.from("settings").download(path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}
