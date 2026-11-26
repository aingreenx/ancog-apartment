import { describe, expect, it } from "vitest";
import { generateTempPassword, parseMoveIn, suggestUsername } from "./move-in";

function form(values: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) {
    for (const item of Array.isArray(v) ? v : [v]) f.append(k, item);
  }
  return f;
}

const valid = {
  firstName: "Frannie",
  lastName: "Reyes",
  phone1: "0900 000 4612",
  room: "3",
  startDate: "2026-12-01",
  startingKwh: "9433",
  advance: "2,500",
  deposit: "0",
  username: "room3-frannie-4612",
  password: "mango-4821-orchid",
};

describe("suggestUsername", () => {
  it("is room#-firstname-last4", () => {
    expect(suggestUsername(3, "Frannie Mae", "0917-123-4612")).toBe("room3-frannie-4612");
  });

  it("drops accents and symbols", () => {
    expect(suggestUsername(11, "José", "09171234567")).toBe("room11-jose-4567");
  });

  it("works with missing parts", () => {
    expect(suggestUsername(null, "", "")).toBe("");
  });
});

describe("generateTempPassword", () => {
  it("is word-4digits-word", () => {
    expect(generateTempPassword(() => 7)).toBe("kalamansi-0007-kalamansi");
  });
});

describe("parseMoveIn", () => {
  it("accepts a valid form and converts pesos to centavos", () => {
    const result = parseMoveIn(
      form({ ...valid, occupantName: ["Bea", ""], occupantPhone: ["", ""] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      room: 3,
      startingKwh: 9433,
      advance: 250_000,
      deposit: 0,
      occupants: [{ name: "Bea", phone: "" }],
    });
  });

  it("requires phone 1 and whole kWh", () => {
    const result = parseMoveIn(form({ ...valid, phone1: "", startingKwh: "9433.5" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.phone1).toBeDefined();
    expect(result.errors.startingKwh).toMatch(/Whole kWh/);
  });

  it("rejects bad usernames, short passwords and bad amounts", () => {
    const result = parseMoveIn(
      form({ ...valid, username: "Room 3!", password: "short", advance: "-1", room: "14" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["advance", "password", "room", "username"]);
  });

  it("needs a name for each extra occupant", () => {
    const result = parseMoveIn(form({ ...valid, occupantName: [""], occupantPhone: ["0900"] }));
    expect(result.ok).toBe(false);
  });
});
