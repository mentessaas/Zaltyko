import { beforeEach, describe, expect, it, vi } from "vitest";

/** HTTP contract for card collection routes in the manual-only launch mode. */

const mocks = vi.hoisted(() => ({
  collectChargeMock: vi.fn(),
  verifyAcademyAccessMock: vi.fn(),
  // dbLike capturado por prueba (insert/select/update) para aserciones
  selectedCharges: [] as any[],
  // Portal familia: usuario autenticado y resolución de acceso al cargo.
  getUserMock: vi.fn(),
  resolveFamilyChargeAccessMock: vi.fn(),
}));

const CHARGE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MISSING_CHARGE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FOREIGN_CHARGE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// `withTenant` se reemplaza por un passthrough que inyecta un perfil owner/tenant.
// Mockeamos el módulo entero para no arrastrar la implementación real (resolveUserId,
// getCurrentProfile, getTenantId, permisos, rate-limit por tenant) que ya tiene sus
// propios tests. La lógica de auth vive en tests/authz-* y en `pnpm test:rls:local`.
vi.mock("@/lib/authz", () => ({
  withTenant:
    (handler: (request: Request, context: any) => Promise<Response>) =>
    (request: Request, ctx: any = {}) =>
      handler(request, {
        tenantId: "tenant-1",
        userId: "user-1",
        profile: {
          id: "profile-1",
          userId: "user-1",
          role: "owner",
          tenantId: "tenant-1",
          canLogin: true,
        },
        ...ctx,
      }),
}));

// `withRateLimit` se vuelve passthrough y `getUserIdentifier` devuelve una clave
// estable. La política de rate-limit tiene su propia suite (`tests/lib/...`).
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit:
    (handler: (request: Request, context: any) => Promise<Response>) =>
    (request: Request, context: any = {}) =>
      handler(request, context),
  getUserIdentifier: () => "user:1:test",
  rateLimit: vi.fn().mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 }),
  getLimitForRoute: () => ({ limit: 10, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: vi.fn(() => "tenant:tenant-1:user:1"),
}));

vi.mock("@/lib/permissions", () => ({
  verifyAcademyAccess: (...args: any[]) => mocks.verifyAcademyAccessMock(...args),
}));

vi.mock("@/lib/authz/resource-scope", () => ({
  authorizeAcademyCapability: (...args: any[]) => mocks.verifyAcademyAccessMock(...args),
}));

vi.mock("@/lib/stripe/charge-collection-service", () => ({
  collectCharge: (...args: any[]) => mocks.collectChargeMock(...args),
}));

vi.mock("@/lib/env", () => ({
  getOptionalEnvVar: (name: string) =>
    name === "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" ? "pk_test_123" : undefined,
}));

// Chain mínima de drizzle: solo el `select(...).from(...).where(...).limit(...)`
// que hace la ruta para localizar el cargo por id. `charges` se importa del
// schema — proveemos un sentinel `{ id: "charges.id" }` y dejamos que el
// chain devuelva lo que el test haya metido en `mocks.selectedCharges`.
vi.mock("@/db/schema", () => ({
  charges: { id: "charges.id", academyId: "charges.academyId" },
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(mocks.selectedCharges)),
        })),
      })),
    })),
  },
}));

let POST: typeof import("@/app/api/charges/[chargeId]/collect/route").POST;

// --- Mocks de la ruta del portal familia (`/api/family/charges/[id]/pay`) ---
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn(), getAll: vi.fn(() => []) })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: (...args: any[]) => mocks.getUserMock(...args) },
  })),
}));

