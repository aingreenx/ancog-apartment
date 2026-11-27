import { describe, expect, it } from "vitest";
import { adminUsername, planRooms } from "./rooms";

const all = (rent = "3500") =>
  Array.from({ length: 13 }, (_, i) => ({ room: String(i + 1), rent, meter_serial: "" }));

describe("planRooms", () => {
  it("accepts all 13 rooms", () => {
    const rows = all();
    rows[2] = { room: "3", rent: "2,500", meter_serial: " ab 12 " };
    const { rooms, errors } = planRooms(rows);
    expect(errors).toEqual([]);
    expect(rooms).toHaveLength(13);
    expect(rooms[2]).toEqual({ number: 3, rentCentavos: 250000, meterSerial: "AB12" });
    expect(rooms[0].meterSerial).toBeNull();
  });

  it("reports bad rows, duplicates and missing rooms", () => {
    const rows = all().slice(0, 11);
    rows.push({ room: "1", rent: "3500", meter_serial: "" });
    rows.push({ room: "14", rent: "3500", meter_serial: "" });
    rows[4] = { room: "5", rent: "free", meter_serial: "" };
    const { errors } = planRooms(rows);
    expect(errors).toEqual([
      "rooms.csv line 6: rent for room 5 must be a peso amount like 3500.",
      'rooms.csv line 14: room must be 1–13 (got "14").',
      "Room 1 is listed 2 times.",
      "Missing rooms: 5, 12, 13.",
    ]);
  });

  it("rejects a serial used twice", () => {
    const rows = all();
    rows[0].meter_serial = "X1";
    rows[1].meter_serial = "x1";
    expect(planRooms(rows).errors).toEqual(["The same meter serial is on two rooms: X1."]);
  });
});

describe("adminUsername", () => {
  it("uses the email's local part", () => {
    expect(adminUsername("Maria.Ancog@Gmail.com")).toBe("maria.ancog");
    expect(adminUsername("jo@x.com")).toBeNull();
  });
});
