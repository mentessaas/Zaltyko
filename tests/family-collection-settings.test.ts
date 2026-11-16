import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático (Fase 3, P2): «Día de cobro» de la academia. Servicio con
 * base simulada y ruta con el servicio simulado.
 */

const { tx } = vi.hoisted(() => ({ tx: { kind: "tx" } }));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)) },
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: vi.fn(),
}));
vi.mock("@/modules/family-collection/application/config", () => ({
  isFamilyAutomaticCollectionFlagEnabled: vi.fn(),
  resolveConnectEnvironment: vi.fn(),
  isProductionDatabase: vi.fn(),
}));
vi.mock("@/modules/family-collection/application/storage", () => ({
  isFamilyCollectionStorageAvailable: vi.fn(),
}));
vi.mock("@/modules/family-collection/infrastructure/collection-settings-store", () => ({
  findCollectionSettings: vi.fn(),
  lockCollectionSettings: vi.fn(),
  insertCollectionSettings: vi.fn(),
  updateCollectionSettings: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));
vi.mock("@/modules/saas-billing/application/organization-usage", () => ({
  assertOrganizationOperationalWritable: vi.fn(),
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({
  appendAuditEntry: vi.fn(),
  appendOutboxEvent: vi.fn(),
}));

import { GET, PUT } from "@/app/api/v1/owner/payments/collection-settings/route";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getLimitForRoute, rateLimit } from "@/lib/rate-limit";
import {
  getCollectionSettings,
  saveCollectionSettings,
} from "@/modules/family-collection/application/collection-settings-service";
import {
  isFamilyAutomaticCollectionFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import {
  findCollectionSettings,
  insertCollectionSettings,
  lockCollectionSettings,
  updateCollectionSettings,
} from "@/modules/family-collection/infrastructure/collection-settings-store";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { appendAuditEntry } from "@/modules/shared/infrastructure/transactional-records";

const userId = "10000000-0000-4000-8000-000000000101";
const organizationId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000201";
const origin = "https://zaltyko.test";
const url = `${origin}/api/v1/owner/payments/collection-settings`;
const now = new Date("2026-11-17T10:00:00.000Z");

function ownerScope(overrides: Partial<OwnerScope["member"]> = {}, aggregate = true): OwnerScope {
  return {
    organization: { id: organizationId, name: "Club Sintético", defaultCurrency: "EUR" },
    member: { id: memberId, role: "owner", locationScopeMode: "all", ...overrides },
    locations: [],
    selectedLocationId: null,
    canViewOrganizationAggregate: aggregate,
  };
}

function stored(day: number | null, version: number) {
  return { organizationId, collectionDayOfMonth: day, version, updatedAt: now };
}

function put(body: unknown, requestOrigin: string | null = origin) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (requestOrigin !== null) headers.origin = requestOrigin;
  return new Request(url, { method: "PUT", headers, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isFamilyAutomaticCollectionFlagEnabled).mockReturnValue(true);
  vi.mocked(resolveConnectEnvironment).mockReturnValue("test");
  vi.mocked(isProductionDatabase).mockReturnValue(false);
  vi.mocked(isFamilyCollectionStorageAvailable).mockResolvedValue(true);
  vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope());
  vi.mocked(getCurrentUser).mockResolvedValue({ id: userId } as never);
  vi.mocked(rateLimit).mockResolvedValue({
    success: true,
    limit: 20,
    remaining: 19,
    reset: Math.floor(Date.now() / 1000) + 60,
  });
});

describe("servicio del día de cobro", () => {
  it("sin ajuste guardado se cobra el día de vencimiento (versión 0)", async () => {
    vi.mocked(findCollectionSettings).mockResolvedValue(null);
    await expect(getCollectionSettings({ userId, organizationId })).resolves.toEqual({
      collectionDayOfMonth: null,
      version: 0,
      isDefault: true,
    });
  });

  it("con la bandera apagada no está disponible y no lee la tabla", async () => {
    vi.mocked(isFamilyAutomaticCollectionFlagEnabled).mockReturnValue(false);
    await expect(getCollectionSettings({ userId, organizationId })).rejects.toMatchObject({
      code: "FAMILY_AUTOMATIC_COLLECTION_DISABLED",
      status: 409,
    });
    expect(isFamilyCollectionStorageAvailable).not.toHaveBeenCalled();
    expect(findCollectionSettings).not.toHaveBeenCalled();
  });

  it("sin la tabla del candidato responde 503", async () => {
    vi.mocked(isFamilyCollectionStorageAvailable).mockResolvedValue(false);
    await expect(getCollectionSettings({ userId, organizationId })).rejects.toMatchObject({
      code: "FEATURE_NOT_AVAILABLE",
      status: 503,
    });
  });

  it.each([
    ["una entrenadora", ownerScope({ role: "coach" })],
    ["una gestora", ownerScope({ role: "manager" })],
    ["una administración sin todas las sedes", ownerScope({ role: "admin" }, false)],
  ])("%s no puede cambiarlo", async (_label, scope) => {
    vi.mocked(resolveOwnerScope).mockResolvedValue(scope);
    await expect(
      saveCollectionSettings({ userId, organizationId, collectionDayOfMonth: 5, expectedVersion: 0, now })
    ).rejects.toMatchObject({ status: 403 });
    expect(lockCollectionSettings).not.toHaveBeenCalled();
  });

  it("guarda por primera vez un día fijo, con auditoría", async () => {
    vi.mocked(lockCollectionSettings).mockResolvedValue(null);
    vi.mocked(insertCollectionSettings).mockResolvedValue(stored(31, 1));

    await expect(
      saveCollectionSettings({ userId, organizationId, collectionDayOfMonth: 31, expectedVersion: 0, now })
    ).resolves.toEqual({ collectionDayOfMonth: 31, version: 1, isDefault: false });
    expect(insertCollectionSettings).toHaveBeenCalledWith(tx, {
      organizationId,
      collectionDayOfMonth: 31,
      memberId,
      now,
    });
    expect(appendAuditEntry).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "family_collection.settings_changed",
        actorUserId: userId,
        before: { collectionDayOfMonth: null, version: 0 },
        after: { collectionDayOfMonth: 31, version: 1 },
        idempotencyKey: `family-collection-settings:${organizationId}:1`,
      })
    );
  });

  it("vuelve al día de vencimiento con la versión esperada", async () => {
    vi.mocked(lockCollectionSettings).mockResolvedValue(stored(10, 3));
    vi.mocked(updateCollectionSettings).mockResolvedValue(stored(null, 4));

    await expect(
      saveCollectionSettings({ userId, organizationId, collectionDayOfMonth: null, expectedVersion: 3, now })
    ).resolves.toEqual({ collectionDayOfMonth: null, version: 4, isDefault: false });
    expect(updateCollectionSettings).toHaveBeenCalledWith(tx, {
      organizationId,
      collectionDayOfMonth: null,
      expectedVersion: 3,
      memberId,
      now,
    });
  });

  it("con otra versión responde 409 VERSION_CONFLICT sin escribir", async () => {
    vi.mocked(lockCollectionSettings).mockResolvedValue(stored(10, 3));

    await expect(
      saveCollectionSettings({ userId, organizationId, collectionDayOfMonth: 5, expectedVersion: 2, now })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    expect(updateCollectionSettings).not.toHaveBeenCalled();
    expect(appendAuditEntry).not.toHaveBeenCalled();
  });

  it("si otra sesión lo creó a la vez responde 409", async () => {
    vi.mocked(lockCollectionSettings).mockResolvedValue(null);
    vi.mocked(insertCollectionSettings).mockResolvedValue(null);

    await expect(
      saveCollectionSettings({ userId, organizationId, collectionDayOfMonth: 5, expectedVersion: 0, now })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(appendAuditEntry).not.toHaveBeenCalled();
  });

  it("guardar el mismo día no escribe ni audita", async () => {
    vi.mocked(lockCollectionSettings).mockResolvedValue(stored(5, 2));

    await expect(
      saveCollectionSettings({ userId, organizationId, collectionDayOfMonth: 5, expectedVersion: 2, now })
    ).resolves.toEqual({ collectionDayOfMonth: 5, version: 2, isDefault: false });
    expect(updateCollectionSettings).not.toHaveBeenCalled();
    expect(appendAuditEntry).not.toHaveBeenCalled();
  });

  it.each([0, 32, 2.5])("rechaza el día %s", async (day) => {
    await expect(
      saveCollectionSettings({ userId, organizationId, collectionDayOfMonth: day, expectedVersion: 0, now })
    ).rejects.toThrow();
    expect(lockCollectionSettings).not.toHaveBeenCalled();
  });
});

