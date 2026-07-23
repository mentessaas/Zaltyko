import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: {
    id: "profile-1",
    userId: "user-1",
    tenantId: "tenant-a",
    activeAcademyId: "academy-a",
    role: "coach",
    canLogin: true,
  } as Record<string, unknown>,
  permission: "athletes:read" as string | null,
  effectivePermissions: {
    permissions: [] as string[],
    roleId: null as string | null,
    roleName: null as string | null,
    isOwner: false,
    source: "baseline",
  },
  getTenantId: vi.fn(),
  getUserPermissions: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/authz/user-resolver", () => ({
  resolveUserId: vi.fn().mockResolvedValue("user-1"),
}));
vi.mock("@/lib/authz/profile-service", () => ({
  getCurrentProfile: vi.fn(async () => ({ ...mocks.profile })),
}));
vi.mock("@/lib/authz/tenant-resolver", () => ({
  getTenantId: mocks.getTenantId,
  resolveTenantWithUpdate: vi.fn().mockResolvedValue({
    tenantId: null,
    shouldUpdateProfile: false,
  }),
}));
vi.mock("@/lib/authz/profile-updater", () => ({
  updateProfileIfNeeded: vi.fn(),
}));
vi.mock("@/lib/authz/route-permissions", () => ({
  getRequiredRoutePermission: vi.fn(() => mocks.permission),
}));
vi.mock("@/lib/authz/permissions-service", () => ({
  getUserPermissions: mocks.getUserPermissions,
}));
vi.mock("@/lib/supabase/bearer-client", () => ({
  getBearerToken: vi.fn(() => "verified-bearer-token"),
  createBearerSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
  })),
}));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: vi.fn(() => ({ limit: 100, window: 60 })),
  getVerifiedTenantRateLimitIdentifier: vi.fn(() => "tenant-key"),
  rateLimit: vi.fn().mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { withBearerTenant, withTenant } from "@/lib/authz";

const handler = vi.fn(async () => new Response("ok", { status: 200 }));

function request(academyId = "academy-a", method = "GET") {
  return new Request(`http://localhost/api/athletes?academyId=${academyId}`, {
    method,
  });
}

describe("withTenant permission enforcement", () => {
  beforeEach(() => {
    handler.mockClear();
    mocks.permission = "athletes:read";
    Object.assign(mocks.profile, {
      id: "profile-1",
      userId: "user-1",
      tenantId: "tenant-a",
      activeAcademyId: "academy-a",
      role: "coach",
      canLogin: true,
    });
    Object.assign(mocks.effectivePermissions, {
      permissions: [],
      roleId: null,
      roleName: null,
      isOwner: false,
      source: "baseline",
    });
    mocks.getTenantId.mockReset();
    mocks.getTenantId.mockImplementation(async (_userId, academyId) =>
      academyId === "academy-b" ? null : "tenant-a"
    );
    mocks.getUserPermissions.mockReset();
    mocks.getUserPermissions.mockImplementation(async () => ({
      ...mocks.effectivePermissions,
      permissions: [...mocks.effectivePermissions.permissions],
    }));
  });

  it("allows the real academy owner in their academy", async () => {
    Object.assign(mocks.profile, { role: "owner" });
    Object.assign(mocks.effectivePermissions, { isOwner: true, source: "owner" });

    const response = await withTenant(handler)(request("academy-a"), {});
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("denies an owner of academy A in academy B", async () => {
    Object.assign(mocks.profile, { role: "owner" });

    const response = await withTenant(handler)(request("academy-b"), {});
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "ACADEMY_ACCESS_DENIED" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("denies baseline users when required permission is absent even with roleId null", async () => {
    mocks.permission = "billing:read";

    const response = await withTenant(handler)(request(), {});
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "PERMISSION_DENIED",
      permission: "billing:read",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(["parent", "athlete"])(
    "denies a %s viewer in an administrative API",
    async (role) => {
      Object.assign(mocks.profile, { role });
      mocks.permission = "settings:users";

      const response = await withTenant(handler)(request(), {});
      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    }
  );

  it("allows an active custom role with the required permission", async () => {
    Object.assign(mocks.effectivePermissions, {
      roleId: "role-1",
      source: "custom",
      permissions: ["athletes:read"],
    });

    const response = await withTenant(handler)(request(), {});
    expect(response.status).toBe(200);
  });

  it.each(["custom", "expired_assignment", "inactive_role"])(
    "denies a %s permission result without the capability",
    async (source) => {
      Object.assign(mocks.effectivePermissions, {
        roleId: "role-1",
        source: source === "custom" ? "custom" : "denied",
        permissions: [],
      });

      const response = await withTenant(handler)(request(), {});
      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    }
  );

  it("keeps the explicit verified super-admin exception", async () => {
    Object.assign(mocks.profile, {
      role: "super_admin",
      tenantId: null,
      activeAcademyId: null,
    });
    mocks.getTenantId.mockResolvedValue(null);

    const response = await withTenant(handler)(request("academy-b"), {});
    expect(response.status).toBe(200);
    expect(mocks.getUserPermissions).not.toHaveBeenCalled();
  });

  it("never lets client tenantId expand access to a foreign academy", async () => {
    const response = await withTenant(handler)(
      new Request(
        "http://localhost/api/athletes?academyId=academy-b&tenantId=tenant-a"
      ),
      {}
    );

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("applies the same deny-by-default capability gate to verified bearer sessions", async () => {
    mocks.permission = "billing:read";
    Object.assign(mocks.profile, { role: "parent" });

    const response = await withBearerTenant(handler)(request(), {});

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "PERMISSION_DENIED",
      permission: "billing:read",
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
