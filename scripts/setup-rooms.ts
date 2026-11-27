/**
 * Production setup (#29): create the 13 rooms with their rent and meter serial.
 *
 *   npx tsx --env-file=.env.production.local scripts/setup-rooms.ts --file imports/private/rooms.csv           # dry run
 *   npx tsx --env-file=.env.production.local scripts/setup-rooms.ts --file imports/private/rooms.csv --commit
 *
 * Only for an empty database (no rooms yet). Later changes: rent per stay on the tenant
 * page, meter serials in Settings. Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseCsv } from "../src/lib/import/notebook";
import { planRooms } from "../src/lib/import/rooms";

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const file = option("file") ?? "imports/private/rooms.csv";
  const commit = args.includes("--commit");
  if (!existsSync(file)) throw new Error(`Missing ${file}. Copy imports/templates/rooms.csv.`);

  const { rooms, errors } = planRooms(parseCsv(readFileSync(file, "utf8")));
  for (const r of rooms) {
    console.log(
      `Room ${String(r.number).padStart(2)}  ₱${(r.rentCentavos / 100).toLocaleString("en-PH")}/month  ${r.meterSerial ?? "(no serial)"}`,
    );
  }
  if (errors.length > 0) {
    for (const e of errors) console.log(`ERROR: ${e}`);
    process.exitCode = 1;
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { count, error: countError } = await supabase
    .from("rooms")
    .select("id", { count: "exact", head: true });
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    console.log(`\nThis database already has ${count} rooms. Nothing to do.`);
    return;
  }
  console.log(`\nTarget: ${url}`);
  if (!commit) {
    console.log("Dry run: nothing written. Add --commit to create these 13 rooms.");
    return;
  }

  const { error } = await supabase.from("rooms").insert(
    rooms.map((r) => ({
      number: r.number,
      base_rent_centavos: r.rentCentavos,
      meter_serial: r.meterSerial,
    })),
  );
  if (error) throw new Error(`Couldn't create the rooms: ${error.message}`);
  console.log("Created 13 rooms.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