describe("ruta /api/v1/owner/payments/collection-settings", () => {
  it("ROUTE_LIMITS fija 20/min para la ruta", () => {
    expect(getLimitForRoute("/api/v1/owner/payments/collection-settings")).toEqual({ limit: 20, window: 60 });
  });

  it("sin sesión responde 401", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await GET(new Request(`${url}?organizationId=${organizationId}`));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(resolveOwnerScope).not.toHaveBeenCalled();
    expect(findCollectionSettings).not.toHaveBeenCalled();
  });

  it("GET devuelve el ajuste con no-store tras el límite por academia verificada", async () => {
    vi.mocked(findCollectionSettings).mockResolvedValue(stored(15, 2));

    const response = await GET(new Request(`${url}?organizationId=${organizationId}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ collectionDayOfMonth: 15, version: 2, isDefault: false });
    expect(rateLimit).toHaveBeenCalledWith({
      identifier: `/api/v1/owner/payments/collection-settings:tenant:${organizationId}:ip:unknown`,
      limit: 20,
      window: 60,
    });
  });

  it.each([
    ["con un origin ajeno", "https://evil.example"],
    ["sin cabecera origin", null],
  ])("PUT %s responde 403 sin resolver el alcance", async (_label, requestOrigin) => {
    const response = await PUT(put({ organizationId, collectionDayOfMonth: 5, expectedVersion: 0 }, requestOrigin));
    expect(response.status).toBe(403);
    expect(resolveOwnerScope).not.toHaveBeenCalled();
  });

  it.each([
    ["un día 0", { organizationId, collectionDayOfMonth: 0, expectedVersion: 0 }],
    ["un día 32", { organizationId, collectionDayOfMonth: 32, expectedVersion: 0 }],
    ["un campo extra", { organizationId, collectionDayOfMonth: 5, expectedVersion: 0, extra: true }],
    ["sin versión", { organizationId, collectionDayOfMonth: 5 }],
  ])("PUT con %s responde 400", async (_label, body) => {
    const response = await PUT(put(body));
    expect(response.status).toBe(400);
    expect(resolveOwnerScope).not.toHaveBeenCalled();
  });

  it("PUT guarda con la sesión como actor", async () => {
    vi.mocked(lockCollectionSettings).mockResolvedValue(null);
    vi.mocked(insertCollectionSettings).mockResolvedValue(stored(28, 1));

    const response = await PUT(put({ organizationId, collectionDayOfMonth: 28, expectedVersion: 0 }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ collectionDayOfMonth: 28, version: 1, isDefault: false });
    expect(appendAuditEntry).toHaveBeenCalledWith(tx, expect.objectContaining({ actorUserId: userId }));
  });

  it("PUT con la bandera apagada responde 409", async () => {
    vi.mocked(isFamilyAutomaticCollectionFlagEnabled).mockReturnValue(false);

    const response = await PUT(put({ organizationId, collectionDayOfMonth: 28, expectedVersion: 0 }));

    expect(response.status).toBe(409);
    expect(lockCollectionSettings).not.toHaveBeenCalled();
  });

  it("PUT con el límite agotado responde 429", async () => {
    vi.mocked(rateLimit).mockResolvedValue({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 30,
    });

    const response = await PUT(put({ organizationId, collectionDayOfMonth: 28, expectedVersion: 0 }));

    expect(response.status).toBe(429);
    expect(lockCollectionSettings).not.toHaveBeenCalled();
  });
});
