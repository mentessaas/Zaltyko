import { describe, expect, it } from "vitest";

import { getBaselinePermissions } from "@/lib/authz/permission-policy";
import type { Permission } from "@/db/schema/permissions";

const allPermissions: Permission[] = ["billing:read", "settings:users"];

function baseline(role: "owner" | "coach" | "viewer" | "unknown") {
  return getBaselinePermissions({
    membershipRole: role === "unknown" ? "viewer" : role,
    profileRole: role,
    allPermissions,
  });
}

describe("academy baseline permissions", () => {
  it("gives coaches only the operational baseline", () => {
    const permissions = baseline("coach");

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
    expect(baseline("viewer")).toEqual([]);
    expect(baseline("unknown")).toEqual([]);
  });

  it("keeps owner capability expansion explicit", () => {
    expect(baseline("owner")).toContain("billing:read");
    expect(baseline("owner")).toContain("settings:users");
  });
});
