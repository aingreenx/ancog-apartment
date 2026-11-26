import { dueDateThisMonth } from "@/lib/admin/room-status";

/** The next rent due date on or after today (days 29–31 move to the end of short months). */
export function nextDueDate(today: string, dueDay: number): string {
  const thisMonth = dueDateThisMonth(today, dueDay);
  if (thisMonth >= today) return thisMonth;
  const [y, m] = today.split("-").map(Number);
  const firstOfNext = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return dueDateThisMonth(firstOfNext, dueDay);
}
