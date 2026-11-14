import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  rateLimit: vi.fn(),
  resolveOwnerScope: vi.fn(),
  getCalendar: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.currentUser,
}));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 60, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: (
    _request: Request,
    organizationId: string
  ) => `verified:${organizationId}`,
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: () =>
    new Response(JSON.stringify({ ok: false }), { status: 429 }),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.resolveOwnerScope,
}));
vi.mock("@/modules/scheduling/application/calendar-sessions", () => ({
  getOwnerCalendar: mocks.getCalendar,
}));

import { GET } from "@/app/api/v1/owner/calendar/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const groupId = "30000000-0000-4000-8000-000000000003";
const userId = "50000000-0000-4000-8000-000000000005";
const memberId = "60000000-0000-4000-8000-000000000006";
const range = "from=2026-11-09&to=2026-11-15";

function request(query: string) {
  return new Request(`https://example.invalid/api/v1/owner/calendar?${query}`);
}

const scope = {
  organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
  member: { id: memberId, role: "owner", locationScopeMode: "all" },
  locations: [{ id: locationId, name: "Main", timezone: "Europe/Madrid" }],
  selectedLocationId: null,
  canViewOrganizationAggregate: true,
};

const calendar = {
  range: { from: "2026-11-09", to: "2026-11-15" },
  sessions: [],
  truncated: false,
  locations: [{ id: locationId, name: "Main", timezone: "Europe/Madrid" }],
  groups: [],
  coachesAvailable: false,
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.resolveOwnerScope.mockResolvedValue(scope);
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.getCalendar.mockResolvedValue(calendar);
});

describe("GET /api/v1/owner/calendar", () => {
  it("exige una persona verificada antes de validar la consulta", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await GET(request("organizationId=bad"));

    expect(response.status).toBe(401);
    expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
    expect(mocks.getCalendar).not.toHaveBeenCalled();
  });

  it.each([
    ["sin rango", `organizationId=${organizationId}`],
    ["academia inválida", `organizationId=bad&${range}`],
    ["fecha imposible", `organizationId=${organizationId}&from=2026-02-30&to=2026-03-02`],
    ["fin anterior al inicio", `organizationId=${organizationId}&from=2026-11-15&to=2026-11-09`],
    ["más de 42 días", `organizationId=${organizationId}&from=2026-10-01&to=2026-12-31`],
    ["clave desconocida", `organizationId=${organizationId}&${range}&limit=500`],
    ["sede inválida", `organizationId=${organizationId}&${range}&locationId=x`],
    ["grupo inválido", `organizationId=${organizationId}&${range}&groupId=x`],
  ])("rechaza %s antes de resolver el alcance ni leer sesiones", async (_label, query) => {
    const response = await GET(request(query));

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
    expect(mocks.getCalendar).not.toHaveBeenCalled();
  });

  it("resuelve el alcance de gestión, limita al tenant verificado y devuelve privado y sin caché", async () => {
    const response = await GET(
      request(`organizationId=${organizationId}&${range}&locationId=${locationId}&groupId=${groupId}`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    // Superficie de gestión: sin «coach_operations», así que el coach no entra.
    expect(mocks.resolveOwnerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
    });
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: `verified:${organizationId}` })
    );
    expect(mocks.getCalendar).toHaveBeenCalledWith({
      scope,
      from: "2026-11-09",
      to: "2026-11-15",
      locationId,
      groupId,
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { range: { from: "2026-11-09", to: "2026-11-15" }, sessions: [], truncated: false },
    });
  });

  it("sin sede lee todas las del alcance resuelto (no hay filtro de sede)", async () => {
    const response = await GET(request(`organizationId=${organizationId}&${range}`));

    expect(response.status).toBe(200);
    expect(mocks.resolveOwnerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId: undefined,
    });
    expect(mocks.getCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ scope, locationId: undefined, groupId: undefined })
    );
  });

  it.each([
    ["sede fuera del alcance", new OperationalError("LOCATION_SCOPE_DENIED", "Sede fuera de alcance", 403)],
    ["sin acceso a la superficie", new OperationalError("FORBIDDEN", "Sin acceso a la superficie Owner", 403)],
  ])("%s: 403 sin leer sesiones ni gastar cuota", async (_label, error) => {
    mocks.resolveOwnerScope.mockRejectedValueOnce(error);

    const response = await GET(
      request(`organizationId=${organizationId}&${range}&locationId=${locationId}`)
    );

    expect(response.status).toBe(403);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.getCalendar).not.toHaveBeenCalled();
  });

  it("corta antes de leer filas cuando el tenant supera su cuota", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });

    const response = await GET(request(`organizationId=${organizationId}&${range}`));

    expect(response.status).toBe(429);
    expect(mocks.getCalendar).not.toHaveBeenCalled();
  });

  it("traduce los errores operativos del servicio a problemas HTTP", async () => {
    mocks.getCalendar.mockRejectedValueOnce(
      new OperationalError("NOT_FOUND", "Recurso no encontrado", 404)
    );

    const response = await GET(request(`organizationId=${organizationId}&${range}`));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
