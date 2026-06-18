import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dbMock = vi.hoisted(() => ({
  queryResults: [] as unknown[][],
  select: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: dbMock.select,
  },
}));

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(result));
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
});
