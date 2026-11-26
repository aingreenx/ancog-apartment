import "server-only";
import { formatMobile } from "@/lib/settings/format";
import { settingsImageUrl } from "@/lib/settings/files";
import { createClient } from "@/lib/supabase/server";

/**
 * Where to send GCash payments (Settings, #26). The QR image lives in the private
 * `settings` bucket; a short-lived link is made with the service role, so call this
 * only after checking the caller is signed in.
 */
export async function getGcashDetails() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("gcash_name, gcash_number, gcash_qr_path")
    .maybeSingle();

  return {
    name: data?.gcash_name ?? null,
    number: data?.gcash_number ? formatMobile(data.gcash_number) : null,
    qrUrl: await settingsImageUrl(data?.gcash_qr_path ?? null),
  };
}
