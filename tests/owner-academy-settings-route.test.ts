import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 30, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: (_r: Request, id: string) => `verified:${id}`,
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: () => new Response("{}", { status: 429 }),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.ownerScope }));
vi.mock("@/modules/organizations/application/owner-academy-settings", async () => {
  const actual = await vi.importActual<typeof import("@/modules/organizations/application/owner-academy-settings")>(
    "@/modules/organizations/application/owner-academy-settings"
  );
  return {
    ...actual,
    getOwnerAcademySettings: mocks.get,
    updateOwnerAcademyProfile: mocks.update,
    createOwnerLocation: mocks.create,
  };
});

import { GET, PATCH } from "@/app/api/v1/owner/academy-settings/route";
import { POST } from "@/app/api/v1/owner/academy-settings/locations/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000004";
const memberId = "10000000-0000-4000-8000-000000000005";
const origin = "https://sandbox.invalid";
const version = "2026-11-14T09:30:00.123456Z";

function req(method: string, path: string, body?: unknown, headers: Record<string, string | null> = {}) {
  const h: Record<string, string> = { "content-type": "application/json" };
  for (const [k, v] of Object.entries({ origin, "idempotency-key": "settings-key-001", ...headers })) {
    if (v !== null) h[k] = v;
  }
  return new Request(`${origin}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue({
    organization: { id: organizationId, name: "QA" },
    member: { id: memberId, role: "owner", locationScopeMode: "all" },
  });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.get.mockResolvedValue({ organization: { id: organizationId } });
  mocks.update.mockResolvedValue({ id: organizationId, changed: true, replayed: false });
  mocks.create.mockResolvedValue({ id: "loc", replayed: false });
});

describe("GET academy-settings", () => {
  it("rechaza sin sesión antes de resolver el alcance", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const res = await GET(req("GET", `/api/v1/owner/academy-settings?organizationId=${organizationId}`));
    expect(res.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
  });

  it("deriva el actor de la sesión y responde sin caché", async () => {
    const res = await GET(req("GET", `/api/v1/owner/academy-settings?organizationId=${organizationId}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.get).toHaveBeenCalledWith({ organizationId, actor: { userId, memberId } });
  });

  it("rechaza parámetros extra", async () => {
    const res = await GET(req("GET", `/api/v1/owner/academy-settings?organizationId=${organizationId}&x=1`));
    expect(res.status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("traduce un 403 del servicio", async () => {
    mocks.get.mockRejectedValue(new OperationalError("FORBIDDEN", "no", 403));
    expect((await GET(req("GET", `/api/v1/owner/academy-settings?organizationId=${organizationId}`))).status).toBe(403);
  });
});

describe("PATCH academy-settings", () => {
  const body = { organizationId, expectedUpdatedAt: version, name: "Club Nuevo", legalName: null };

  it.each([null, "https://foreign.invalid"])("rechaza origen no fiable %s", async (o) => {
    const res = await PATCH(req("PATCH", "/api/v1/owner/academy-settings", body, { origin: o }));
    expect(res.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("exige idempotencia y rechaza campos de actor o rol", async () => {
    const noKey = await PATCH(req("PATCH", "/api/v1/owner/academy-settings", body, { "idempotency-key": null }));
    const extra = await PATCH(req("PATCH", "/api/v1/owner/academy-settings", { ...body, role: "owner", countryCode: "MX" }));
    expect(noKey.status).toBe(400);
    expect(extra.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("guarda con el actor de la sesión", async () => {
    const res = await PATCH(req("PATCH", "/api/v1/owner/academy-settings", { ...body, name: "  Club   Nuevo " }));
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      ...body,
      idempotencyKey: "settings-key-001",
      actor: { userId, memberId },
    });
  });

  it("propaga el conflicto de versión", async () => {
    mocks.update.mockRejectedValue(new OperationalError("VERSION_CONFLICT", "otro", 409));
    expect((await PATCH(req("PATCH", "/api/v1/owner/academy-settings", body))).status).toBe(409);
  });
});

describe("POST academy-settings/locations", () => {
  const body = { organizationId, name: "Sede Norte", timezone: "Europe/Madrid" };
  const path = "/api/v1/owner/academy-settings/locations";

  it("rechaza origen no fiable y falta de idempotencia", async () => {
    expect((await POST(req("POST", path, body, { origin: null }))).status).toBe(403);
    expect((await POST(req("POST", path, body, { "idempotency-key": null }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("crea la sede con 201", async () => {
    const res = await POST(req("POST", path, body));
    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ ...body, idempotencyKey: "settings-key-001", actor: { userId, memberId } });
  });

  it("devuelve 409 cuando el plan no permite más sedes", async () => {
    mocks.create.mockRejectedValue(new OperationalError("CAPACITY_FULL", "Tu plan incluye 1 sede.", 409));
    const res = await POST(req("POST", path, body));
    expect(res.status).toBe(409);
    expect((await res.json()).detail).toContain("Tu plan incluye 1 sede");
  });
});
