import { describe, expect, it } from "vitest";

import { getAllPermissions, getBaselinePermissions } from "@/lib/authz/permissions-service";

describe("academy baseline permissions", () => {
  it("gives coaches only the operational baseline", () => {
    const permissions = getBaselinePermissions("coach");

    expect(permissions).toEqual([
      "athletes:read",
      "athletes:update",
      "classes:read",
      "classes:schedule",
      "reports:read",
      "events:read",
      "communications:read",
      "communications:send",
    ]);
    expect(permissions).not.toContain("billing:read");
    expect(permissions).not.toContain("settings:write");
  });

  it("fails closed for viewer and unknown roles", () => {
    expect(getBaselinePermissions("viewer")).toEqual([]);
    expect(getBaselinePermissions("unknown")).toEqual([]);
  });

  it("keeps owner capability expansion explicit", () => {
    const ownerPermissions = getBaselinePermissions("owner") ?? getAllPermissions();

    expect(ownerPermissions).toContain("billing:read");
    expect(ownerPermissions).toContain("settings:users");
  });
});
