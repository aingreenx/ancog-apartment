import { describe, expect, it } from "vitest";
import { dueDateThisMonth, roomStatus } from "./room-status";

describe("roomStatus", () => {
  it("is vacant without a stay", () => {
    expect(roomStatus(null)).toBe("vacant");
  });

  it("is overdue when anything is overdue", () => {
    expect(roomStatus({ owed: 44_500, credit: 0, overdue: 44_500 })).toBe("overdue");
  });

  it("is partial when something is owed but not overdue", () => {
    expect(roomStatus({ owed: 250_000, credit: 0, overdue: 0 })).toBe("partial");
  });

  it("is paid when nothing is owed, or credit covers it", () => {
    expect(roomStatus({ owed: 0, credit: 50_000, overdue: 0 })).toBe("paid");
    expect(roomStatus({ owed: 30_000, credit: 30_000, overdue: 0 })).toBe("paid");
  });
});

describe("dueDateThisMonth", () => {
  it("keeps normal days and clamps 29–31", () => {
    expect(dueDateThisMonth("2026-11-26", 14)).toBe("2026-11-14");
    expect(dueDateThisMonth("2026-11-26", 31)).toBe("2026-11-30");
    expect(dueDateThisMonth("2027-02-10", 30)).toBe("2027-02-28");
  });
});
