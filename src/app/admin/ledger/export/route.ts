import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { ledgerToCsv } from "@/lib/admin/ledger";
import { getLedger, parseMonth } from "@/lib/admin/ledger-data";
import { todayInManila } from "@/lib/money";

/** GET /admin/ledger/export?month=YYYY-MM → CSV download (opens in Excel). Admins only. */
export async function GET(request: NextRequest) {
  await requireUser("admin");
  const month = parseMonth(request.nextUrl.searchParams.get("month"), todayInManila().slice(0, 7));
  const csv = ledgerToCsv(await getLedger(month));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ancog-ledger-${month}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
