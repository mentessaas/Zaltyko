import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dbMock = vi.hoisted(() => ({
  queryResults: [] as unknown[][],
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: dbMock.select,
    update: dbMock.update,
    delete: dbMock.delete,
  },
}));

const adminLogsMock = vi.hoisted(() => ({
  logAdminAction: vi.fn(),
}));

vi.mock("@/lib/admin-logs", () => ({
  logAdminAction: adminLogsMock.logAdminAction,
}));

vi.mock("@/lib/authz", () => ({
  withSuperAdmin: (handler: unknown) => handler,
}));

vi.mock("@/lib/supabase/admin-operations", () => ({
  getAuthUserEmail: vi.fn(() => Promise.resolve("test-zaltyko@example.com")),
  updateAuthUserEmail: vi.fn(() => Promise.resolve()),
}));

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(result));
  return chain;
}

function makeMutationChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve(result));
  return chain;
}

async function loadDevModule(env: Record<string, string | undefined>) {
  vi.resetModules();
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_ENABLE_DEV_SESSION: process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION,
    NEXT_PUBLIC_USE_MOCK_AUTH: process.env.NEXT_PUBLIC_USE_MOCK_AUTH,
  };

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const mod = await import("@/lib/dev");

  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return mod;
}

describe("audit hardening", () => {
  beforeEach(() => {
    dbMock.queryResults = [];
    dbMock.select.mockImplementation(() => makeSelectChain(dbMock.queryResults.shift() ?? []));
    dbMock.update.mockImplementation(() => makeMutationChain([]));
    dbMock.delete.mockImplementation(() => makeMutationChain([]));
    adminLogsMock.logAdminAction.mockResolvedValue(undefined);
  });

  describe("requireCronAuth", () => {
    const previousSecret = process.env.CRON_SECRET;

    beforeEach(() => {
      if (previousSecret === undefined) {
        delete process.env.CRON_SECRET;
      } else {
        process.env.CRON_SECRET = previousSecret;
      }
    });

    it("fails closed when CRON_SECRET is missing", async () => {
      delete process.env.CRON_SECRET;
      const { requireCronAuth } = await import("@/lib/cron-auth");

      const response = requireCronAuth(new Request("http://localhost/api/cron/test"));

      expect(response?.status).toBe(503);
      await expect(response?.json()).resolves.toMatchObject({
        ok: false,
        error: "CRON_NOT_CONFIGURED",
      });
    });

    it("rejects an invalid cron bearer token", async () => {
      process.env.CRON_SECRET = "expected-secret";
      const { requireCronAuth } = await import("@/lib/cron-auth");

      const response = requireCronAuth(
        new Request("http://localhost/api/cron/test", {
          headers: { authorization: "Bearer wrong-secret" },
        })
      );

      expect(response?.status).toBe(401);
      await expect(response?.json()).resolves.toMatchObject({
        ok: false,
        error: "UNAUTHORIZED",
      });
    });

    it("allows a matching cron bearer token", async () => {
      process.env.CRON_SECRET = "expected-secret";
      const { requireCronAuth } = await import("@/lib/cron-auth");

      const response = requireCronAuth(
        new Request("http://localhost/api/cron/test", {
          headers: { authorization: "Bearer expected-secret" },
        })
      );

      expect(response).toBeNull();
    });
  });

  describe("dev session flags", () => {
    it("keeps dev session disabled in production even with public flags", async () => {
      const { isDevSessionEnabled } = await loadDevModule({
        NODE_ENV: "production",
        NEXT_PUBLIC_ENABLE_DEV_SESSION: "true",
        NEXT_PUBLIC_USE_MOCK_AUTH: "true",
      });

      expect(isDevSessionEnabled).toBe(false);
    });

    it("requires an explicit flag in development", async () => {
      const disabled = await loadDevModule({
        NODE_ENV: "development",
        NEXT_PUBLIC_ENABLE_DEV_SESSION: undefined,
        NEXT_PUBLIC_USE_MOCK_AUTH: undefined,
      });
      const enabled = await loadDevModule({
        NODE_ENV: "development",
        NEXT_PUBLIC_ENABLE_DEV_SESSION: "true",
        NEXT_PUBLIC_USE_MOCK_AUTH: undefined,
      });

      expect(disabled.isDevSessionEnabled).toBe(false);
      expect(enabled.isDevSessionEnabled).toBe(true);
    });
  });

  describe("verifyAcademyAccessForProfile", () => {
    it("rejects an academy outside the current tenant", async () => {
      dbMock.queryResults = [[]];
      const { verifyAcademyAccessForProfile } = await import("@/lib/permissions");

      const result = await verifyAcademyAccessForProfile({
        academyId: "academy-other",
        tenantId: "tenant-a",
        profile: { id: "profile-1", userId: "user-1", role: "coach", tenantId: "tenant-a" },
      });

      expect(result).toEqual({
        allowed: false,
        reason: "ACADEMY_NOT_FOUND_OR_ACCESS_DENIED",
      });
    });

    it("allows a valid non-viewer academy membership", async () => {
      dbMock.queryResults = [
        [{ id: "academy-1", tenantId: "tenant-a", ownerId: "owner-profile" }],
        [{ role: "coach" }],
      ];
      const { verifyAcademyAccessForProfile } = await import("@/lib/permissions");

      const result = await verifyAcademyAccessForProfile({
        academyId: "academy-1",
        tenantId: "tenant-a",
        profile: { id: "profile-1", userId: "user-1", role: "coach", tenantId: "tenant-a" },
      });

      expect(result).toEqual({ allowed: true });
    });

    it("allows super admins without membership", async () => {
      dbMock.queryResults = [[{ id: "academy-1", tenantId: "tenant-a", ownerId: "owner-profile" }]];
      const { verifyAcademyAccessForProfile } = await import("@/lib/permissions");

      const result = await verifyAcademyAccessForProfile({
        academyId: "academy-1",
        tenantId: "tenant-a",
        profile: { id: "profile-1", userId: "user-1", role: "super_admin", tenantId: "tenant-b" },
      });

      expect(result).toEqual({ allowed: true });
    });
  });

  describe("super-admin middleware hardening", () => {
    it("does not trust user_metadata role claims", () => {
      const middlewarePath = fileURLToPath(new URL("../middleware.ts", import.meta.url));
      const source = readFileSync(middlewarePath, "utf8");

      expect(source).not.toContain("user_metadata");
      expect(source).toContain("app_metadata");
    });
  });

  describe("class waiting list tenancy", () => {
    it("keeps the schema tenant-scoped", () => {
      const schemaPath = fileURLToPath(new URL("../src/db/schema/class-waiting-list.ts", import.meta.url));
      const source = readFileSync(schemaPath, "utf8");

      expect(source).toContain("tenantId");
      expect(source).toContain('uuid("tenant_id").notNull()');
      expect(source).toContain("academyId");
    });

    it("filters list and delete operations by tenant", () => {
      const routePath = fileURLToPath(new URL("../src/app/api/class-waiting-list/route.ts", import.meta.url));
      const deletePath = fileURLToPath(new URL("../src/app/api/class-waiting-list/[entryId]/route.ts", import.meta.url));
      const routeSource = readFileSync(routePath, "utf8");
      const deleteSource = readFileSync(deletePath, "utf8");

      expect(routeSource).toContain("eq(classWaitingList.tenantId, context.tenantId)");
      expect(deleteSource).toContain("eq(classWaitingList.tenantId, context.tenantId)");
    });
  });

  describe("profile check-limits", () => {
    it("keeps GET side-effect free and does not send email directly", () => {
      const routePath = fileURLToPath(new URL("../src/app/api/profile/check-limits/route.ts", import.meta.url));
      const source = readFileSync(routePath, "utf8");

      expect(source).not.toContain("sendEmail");
      expect(source).not.toContain("@/lib/email");
      expect(source).toContain("checkPlanLimitViolations");
    });
  });

  describe("super-admin API hardening", () => {
    it("blocks hard delete for academies", async () => {
      vi.resetModules();
      dbMock.delete.mockImplementation(() => {
        throw new Error("db.delete should not be called for academy hard delete");
      });
      const { DELETE } = await import("@/app/api/super-admin/academies/[academyId]/route");

      const response = await DELETE(new Request("http://localhost/api/super-admin/academies/academy-1"), {
        params: { academyId: "academy-1" },
        userId: "super-admin-user",
      });

      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error: "ACADEMY_DELETE_DISABLED",
      });
      expect(response.status).toBe(405);
      expect(dbMock.delete).not.toHaveBeenCalled();
      expect(adminLogsMock.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "super-admin-user",
          action: "academy.delete_blocked",
          meta: { academyId: "academy-1" },
        })
      );
    });

    it("requires explicit backend confirmation before promoting a user to super_admin", async () => {
      vi.resetModules();
      dbMock.queryResults = [[{ id: "profile-1", userId: "user-1", role: "owner", isSuspended: false, name: "TEST ZALTYKO" }]];
      const { PATCH } = await import("@/app/api/super-admin/users/[profileId]/route");

      const response = await PATCH(
        new Request("http://localhost/api/super-admin/users/profile-1", {
          method: "PATCH",
          body: JSON.stringify({ role: "super_admin" }),
        }),
        {
          params: Promise.resolve({ profileId: "profile-1" }),
          profile: { id: "super-profile", role: "super_admin" },
          userId: "super-admin-user",
        }
      );

      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error: "SUPER_ADMIN_PROMOTION_CONFIRMATION_REQUIRED",
      });
      expect(response.status).toBe(400);
      expect(dbMock.update).not.toHaveBeenCalled();
    });

    it("logs role changes with old and new role when promotion is confirmed", async () => {
      vi.resetModules();
      dbMock.queryResults = [[{ id: "profile-1", userId: "user-1", role: "owner", isSuspended: false, name: "TEST ZALTYKO" }]];
      dbMock.update.mockImplementation(() =>
        makeMutationChain([{ id: "profile-1", userId: "user-1", role: "super_admin", isSuspended: false, name: "TEST ZALTYKO" }])
      );
      const { PATCH } = await import("@/app/api/super-admin/users/[profileId]/route");

      const response = await PATCH(
        new Request("http://localhost/api/super-admin/users/profile-1", {
          method: "PATCH",
          body: JSON.stringify({ role: "super_admin", confirmSuperAdminPromotion: true }),
        }),
        {
          params: Promise.resolve({ profileId: "profile-1" }),
          profile: { id: "super-profile", role: "super_admin" },
          userId: "super-admin-user",
        }
      );

      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        data: { role: "super_admin" },
      });
      expect(response.status).toBe(200);
      expect(adminLogsMock.logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "super-admin-user",
          action: "user.role_changed",
          meta: expect.objectContaining({
            profileId: "profile-1",
            oldRole: "owner",
            newRole: "super_admin",
          }),
        })
      );
    });
  });
});
