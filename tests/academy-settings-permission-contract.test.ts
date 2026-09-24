import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("academy settings permission contract", () => {
  it("uses capability checks instead of same-tenant access alone", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/academies/[academyId]/route.ts"), "utf8");
    expect(route).toContain('permission: "settings:write"');
    expect(route).toContain('permission: "settings:read"');
    expect(route).toContain("authorizeAcademyCapability");
  });
});
