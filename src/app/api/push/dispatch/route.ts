import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { sendPendingPushes } from "@/lib/notifications/push";

/**
 * POST /api/push/dispatch with "Authorization: Bearer <PUSH_DISPATCH_SECRET>".
 * Called every 5 minutes by the database (pg_cron + pg_net) so notifications created by
 * the daily job also reach phones.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const ok =
    Boolean(secret) &&
    given.length === secret!.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret!));
  if (!ok) return new Response("Unauthorized", { status: 401 });

  return Response.json(await sendPendingPushes());
}
