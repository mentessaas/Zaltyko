import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("temporary custom role assignment", () => {
  it("accepts only a future expiration and persists it", () => {
    const route = readFileSync("src/app/api/academies/[academyId]/roles/[roleId]/members/route.ts", "utf8");
    const service = readFileSync("src/lib/authz/permissions-service.ts", "utf8");
    expect(route).toContain("expiresAt: z.coerce.date().nullable().optional()");
    expect(route).toContain("value.expiresAt > new Date()");
    expect(service).toContain("expiresAt: expiresAt ?? null");
  });
});
