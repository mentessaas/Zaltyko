import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  rateLimit: vi.fn(),
  resolveOwnerScope: vi.fn(),
  getToday: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 30, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: (_request: Request, organizationId: string) =>
    `verified:${organizationId}`,
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: () => new Response(JSON.stringify({ ok: false }), { status: 429 }),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.resolveOwnerScope,
}));
vi.mock("@/modules/attendance/application/owner-today-attendance", () => ({
  getOwnerTodayAttendance: mocks.getToday,
}));

import { GET } from "@/app/api/v1/owner/attendance/today/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const userId = "50000000-0000-4000-8000-000000000005";
const memberId = "60000000-0000-4000-8000-000000000006";

const request = (query: string) =>
  new Request(`https://example.invalid/api/v1/owner/attendance/today?${query}`);

const scope = (role: string) => ({
  organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
  member: { id: memberId, role, locationScopeMode: role === "coach" ? "selected" : "all" },
  locations: [{ id: locationId, name: "Main", timezone: "Europe/Madrid" }],
  selectedLocationId: locationId,
  canViewOrganizationAggregate: role !== "coach",
});

const snapshot = {
  source: "owner",
  academyId: organizationId,
  academyName: "QA",
  userId,
  date: "2026-11-15",
  generatedAt: "2026-11-15T08:00:00.000Z",
  sessions: [],
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.resolveOwnerScope.mockResolvedValue(scope("owner"));
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.getToday.mockResolvedValue(snapshot);
});

describe("GET /api/v1/owner/attendance/today", () => {
  it("exige una persona verificada antes de validar la consulta", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const response = await GET(request("organizationId=no-es-un-uuid"));
    expect(response.status).toBe(401);
    expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
  });

  it.each(["", "organizationId=abc", `organizationId=${organizationId}&extra=1`])(
    "rechaza una consulta inválida (%s)",
    async (query) => {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
      expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
      expect(mocks.getToday).not.toHaveBeenCalled();
    }
  );

  it("la dirección recibe la lista de hoy de su academia, sin caché", async () => {
    const response = await GET(request(`organizationId=${organizationId}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, data: snapshot });
    expect(mocks.resolveOwnerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
      surface: "coach_operations",
    });
    expect(mocks.getToday).toHaveBeenCalledWith({ userId, scope: scope("owner") });
  });

  it("una entrenadora usa su alcance de sedes (la consulta recibe su scope, no todas las sedes)", async () => {
    mocks.resolveOwnerScope.mockResolvedValue(scope("coach"));
    const response = await GET(request(`organizationId=${organizationId}`));
    expect(response.status).toBe(200);
    const call = mocks.getToday.mock.calls[0][0];
    expect(call.scope.member.role).toBe("coach");
    expect(call.scope.canViewOrganizationAggregate).toBe(false);
  });

  it("una academia ajena responde 404, igual que una que no existe, y no lee nada", async () => {
    mocks.resolveOwnerScope.mockRejectedValue(
      new OperationalError("FORBIDDEN", "Sin acceso a esta zona de la dirección", 403)
    );
    const response = await GET(request(`organizationId=${organizationId}`));
    expect(response.status).toBe(404);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.getToday).not.toHaveBeenCalled();
  });

  it("una entrenadora sin sedes asignadas recibe 403 y no se guarda nada", async () => {
    mocks.resolveOwnerScope.mockRejectedValue(
      new OperationalError("LOCATION_SCOPE_DENIED", "Sin sedes asignadas", 403)
    );
    const response = await GET(request(`organizationId=${organizationId}`));
    expect(response.status).toBe(403);
    expect(mocks.getToday).not.toHaveBeenCalled();
  });

  it("aplica el límite por academia antes de leer", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    const response = await GET(request(`organizationId=${organizationId}`));
    expect(response.status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: `verified:${organizationId}`, limit: 30 })
    );
    expect(mocks.getToday).not.toHaveBeenCalled();
  });
});
