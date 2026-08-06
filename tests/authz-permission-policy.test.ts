import { describe, expect, it } from "vitest";

import {
  getBaselinePermissions,
  grantsRequiredPermission,
} from "@/lib/authz/permission-policy";
import { getAllPermissions } from "@/lib/authz/permissions-service";

describe("academy permission policy", () => {
  const allPermissions = getAllPermissions();

  it("gives a baseline coach only the explicitly supported operational capabilities", () => {
    const permissions = getBaselinePermissions({
      membershipRole: "coach",
      profileRole: "coach",
      allPermissions,
    });

    expect(permissions).toEqual(
      expect.arrayContaining([
        "athletes:read",
        "athletes:update",
        "classes:read",
        "classes:schedule",
        "reports:read",
        "events:read",
        "communications:read",
        "communications:send",
      ])
    );
    expect(permissions).not.toContain("athletes:delete");
    expect(permissions).not.toContain("billing:read");
    expect(permissions).not.toContain("settings:users");
  });

  it.each(["parent", "athlete"])(
    "keeps a %s viewer limited to portal communication",
    (profileRole) => {
      const permissions = getBaselinePermissions({
        membershipRole: "viewer",
        profileRole,
        allPermissions,
      });

      expect(permissions).toEqual([
        "communications:read",
        "communications:send",
      ]);
      expect(permissions).not.toContain("athletes:read");
      expect(permissions).not.toContain("billing:read");
      expect(permissions).not.toContain("settings:read");
    }
  );

  it("denies a generic viewer every registered academy capability", () => {
    expect(
      getBaselinePermissions({
        membershipRole: "viewer",
        profileRole: "coach",
        allPermissions,
      })
    ).toEqual([]);
  });

  it("does not require roleId to deny a missing permission", () => {
    expect(
      grantsRequiredPermission(
        { isOwner: false, permissions: [] },
        "athletes:delete"
      )
    ).toBe(false);
    expect(
      grantsRequiredPermission(
        { isOwner: false, permissions: ["athletes:read"] },
        "athletes:read"
      )
    ).toBe(true);
  });
});
