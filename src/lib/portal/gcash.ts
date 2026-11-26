import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Where to send GCash payments (Settings, #26). The QR image lives in the private
 * `receipts` bucket at app_settings.gcash_qr_path; a short-lived link is made with the
 * service role, so call this only after checking the caller is signed in.
 */
export async function getGcashDetails() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("gcash_name, gcash_number, gcash_qr_path")
    .maybeSingle();

  let qrUrl: string | null = null;
  if (data?.gcash_qr_path) {
    const { data: signed } = await createServiceClient()
      .storage.from("receipts")
      .createSignedUrl(data.gcash_qr_path, 60 * 30);
    qrUrl = signed?.signedUrl ?? null;
  }
  return { name: data?.gcash_name ?? null, number: data?.gcash_number ?? null, qrUrl };
}