vi.mock("@/lib/family/payment-access", () => ({
  resolveFamilyChargeAccess: (...args: any[]) => mocks.resolveFamilyChargeAccessMock(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

let FAMILY_POST: typeof import("@/app/api/family/charges/[chargeId]/pay/route").POST;

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.selectedCharges = [{ id: CHARGE_ID, academyId: "academy_1" }];
  mocks.verifyAcademyAccessMock.mockResolvedValue({ allowed: true });
  mocks.getUserMock.mockResolvedValue({
    data: { user: { id: "user-parent", email: "madre@example.com" } },
  });
  mocks.resolveFamilyChargeAccessMock.mockResolvedValue({
    id: CHARGE_ID,
    academyId: "academy_1",
  });
  if (!POST) {
    const mod = await import("@/app/api/charges/[chargeId]/collect/route");
    POST = mod.POST;
  }
  if (!FAMILY_POST) {
    const mod = await import("@/app/api/family/charges/[chargeId]/pay/route");
    FAMILY_POST = mod.POST;
  }
});

describe("POST /api/charges/[chargeId]/collect — política manual-only", () => {
  it("rechaza el cobro después de validar el cargo y su academia", async () => {
    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/collect`, { method: "POST" }),
      { params: Promise.resolve({ chargeId: CHARGE_ID }) }
    );

    expect(response.status).toBe(410);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: "FAMILY_AUTOMATIC_COLLECTION_DISABLED" });
    expect(mocks.collectChargeMock).not.toHaveBeenCalled();
  });

  it("devuelve 404 CHARGE_NOT_FOUND si el cargo no existe", async () => {
    mocks.selectedCharges = [];

    const response = await POST(
      new Request(`http://localhost/api/charges/${MISSING_CHARGE_ID}/collect`, { method: "POST" }),
      { params: Promise.resolve({ chargeId: MISSING_CHARGE_ID }) }
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: "CHARGE_NOT_FOUND",
      code: "CHARGE_NOT_FOUND",
    });
    expect(mocks.collectChargeMock).not.toHaveBeenCalled();
  });

  it("devuelve 403 cuando verifyAcademyAccess deniega al tenant del cargo", async () => {
    mocks.verifyAcademyAccessMock.mockResolvedValue({
      allowed: false,
      reason: "ACADEMY_NOT_FOUND_OR_ACCESS_DENIED",
    });

    const response = await POST(
      new Request(`http://localhost/api/charges/${CHARGE_ID}/collect`, { method: "POST" }),
      { params: Promise.resolve({ chargeId: CHARGE_ID }) }
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: "ACADEMY_NOT_FOUND_OR_ACCESS_DENIED",
    });
    expect(mocks.collectChargeMock).not.toHaveBeenCalled();
  });

  it("devuelve 400 CHARGE_ID_REQUIRED si el handler no recibe chargeId en la URL", async () => {
    // Forzamos al regex interno del handler a no encontrar chargeId.
    const response = await POST(
      new Request("http://localhost/api/charges//collect", { method: "POST" }),
      { params: Promise.resolve({}) }
    );

    // El handler matchea `^\/api\/charges\/([^/]+)\/collect`; sin segmento,
    // devuelve 400 CHARGE_ID_REQUIRED sin tocar DB ni collectCharge.
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: "CHARGE_ID_REQUIRED",
    });
    expect(mocks.collectChargeMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/family/charges/[chargeId]/pay — política manual-only", () => {
  it("rechaza el cobro tras validar la relación familiar", async () => {
    const response = await FAMILY_POST(
      new Request(`http://localhost/api/family/charges/${CHARGE_ID}/pay`, { method: "POST" })
    );

    expect(response.status).toBe(410);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: "FAMILY_AUTOMATIC_COLLECTION_DISABLED",
    });
    expect(mocks.collectChargeMock).not.toHaveBeenCalled();
  });

  it("no elude el control manual-only aunque no exista tarjeta guardada", async () => {
    const response = await FAMILY_POST(
      new Request(`http://localhost/api/family/charges/${CHARGE_ID}/pay`, { method: "POST" })
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "FAMILY_AUTOMATIC_COLLECTION_DISABLED",
    });
    expect(mocks.collectChargeMock).not.toHaveBeenCalled();
  });

  it("no ejecuta cobros con tarjeta aunque la tarjeta se considere válida", async () => {
    const response = await FAMILY_POST(
      new Request(`http://localhost/api/family/charges/${CHARGE_ID}/pay`, { method: "POST" })
    );

    expect(response.status).toBe(410);
    expect(mocks.collectChargeMock).not.toHaveBeenCalled();
  });

  it("no llama a collectCharge si el cargo no pertenece a un hijo del usuario", async () => {
    mocks.resolveFamilyChargeAccessMock.mockResolvedValue(null);

    const response = await FAMILY_POST(
      new Request(`http://localhost/api/family/charges/${FOREIGN_CHARGE_ID}/pay`, { method: "POST" })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
    expect(mocks.collectChargeMock).not.toHaveBeenCalled();
  });
});
