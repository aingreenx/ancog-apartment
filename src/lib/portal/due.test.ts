import { describe, expect, it } from "vitest";
import { nextDueDate } from "./due";

describe("nextDueDate", () => {
  it("is later this month, or today", () => {
    expect(nextDueDate("2026-11-10", 14)).toBe("2026-11-14");
    expect(nextDueDate("2026-11-14", 14)).toBe("2026-11-14");
  });

  it("rolls into next month, clamping 29–31", () => {
    expect(nextDueDate("2026-11-26", 14)).toBe("2026-12-14");
    expect(nextDueDate("2027-01-31", 30)).toBe("2027-02-28");
    expect(nextDueDate("2026-12-31", 31)).toBe("2026-12-31");
  });
});
