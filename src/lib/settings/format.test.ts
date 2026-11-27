import { describe, expect, it } from "vitest";
import {
  duplicateSerials,
  formatMobile,
  isSettingsImagePath,
  normalizeMobile,
  normalizeSerial,
  optionalText,
} from "./format";

describe("normalizeMobile", () => {
  it.each([
    ["09171234567", "09171234567"],
    ["0917 123 4567", "09171234567"],
    ["0917-123-4567", "09171234567"],
    ["+63 917 123 4567", "09171234567"],
    ["639171234567", "09171234567"],
  ])("%s → %s", (input, expected) => expect(normalizeMobile(input)).toBe(expected));

  it.each(["", "0917123456", "091712345678", "08171234567", "abc", "+1 917 123 4567"])(
    "rejects %s",
    (input) => expect(normalizeMobile(input)).toBeNull(),
  );
});

describe("formatMobile", () => {
  it("groups the digits", () => expect(formatMobile("09171234567")).toBe("0917 123 4567"));
  it("leaves anything else alone", () => expect(formatMobile("0900 000")).toBe("0900 000"));
});

describe("optionalText", () => {
  it("trims and collapses spaces", () =>
    expect(optionalText("  Prk. 6,   Salvacion ")).toBe("Prk. 6, Salvacion"));
  it("empty is null", () => {
    expect(optionalText("   ")).toBeNull();
    expect(optionalText(null)).toBeNull();
  });
});

describe("meter serials", () => {
  it("normalizes", () => {
    expect(normalizeSerial(" ab 12-34 ")).toBe("AB12-34");
    expect(normalizeSerial("")).toBeNull();
  });
  it("finds duplicates", () => {
    expect(duplicateSerials(["A1", null, "B2", "A1", null])).toEqual(["A1"]);
    expect(duplicateSerials(["A1", "B2"])).toEqual([]);
  });
});

describe("isSettingsImagePath", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  it("accepts the app's own paths", () => {
    expect(isSettingsImagePath("gcash-qr", `gcash-qr/${id}.jpg`)).toBe(true);
    expect(isSettingsImagePath("signature", `signature/${id}.png`)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isSettingsImagePath("signature", `signature/${id}.jpg`)).toBe(false);
    expect(isSettingsImagePath("gcash-qr", `signature/${id}.png`)).toBe(false);
    expect(isSettingsImagePath("gcash-qr", `gcash-qr/../${id}.png`)).toBe(false);
    expect(isSettingsImagePath("gcash-qr", `gcash-qr/x.png`)).toBe(false);
  });
});
