import { describe, expect, it } from "vitest";
import { centavosToInput, formatDate, formatPeso, parsePesos, todayInManila } from "./money";

describe("formatPeso", () => {
  it("drops centavos for whole pesos", () => {
    expect(formatPeso(397_200)).toBe("₱3,972");
    expect(formatPeso(0)).toBe("₱0");
  });

  it("shows centavos otherwise", () => {
    expect(formatPeso(1_375)).toBe("₱13.75");
  });
});

describe("parsePesos", () => {
  it("accepts pesos with up to 2 decimals", () => {
    expect(parsePesos("2,500")).toBe(250_000);
    expect(parsePesos("₱13.5")).toBe(1_350);
    expect(parsePesos(" 13.75 ")).toBe(1_375);
    expect(parsePesos("0")).toBe(0);
  });

  it("rejects anything else", () => {
    expect(parsePesos("")).toBeNull();
    expect(parsePesos("-5")).toBeNull();
    expect(parsePesos("1.234")).toBeNull();
    expect(parsePesos("abc")).toBeNull();
  });

  it("round-trips with centavosToInput", () => {
    for (const c of [0, 1_375, 250_000, 1_350]) expect(parsePesos(centavosToInput(c))).toBe(c);
  });
});

describe("dates", () => {
  it("uses Manila time for today", () => {
    // 2026-11-26 17:30 UTC is already Nov 27 in Manila (UTC+8).
    expect(todayInManila(new Date("2026-11-26T17:30:00Z"))).toBe("2026-11-27");
    expect(todayInManila(new Date("2026-11-26T15:59:00Z"))).toBe("2026-11-26");
  });

  it("formats ISO dates without timezone drift", () => {
    expect(formatDate("2026-11-01")).toBe("Nov 1, 2026");
  });
});
