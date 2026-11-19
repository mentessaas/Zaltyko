import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveUserId: vi.fn(),
  getCurrentProfile: vi.fn(),
  select: vi.fn(),
  loggerError: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  orderByArguments: [] as unknown[][],
}));

vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/authz/user-resolver", () => ({
  resolveUserId: mocks.resolveUserId,
}));
vi.mock("@/lib/authz/profile-service", () => ({
  getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock("@/lib/authz/tenant-resolver", () => ({
  getTenantId: vi.fn(),
  resolveTenantWithUpdate: vi.fn(),
}));
vi.mock("@/lib/authz/profile-updater", () => ({
  updateProfileIfNeeded: vi.fn(),
}));
vi.mock("@/lib/authz/endpoint-config", () => ({
  isPublicEndpoint: vi.fn(() => false),
  isAcademyCreationEndpoint: vi.fn(() => false),
  isFlexibleTenantEndpoint: vi.fn(() => false),
  extractVerifiedAcademyCandidate: vi.fn(),
}));
vi.mock("@/lib/authz/route-permissions", () => ({
  getRequiredRoutePermission: vi.fn(() => null),
}));
vi.mock("@/lib/authz/permissions-service", () => ({
  getUserPermissions: vi.fn(),
}));
vi.mock("@/lib/supabase/bearer-client", () => ({
  getBearerToken: vi.fn(),
  createBearerSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: vi.fn(),
  getVerifiedTenantRateLimitIdentifier: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { GET } from "@/app/api/super-admin/contact-requests/route";

const row = (id: string, email: string, createdAt: string) => ({
  id,
  name: "Responsable",
  email,
  academy: "Club",
  reason: "market_access",
  message: "Solicitud de acceso asistido",
  createdAt: new Date(createdAt),
  cursorCreatedAt: createdAt.replace(
    /\.(\d{3})Z$/,
    (_match, milliseconds: string) => `.${milliseconds}000Z`
  ),
  metadata: { private: "no debe salir en la respuesta" },
});

function setupSelect(rows = mocks.rows) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn((...args: unknown[]) => {
      mocks.orderByArguments.push(args);
      return chain;
    }),
    limit: vi.fn(async () => rows),
  };
  mocks.select.mockReturnValue(chain);
  return chain;
}

function request(query = "") {
  return new Request(`http://localhost/api/super-admin/contact-requests${query}`);
}

describe("GET /api/super-admin/contact-requests", () => {
  beforeEach(() => {
    mocks.resolveUserId.mockReset();
    mocks.getCurrentProfile.mockReset();
    mocks.select.mockReset();
    mocks.loggerError.mockReset();
    mocks.orderByArguments.length = 0;
    mocks.rows = [];
    mocks.resolveUserId.mockResolvedValue("user-1");
    mocks.getCurrentProfile.mockResolvedValue({
      id: "profile-1",
      role: "super_admin",
      isSuspended: false,
    });
    setupSelect();
  });

  it("autentica antes de validar parámetros y de consultar interacciones", async () => {
    mocks.resolveUserId.mockResolvedValue(null);

    const response = await GET(request("?limit=999&cursor=%%%"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "manager", "coach"])(
    "deniega el rol %s antes de leer solicitudes",
    async (role) => {
      mocks.getCurrentProfile.mockResolvedValue({
        id: "profile-1",
        role,
        isSuspended: false,
      });

      const response = await GET(request("?limit=999"));

      expect(response.status).toBe(403);
      expect(mocks.select).not.toHaveBeenCalled();
    }
  );

  it("rechaza un SuperAdmin suspendido antes de leer solicitudes", async () => {
    mocks.getCurrentProfile.mockResolvedValue({
      id: "profile-1", role: "super_admin", isSuspended: true,
    });
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("permite al SuperAdmin y responde sin caché ni campos ajenos al touchpoint", async () => {
    mocks.rows = [row(
      "80000000-0000-4000-8000-000000000001",
      "contacto@example.com",
      "2026-11-05T12:00:00.123Z"
    )];
    setupSelect();

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(payload.data.items[0]).toEqual({
      id: "80000000-0000-4000-8000-000000000001",
      name: "Responsable",
      email: "contacto@example.com",
      academy: "Club",
      reason: "market_access",
      message: "Solicitud de acceso asistido",
      createdAt: "2026-11-05T12:00:00.123Z",
    });
    expect(payload.data.items[0]).not.toHaveProperty("metadata");
    expect(mocks.orderByArguments[0]).toHaveLength(2);
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it.each([
    "?limit=0",
    "?limit=51",
    "?limit=5&limit=6",
    "?unknown=value",
    "?reason=not-allowed",
    "?cursor=not-a-cursor",
  ])("rechaza parámetros inválidos antes de consultar: %s", async (query) => {
    const response = await GET(request(query));

    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("acepta únicamente motivos de la allowlist", async () => {
    const chain = setupSelect();

    const response = await GET(request("?reason=market_access"));

    expect(response.status).toBe(200);
    expect(chain.where).toHaveBeenCalledOnce();
  });

  it("mantiene la página limitada incluso con el máximo permitido", async () => {
    const chain = setupSelect();

    const response = await GET(request("?limit=50"));

    expect(response.status).toBe(200);
    expect(chain.limit).toHaveBeenCalledWith(51);
  });

  it("rechaza un timestamp de cursor que no existe en el calendario", async () => {
    const cursor = Buffer.from(JSON.stringify({
      version: 1,
      createdAt: "2026-02-31T12:00:00.000000Z",
      id: "80000000-0000-4000-8000-000000000001",
    })).toString("base64url");

    const response = await GET(request(`?cursor=${cursor}`));

    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("pagina con cursor creadoAt+id y orden estable descendente", async () => {
    const first = row(
      "80000000-0000-4000-8000-000000000002",
      "primero@example.com",
      "2026-11-05T12:00:00.123Z"
    );
    const second = row(
      "80000000-0000-4000-8000-000000000001",
      "segundo@example.com",
      "2026-11-05T12:00:00.123Z"
    );
    mocks.rows = [first, second];
    setupSelect();

    const firstResponse = await GET(request("?limit=1"));
    const firstPayload = await firstResponse.json();
    const nextCursor = firstPayload.data.nextCursor as string;
    const cursorPayload = JSON.parse(Buffer.from(nextCursor, "base64url").toString("utf8"));

    expect(cursorPayload).toEqual({
      version: 1,
      createdAt: first.cursorCreatedAt,
      id: first.id,
    });
    expect(firstPayload.data.items).toHaveLength(1);

    mocks.rows = [second];
    setupSelect();
    const secondResponse = await GET(request(`?limit=1&cursor=${encodeURIComponent(nextCursor)}`));
    const secondPayload = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondPayload.data.items[0].id).toBe(second.id);
    expect(secondPayload.data.nextCursor).toBeNull();
    expect(mocks.orderByArguments.every((args) => args.length === 2)).toBe(true);
  });

  it("no devuelve errores de consulta ni PII en registros", async () => {
    const chain = setupSelect();
    chain.limit.mockRejectedValueOnce(new Error("correo@example.com fallo"));

    const response = await GET(request());
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain("correo@example.com");
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
