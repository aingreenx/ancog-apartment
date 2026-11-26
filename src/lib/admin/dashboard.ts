import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayInManila } from "@/lib/money";
import { dueDateThisMonth, roomStatus, type RoomStatus } from "./room-status";

export interface RoomCard {
  number: number;
  baseRent: number;
  status: RoomStatus;
  stay: {
    tenancyId: string;
    tenantName: string;
    monthlyRent: number;
    owed: number;
    credit: number;
    balance: number;
    overdue: number;
    maxDaysOverdue: number;
  } | null;
}

export interface DashboardData {
  today: string;
  rooms: RoomCard[];
  occupied: number;
  totals: {
    rentExpected: number;
    rentCollected: number;
    electricityBilled: number;
    electricityCollected: number;
    totalUnpaid: number;
  };
  readingsDue: { tenancyId: string; room: number; tenantName: string; dueDate: string }[];
  lastJobRun: {
    runDate: string;
    finishedAt: string | null;
    error: string | null;
    created: number;
  } | null;
  paymentsToReview: {
    id: string;
    room: number | null;
    tenantName: string;
    paidOn: string;
    amount: number;
    method: string;
    referenceNo: string | null;
  }[];
}

const fullName = (t: { first_name: string; last_name: string } | null) =>
  t ? `${t.first_name} ${t.last_name}` : "Unknown";

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Couldn't load ${what}: ${result.error.message}`);
  return result.data as T;
}

/** Everything on the admin dashboard. Every number comes from the database views. */
export async function getDashboard(): Promise<DashboardData> {
  const supabase = await createClient();
  const today = todayInManila();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [y, m] = today.split("-").map(Number);
  const nextMonthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const [
    roomsRes,
    staysRes,
    balancesRes,
    monthChargesRes,
    unpaidRes,
    pendingRes,
    readingsRes,
    jobRes,
  ] = await Promise.all([
    supabase.from("rooms").select("id, number, base_rent_centavos").order("number"),
    supabase
      .from("tenancies")
      .select("id, room_id, due_day, monthly_rent_centavos, tenant:tenants(first_name, last_name)")
      .eq("status", "active"),
    supabase
      .from("tenancy_balances")
      .select(
        "tenancy_id, owed_centavos, credit_centavos, balance_centavos, overdue_centavos, max_days_overdue",
      )
      .eq("status", "active"),
    supabase
      .from("charge_balances")
      .select("type, amount_centavos, paid_centavos")
      .in("type", ["rent", "electricity"])
      .neq("status", "void")
      .gte("due_date", monthStart)
      .lt("due_date", nextMonthStart),
    supabase.from("tenancy_balances").select("owed_centavos"),
    supabase
      .from("payments")
      .select(
        "id, paid_on, amount_centavos, method, reference_no, tenancy:tenancies(room:rooms(number), tenant:tenants(first_name, last_name))",
      )
      .eq("status", "pending_review")
      .is("voided_at", null)
      .order("created_at"),
    supabase.from("meter_readings").select("tenancy_id").eq("reading_date", today),
    supabase
      .from("job_runs")
      .select("run_date, finished_at, error, rent_charges_created, notifications_created")
      .eq("job", "daily-billing")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rooms = check(roomsRes, "rooms");
  const stays = check(staysRes, "stays");
  const balances = check(balancesRes, "balances");
  const monthCharges = check(monthChargesRes, "this month's charges");
  const allBalances = check(unpaidRes, "balances");
  const pending = check(pendingRes, "payments to review");
  const readToday = new Set(check(readingsRes, "readings").map((r) => r.tenancy_id));

  const balanceByStay = new Map(balances.map((b) => [b.tenancy_id, b]));
  const stayByRoom = new Map(stays.map((s) => [s.room_id, s]));

  const cards: RoomCard[] = rooms.map((room) => {
    const stay = stayByRoom.get(room.id);
    if (!stay) {
      return {
        number: room.number,
        baseRent: room.base_rent_centavos,
        status: "vacant",
        stay: null,
      };
    }
    const b = balanceByStay.get(stay.id);
    const money = {
      owed: b?.owed_centavos ?? 0,
      credit: b?.credit_centavos ?? 0,
      overdue: b?.overdue_centavos ?? 0,
    };
    return {
      number: room.number,
      baseRent: room.base_rent_centavos,
      status: roomStatus(money),
      stay: {
        tenancyId: stay.id,
        tenantName: fullName(stay.tenant),
        monthlyRent: stay.monthly_rent_centavos,
        ...money,
        balance: b?.balance_centavos ?? 0,
        maxDaysOverdue: b?.max_days_overdue ?? 0,
      },
    };
  });

  const sum = (
    rows: { type: string | null; amount_centavos: number | null; paid_centavos: number | null }[],
    type: string,
    key: "amount_centavos" | "paid_centavos",
  ) => rows.filter((r) => r.type === type).reduce((s, r) => s + (r[key] ?? 0), 0);

  return {
    today,
    rooms: cards,
    occupied: stays.length,
    totals: {
      rentExpected: sum(monthCharges, "rent", "amount_centavos"),
      rentCollected: sum(monthCharges, "rent", "paid_centavos"),
      electricityBilled: sum(monthCharges, "electricity", "amount_centavos"),
      electricityCollected: sum(monthCharges, "electricity", "paid_centavos"),
      totalUnpaid: allBalances.reduce((s, b) => s + (b.owed_centavos ?? 0), 0),
    },
    readingsDue: stays
      .filter((s) => dueDateThisMonth(today, s.due_day) === today && !readToday.has(s.id))
      .map((s) => ({
        tenancyId: s.id,
        room: rooms.find((r) => r.id === s.room_id)?.number ?? 0,
        tenantName: fullName(s.tenant),
        dueDate: today,
      }))
      .sort((a, b) => a.room - b.room),
    lastJobRun: jobRes.data
      ? {
          runDate: jobRes.data.run_date,
          finishedAt: jobRes.data.finished_at,
          error: jobRes.data.error,
          created: jobRes.data.rent_charges_created + jobRes.data.notifications_created,
        }
      : null,
    paymentsToReview: pending.map((p) => ({
      id: p.id,
      room: p.tenancy?.room?.number ?? null,
      tenantName: fullName(p.tenancy?.tenant ?? null),
      paidOn: p.paid_on,
      amount: p.amount_centavos,
      method: p.method,
      referenceNo: p.reference_no,
    })),
  };
}
