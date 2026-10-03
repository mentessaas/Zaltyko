import { describe, expect, it } from "vitest";

import { classifyRouteAuth } from "../scripts/lib/route-auth-classifier";

describe("route auth classification", () => {
  it("keeps method-specific public and session contracts separate", () => {
    const source = `/** @route-auth GET public\n * @route-auth POST session */`;
    expect(classifyRouteAuth("src/app/api/marketplace/route.ts", source, "GET")).toBe("public");
    expect(classifyRouteAuth("src/app/api/marketplace/route.ts", source, "POST")).toBe("session");
  });

  it("accepts a custom guard only when its reason is present", () => {
    expect(
      classifyRouteAuth(
        "src/app/api/directory/claims/route.ts",
        "// @auth-flexible route-guard-reason: verified user and per-entry validation",
        "POST"
      )
    ).toBe("custom");
    expect(
      classifyRouteAuth(
        "src/app/api/directory/claims/route.ts",
        "// @auth-flexible route-guard-reason:",
        "POST"
      )
    ).toBe("unknown");
  });

  it("recognizes the current-user session helper and standard tenant wrapper", () => {
    expect(classifyRouteAuth("src/app/api/actor-pages/route.ts", "await getCurrentUser()", "POST")).toBe("session");
    expect(classifyRouteAuth("src/app/api/athletes/route.ts", "const handler = withTenant(", "POST")).toBe("tenant");
  });

  it("leaves a mutating route unknown when it has no auth contract", () => {
    expect(classifyRouteAuth("src/app/api/unknown/route.ts", "export async function POST() {}", "POST")).toBe("unknown");
  });
});
