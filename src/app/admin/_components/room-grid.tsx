"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RoomCard } from "@/lib/admin/dashboard";
import { ROOM_STATUS_LABEL, type RoomStatus } from "@/lib/admin/room-status";
import { formatPeso } from "@/lib/money";

const FILTERS: ("all" | RoomStatus)[] = ["all", "paid", "partial", "overdue", "vacant"];

export const BADGE: Record<RoomStatus, string> = {
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  overdue: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  vacant: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

export function RoomGrid({ rooms }: { rooms: RoomCard[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rooms.length };
    for (const r of rooms) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rooms]);

  const shown = rooms.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    const q = query
      .trim()
      .toLowerCase()
      .replace(/^room\s*/, "");
    if (!q) return true;
    return String(r.number) === q || (r.stay?.tenantName.toLowerCase().includes(q) ?? false);
  });

  return (
    <section aria-labelledby="rooms-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="rooms-heading" className="text-lg font-semibold">
          Rooms
        </h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search room or name"
          aria-label="Search room or name"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm sm:w-64 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div
        role="group"
        aria-label="Filter rooms"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
              filter === f
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {f === "all" ? "All" : ROOM_STATUS_LABEL[f]} ({counts[f] ?? 0})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">No rooms match.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((room) => (
            <li
              key={room.number}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
                    Room {room.number}
                  </p>
                  <p className="font-medium">{room.stay ? room.stay.tenantName : "Vacant"}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[room.status]}`}
                >
                  {ROOM_STATUS_LABEL[room.status]}
                </span>
              </div>

              {room.stay ? (
                <dl className="grid grid-cols-2 gap-x-2 text-sm">
                  <dt className="text-zinc-500">Rent</dt>
                  <dd className="text-right tabular-nums">
                    {formatPeso(room.stay.monthlyRent)}/mo
                  </dd>
                  <dt className="text-zinc-500">Owed</dt>
                  <dd className="text-right font-medium tabular-nums">
                    {formatPeso(Math.max(room.stay.balance, 0))}
                  </dd>
                  {room.stay.balance < 0 && (
                    <>
                      <dt className="text-zinc-500">Credit</dt>
                      <dd className="text-right tabular-nums">{formatPeso(-room.stay.balance)}</dd>
                    </>
                  )}
                  {room.stay.maxDaysOverdue > 0 && (
                    <>
                      <dt className="text-zinc-500">Overdue</dt>
                      <dd className="text-right text-red-700 tabular-nums dark:text-red-400">
                        {room.stay.maxDaysOverdue} day{room.stay.maxDaysOverdue === 1 ? "" : "s"}
                      </dd>
                    </>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-zinc-500">{formatPeso(room.baseRent)}/mo</p>
              )}

              <div className="mt-auto pt-1 text-sm">
                {room.stay ? (
                  <Link
                    href={`/admin/readings?room=${room.number}`}
                    className="font-medium underline underline-offset-4"
                  >
                    Record reading
                  </Link>
                ) : (
                  <Link
                    href={`/admin/move-in?room=${room.number}`}
                    className="font-medium underline underline-offset-4"
                  >
                    Move in a tenant
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
