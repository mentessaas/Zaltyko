import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("membership unlink notification", () => {
  it("uses the verified academy tenant instead of a stale profile tenant", () => {
    const source = readFileSync("src/app/api/academy-memberships/[membershipId]/route.ts", "utf8");
    expect(source).toContain("tenantId: membership.academyTenantId");
    expect(source).not.toContain("tenantId: membership.profileTenantId,");
  });
});
