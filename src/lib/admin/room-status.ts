import type { Centavos } from "@/lib/billing/electricity";

export type RoomStatus = "paid" | "partial" | "overdue" | "vacant";

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  paid: "Paid",
  partial: "Partial",
  overdue: "Overdue",
  vacant: "Vacant",
};

/**
 * One badge per room card:
 *   vacant  – no active stay
 *   overdue – something is past its due date
 *   partial – something is owed, but nothing is overdue yet
 *   paid    – nothing owed (credit counts towards what is owed)
 */
export function roomStatus(
  stay: { owed: Centavos; credit: Centavos; overdue: Centavos } | null,
): RoomStatus {
  if (!stay) return "vacant";
  if (stay.overdue > 0) return "overdue";
  if (stay.owed - stay.credit > 0) return "partial";
  return "paid";
}

/** Due date this month for a stay's due day, e.g. day 31 in November → the 30th. */
export function dueDateThisMonth(today: string, dueDay: number): string {
  const [year, month] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${today.slice(0, 7)}-${String(Math.min(dueDay, lastDay)).padStart(2, "0")}`;
}
