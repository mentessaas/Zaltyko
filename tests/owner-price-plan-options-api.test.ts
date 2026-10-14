import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

import { PgDialect } from "drizzle-orm/pg-core";
import { GET } from "@/app/api/v1/owner/price-plans/options/route";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));
vi.mock("@/modules/shared/infrastructure/operational-authorization", () => ({
  assertOperationalAccess: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: vi.fn(() => ({ limit: 20, window: 60 })),
  getVerifiedTenantRateLimitIdentifier: vi.fn(() => "tenant"),
  rateLimit: vi.fn(async () => ({ success: true })),
  rateLimitExceededResponse: vi.fn(),
}));

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const memberId = "10000000-0000-4000-8000-000000000003";
const userId = "10000000-0000-4000-8000-000000000004";
const request = () =>
  new Request(
    `https://zaltyko.test/api/v1/owner/price-plans/options?organizationId=${organizationId}&locationId=${locationId}`
  );

describe("opciones de tarifas y clases con alcance Owner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: userId });
    vi.mocked(resolveOwnerScope).mockResolvedValue({
      organization: { id: organizationId },
      member: { id: memberId },
      selectedLocationId: locationId,
    } as never);
    const builder = {
      from: vi.fn().mockReturnThis(),
      where: mocks.where.mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: mocks.limit,
    };
    mocks.select.mockReturnValue(builder);
    mocks.transaction.mockImplementation((callback) =>
      callback({ select: mocks.select })
    );
    mocks.limit.mockResolvedValue([]);
  });

  it("autentica antes de acceder a opciones", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rechaza una sede fuera de alcance antes de consultar datos", async () => {
    vi.mocked(resolveOwnerScope).mockRejectedValue(
      new OperationalError("LOCATION_SCOPE_DENIED", "Sin acceso", 403)
    );
    expect((await GET(request())).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("comprueba autorización transaccional antes de leer", async () => {
    vi.mocked(assertOperationalAccess).mockRejectedValue(
      new OperationalError("FORBIDDEN", "Sin acceso", 403)
    );
    expect((await GET(request())).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("preserva items y filtra clases por academia, sede y estado activo", async () => {
    const template = {
      id: "10000000-0000-4000-8000-000000000005",
      name: "Actividad sintética",
      effectiveFrom: "2026-10-01",
      effectiveTo: null,
    };
    mocks.limit
      .mockResolvedValueOnce([{ id: "plan-sintetico" }])
      .mockResolvedValueOnce([template]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      data: {
        organizationId,
        locationId,
        items: [{ id: "plan-sintetico" }],
        classTemplates: [template],
        classTemplatesHasMore: false,
      },
    });
    const compiled = new PgDialect().sqlToQuery(mocks.where.mock.calls[1][0]);
    expect(compiled.sql).toContain('"class_templates"."organization_id"');
    expect(compiled.sql).toContain('"class_templates"."location_id"');
    expect(compiled.sql).toContain('"class_templates"."status"');
    expect(compiled.params).toEqual([organizationId, locationId, "active"]);
    expect(assertOperationalAccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId,
        locationId,
        actor: { userId, memberId },
      })
    );
  });

  it("explicita el truncado sin convertir un catálogo parcial en completo", async () => {
    mocks.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        Array.from({ length: 101 }, (_, index) => ({
          id: String(index),
          name: "Clase sintética",
          effectiveFrom: "2026-10-01",
          effectiveTo: null,
        }))
      );
    const response = await GET(request());
    const payload = await response.json();
    expect(payload.data.classTemplates).toHaveLength(100);
    expect(payload.data.classTemplatesHasMore).toBe(true);
    expect(mocks.limit).toHaveBeenNthCalledWith(2, 101);
  });
});
