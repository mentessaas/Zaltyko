import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getBaselinePermissions,
  grantsRequiredPermission,
} from "@/lib/authz/permission-policy";
import { getRequiredRoutePermission } from "@/lib/authz/route-permissions";
import type { Permission } from "@/db/schema/permissions";

const permissions: Permission[] = [
  "athletes:read",
  "athletes:create",
  "athletes:update",
  "billing:read",
  "classes:schedule",
  "settings:write",
  "communications:read",
  "communications:send",
];

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("API authentication and authorization contracts", () => {
  it("denies administrative capabilities to a baseline viewer", () => {
    expect(
      getBaselinePermissions({
        membershipRole: "viewer",
        profileRole: "admin",
        allPermissions: permissions,
      })
    ).toEqual([]);
  });

  it("grants the coach baseline without billing or settings", () => {
    const grants = getBaselinePermissions({
      membershipRole: "coach",
      profileRole: "coach",
      allPermissions: permissions,
    });
    expect(grants).toContain("athletes:read");
    expect(grants).toContain("classes:schedule");
    expect(grants).not.toContain("billing:read");
    expect(grants).not.toContain("settings:write");
  });

  it.each(["parent", "athlete"] as const)(
    "limits %s to the internal communication portal",
    (profileRole) => {
      expect(
        getBaselinePermissions({
          membershipRole: "viewer",
          profileRole,
          allPermissions: permissions,
        })
      ).toEqual(["communications:read", "communications:send"]);
    }
  );

  it("grants every registered capability to the verified academy owner", () => {
    expect(
      getBaselinePermissions({
        membershipRole: "owner",
        profileRole: "owner",
        allPermissions: permissions,
      })
    ).toEqual(permissions);
  });

  it("denies a required capability when the effective role does not grant it", () => {
    expect(
      grantsRequiredPermission(
        { permissions: ["athletes:read"], isOwner: false },
        "athletes:update"
      )
    ).toBe(false);
  });

  it("allows an explicit active custom-role grant", () => {
    expect(
      grantsRequiredPermission(
        { permissions: ["billing:read"], isOwner: false },
        "billing:read"
      )
    ).toBe(true);
  });

  it("registers method-specific capabilities for sensitive routes", () => {
    expect(getRequiredRoutePermission("/api/athletes", "GET")).toBe("athletes:read");
    expect(getRequiredRoutePermission("/api/athletes", "POST")).toBe("athletes:create");
    expect(getRequiredRoutePermission("/api/charges/abc", "POST")).toBe("billing:create");
  });

  it("validates bearer tokens with Supabase instead of trusting headers", () => {
    const authz = source("src/lib/authz.ts");
    expect(authz).toContain("supabase.auth.getUser(token)");
    expect(authz).not.toMatch(/user_metadata[^\n]*super_admin/);
  });

  it("fails closed when a capability has no academy context", () => {
    const authz = source("src/lib/authz.ts");
    expect(authz).toContain("PERMISSION_CONTEXT_MISSING");
    expect(authz).toContain("PERMISSION_DENIED");
  });

  it("rejects conflicting academy candidates before resolving tenant", () => {
    const authz = source("src/lib/authz.ts");
    expect(authz).toContain("ACADEMY_CONTEXT_CONFLICT");
    expect(authz.indexOf("ACADEMY_CONTEXT_CONFLICT")).toBeLessThan(
      authz.indexOf("let tenantId = await getTenantId")
    );
  });

  it("keeps super-admin authorization tied to the verified profile", () => {
    const authz = source("src/lib/authz.ts");
    expect(authz).toContain('profile.role === "super_admin"');
    expect(authz).not.toMatch(/headers\.get\([^)]*role/i);
  });
});
