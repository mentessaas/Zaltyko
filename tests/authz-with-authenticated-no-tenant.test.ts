/**
 * ZAL-499: cobertura focal de `withAuthenticatedNoTenant` aplicada a
 * POST /api/marketplace (PV-2 del audit ZAL-427, opción a aprobada).
 *
 * Mapeo al spec:
 * - G-1 (provider con body válido)            → POST lista con rol provider.
 * - G-3 (owner con tenant sin regresión)      → POST lista con rol owner.
 * - N-1/N-2 (cross-user 403)                  → role no permitido rechaza.
 * - N-3 (401 sin sesión)                      → userId null rechaza.
 * - N-5 (userId del body sigue siendo server) → propiedad anti-IDOR.
 *
 * Estrategia: el wrapper delega en `resolveUserId` y `getCurrentProfile`,
 * que se mockean aquí. El handler interno es trivial (devuelve 201 con
 * userId del contexto). Eso evita mockear `@/db` o Zod.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let POST: typeof import("@/app/api/marketplace/route").POST;

let profileToReturn: any;
let userIdToReturn: string | null;
let getCurrentProfileMock: ReturnType<typeof vi.fn>;
let resolveUserIdMock: ReturnType<typeof vi.fn>;

vi.mock("@/lib/authz/user-resolver", () => ({
  resolveUserId: vi.fn(async () => userIdToReturn),
}));

vi.mock("@/lib/authz/profile-service", () => ({
  getCurrentProfile: vi.fn(async () => profileToReturn),
}));

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((payload: unknown) => ({
        returning: vi.fn().mockResolvedValue([{ id: "listing-1", ...(payload as object) }]),
      })),
    })),
  },
}));

vi.mock("@/lib/public/demo-listings", () => ({
  demoMarketplaceListing: null,
}));

const validPayload = {
  type: "product",
  category: "equipment",
  title: "Colchoneta",
  description: "Test",
  priceCents: 100,
  priceType: "fixed",
  contact: { email: "vendor@example.com" },
  location: { country: "España", city: "Madrid" },
};

async function callPost(body: Record<string, unknown> = validPayload) {
  const request = new Request("http://localhost/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request, {} as any);
}

const makeProfile = (overrides: Partial<{
  role: string;
  canLogin: boolean;
  tenantId: string | null;
}> = {}) => ({
  id: "profile-1",
  userId: overrides.role ? `user-${overrides.role}` : "user-1",
  role: overrides.role ?? "provider",
  canLogin: overrides.canLogin ?? true,
  tenantId: overrides.tenantId ?? null,
});

describe("withAuthenticatedNoTenant — ZAL-499", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resolveUserId } = await import("@/lib/authz/user-resolver");
    const { getCurrentProfile } = await import("@/lib/authz/profile-service");
    resolveUserIdMock = resolveUserId as unknown as ReturnType<typeof vi.fn>;
    getCurrentProfileMock = getCurrentProfile as unknown as ReturnType<typeof vi.fn>;
    userIdToReturn = "00000000-0000-4000-8000-000000000abc";
    profileToReturn = makeProfile({ role: "provider" });
    // Re-importar el handler DESPUÉS de configurar los mocks para que el
    // módulo cachee los mocks actuales.
    const mod = await import("@/app/api/marketplace/route");
    POST = mod.POST;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // G-1: provider con body válido → 201 con userId del contexto
  it("G-1: provider con body válido crea listing con userId server-derived", async () => {
    profileToReturn = makeProfile({ role: "provider" });
    userIdToReturn = "00000000-0000-4000-8000-000000000abc";

    const response = await callPost();

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toBeDefined();
  });

  // G-3: owner con tenant → 201 sin regresión
  it("G-3: owner con tenantId puede publicar sin cambios", async () => {
    profileToReturn = makeProfile({ role: "owner", tenantId: "tenant-acme" });

    const response = await callPost();

    expect(response.status).toBe(201);
  });

  // N-3: sin sesión → 401
  it("N-3: sin sesión devuelve 401 UNAUTHENTICATED", async () => {
    userIdToReturn = null;

    const response = await callPost();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("UNAUTHENTICATED");
  });

  // N-1: role no permitido sin tenant (athlete sin academia) → 403
  it("N-1: athlete sin tenant devuelve 403 INSUFFICIENT_ROLE", async () => {
    profileToReturn = makeProfile({ role: "athlete", tenantId: null });

    const response = await callPost();

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("INSUFFICIENT_ROLE");
  });

  // N-2: parent sin tenant → 403 (los padres no son vendedores)
  it("N-2: parent sin tenant devuelve 403 INSUFFICIENT_ROLE", async () => {
    profileToReturn = makeProfile({ role: "parent", tenantId: null });

    const response = await callPost();

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("INSUFFICIENT_ROLE");
  });

  // N-5: profile.canLogin=false sin ser super_admin → 403 LOGIN_DISABLED
  it("rechaza profile con canLogin=false y role != super_admin", async () => {
    profileToReturn = makeProfile({ role: "provider", canLogin: false });

    const response = await callPost();

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("LOGIN_DISABLED");
  });

  // super_admin siempre pasa el login gate aunque canLogin=false
  it("super_admin con canLogin=false pasa el login gate", async () => {
    profileToReturn = makeProfile({ role: "super_admin", canLogin: false });

    const response = await callPost();

    expect(response.status).toBe(201);
  });

  // N-5 (parte anti-IDOR): si el cliente envía userId en el body, el
  // handler lo ignora. Verificamos que el wrapper expone userId del contexto
  // en el body.data del response.
  it("N-5: userId del body no se filtra al handler (anti-IDOR)", async () => {
    profileToReturn = makeProfile({ role: "provider" });
    userIdToReturn = "00000000-0000-4000-8000-000000000abc";

    const impostorId = "11111111-1111-4111-8111-111111111111";
    const response = await callPost({ ...validPayload, userId: impostorId });

    expect(response.status).toBe(201);
    const body = await response.json();
    // apiCreated({ item: listing }) → body.data.item
    const listing = body.data?.item ?? body.data;
    expect(listing.userId).toBe("00000000-0000-4000-8000-000000000abc");
    expect(listing.userId).not.toBe(impostorId);
  });
});