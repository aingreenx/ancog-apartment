import { describe, expect, it } from "vitest";
import { homeFor, redirectAfterLogin, toLoginEmail } from "./login-id";

describe("toLoginEmail", () => {
  it("maps a tenant username to the internal email", () => {
    expect(toLoginEmail("room3-frannie-4612")).toBe("room3-frannie-4612@tenants.ancog.local");
  });

  it("ignores case and surrounding spaces", () => {
    expect(toLoginEmail("  Room3-Frannie-4612 ")).toBe("room3-frannie-4612@tenants.ancog.local");
  });

  it("passes admin emails through", () => {
    expect(toLoginEmail("Admin1@Ancog.local")).toBe("admin1@ancog.local");
  });

  it("rejects junk", () => {
    expect(toLoginEmail("")).toBeNull();
    expect(toLoginEmail("a b")).toBeNull();
    expect(toLoginEmail("not@an")).toBeNull();
    expect(toLoginEmail("-room3")).toBeNull();
  });
});

describe("redirectAfterLogin", () => {
  it("sends each role home", () => {
    expect(homeFor("admin")).toBe("/admin");
    expect(redirectAfterLogin("tenant")).toBe("/portal");
  });

  it("honours next only inside the user's own area", () => {
    expect(redirectAfterLogin("admin", "/admin/rates")).toBe("/admin/rates");
    expect(redirectAfterLogin("tenant", "/admin")).toBe("/portal");
    expect(redirectAfterLogin("tenant", "//evil.example/portal")).toBe("/portal");
    expect(redirectAfterLogin("tenant", "https://evil.example")).toBe("/portal");
  });
});
