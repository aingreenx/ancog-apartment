import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/dal";
import { getReceiptData } from "@/lib/receipts/receipt-data";
import { renderReceiptPdf } from "@/lib/receipts/receipt-pdf";
import { storeReceiptPdf } from "@/lib/receipts/store";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /receipts/<no>            → the receipt PDF, inline (view / print)
 * GET /receipts/<no>?download=1 → as a download
 * Admins see every receipt; tenants only their own (row-level security). Tenants get the
 * stored copy, made when the admin recorded the payment.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/receipts/[receiptNo]">) {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in first.", { status: 401 });

  const receiptNo = Number((await ctx.params).receiptNo);
  if (!Number.isSafeInteger(receiptNo) || receiptNo <= 0) {
    return new Response("Not found", { status: 404 });
  }

  const supabase = await createClient();
  let pdf: Buffer | null = null;

  if (user.role === "admin") {
    pdf = (await storeReceiptPdf(supabase, receiptNo))?.pdf ?? null;
  } else {
    const data = await getReceiptData(supabase, receiptNo);
    if (data?.pdfPath) {
      const { data: file } = await supabase.storage.from("receipts").download(data.pdfPath);
      if (file) pdf = Buffer.from(await file.arrayBuffer());
    }
    if (!pdf && data) pdf = await renderReceiptPdf(data);
  }
  if (!pdf) return new Response("Not found", { status: 404 });

  const download = request.nextUrl.searchParams.has("download");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="ancog-receipt-${receiptNo}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
