/**
 * Regression ZAL-496 (PV-3 ZAL-427).
 *
 * /marketplace/nuevo publica siempre vía POST /api/marketplace. Antes del
 * fix, la página montaba <MarketplaceForm /> sin pasar props, por lo que
 * `userId` y `sellerType` viajaban como `undefined` en el body. El schema
 * Zod exigía `userId: z.string().uuid()` y `sellerType` con default
 * "external" en el form, así que:
 *
 *   - POST devolvía 400 VALIDATION_ERROR siempre (P0 real para el
 *     recorrido del proveedor — nadie podía publicar).
 *   - El handler ni siquiera usaba `validated.userId`; insertaba
 *     `context.userId`. El campo era un callejón sin salida.
 *   - `sellerType` quedaba persistido como "external" aunque el autor
 *     fuese una academia, un coach o un proveedor registrado.
 *
 * El fix elimina ambos campos del schema y los deriva server-side desde
 * el contexto de la sesión: `userId` desde `context.userId` y
 * `sellerType` desde `context.profile.role` mediante `sellerTypeForRole`.
 *
 * Este test cubre:
 *   1. POST sin `userId` ni `sellerType` en el body no devuelve 400.
 *   2. `userId` insertado es el de la sesión, no el del body (anti-IDOR).
 *   3. `sellerType` refleja el rol real del autor (provider, owner,
 *      coach, athlete, parent → mappings correctos).
 *   4. Si el cliente intenta fijar `userId` o `sellerType` ajenos, el
 *      servidor los ignora (no se filtra IDOR ni se puede falsear el
 *      tipo de vendedor).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let POST: typeof import("@/app/api/marketplace/route").POST;

let insertCalls: Array<{ table: unknown; payload: any }> = [];
let currentProfileRole: string;
let currentUserId: string;

// El handler inserta `userId` desde context.userId; queremos poder
// simular un usuario distinto para validar que no se filtra lo del body.
const sessionUserId = "00000000-0000-4000-8000-000000000abc";

vi.mock("@/lib/authz", () => ({
  // ZAL-499: POST /api/marketplace usa withAuthenticatedNoTenant.
  // El mock conserva la firma TenantContext con userId/profile del test.
  withAuthenticatedNoTenant:
    (handler: (request: Request, context: any) => Promise<Response>) =>
    (request: Request, ctx: any = {}) =>
      handler(request, {
        tenantId: "",
        userId: sessionUserId,
        profile: {
          id: "profile-1",
          userId: sessionUserId,
          role: currentProfileRole,
          tenantId: "tenant-123",
        },
        ...ctx,
      }),
}));

vi.mock("@/lib/public/demo-listings", () => ({
  demoMarketplaceListing: null,
}));

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn((table) => ({
      values: (payload: unknown) => {
        insertCalls.push({ table, payload });
        return {
          returning: vi.fn().mockResolvedValue([{ id: "listing-1", ...(payload as object) }]),
        };
      },
    })),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

const validPayload = {
  type: "product",
  category: "equipment",
  title: "Colchonetas de gimnasia",
  description: "Colchoneta profesional 2x1m",
  priceCents: 5000,
  priceType: "fixed",
  contact: { email: "vendor@example.com" },
  location: { country: "España", city: "Madrid" },
};

async function callPost(body: Record<string, unknown>) {
  const request = new Request("http://localhost/api/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request, {} as any);
}

describe("API /api/marketplace — ZAL-496 PV-3", () => {
  beforeAll(async () => {
    const marketplaceModule = await import("@/app/api/marketplace/route");
    POST = marketplaceModule.POST;
  });

  beforeEach(() => {
    insertCalls = [];
    currentProfileRole = "provider";
    currentUserId = sessionUserId;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("acepta el body que envía /marketplace/nuevo (sin userId ni sellerType)", async () => {
    const response = await callPost(validPayload);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].payload).toMatchObject({
      type: "product",
      category: "equipment",
      title: "Colchonetas de gimnasia",
    });
  });

  it("ignora userId enviado por el cliente y usa el de la sesión (anti-IDOR)", async () => {
    const impostorId = "11111111-1111-4111-8111-111111111111";
    const response = await callPost({ ...validPayload, userId: impostorId });

    expect(response.status).toBe(201);
    expect(insertCalls[0].payload.userId).toBe(sessionUserId);
    expect(insertCalls[0].payload.userId).not.toBe(impostorId);
  });

  it("ignora sellerType enviado por el cliente y deriva del rol", async () => {
    const response = await callPost({ ...validPayload, sellerType: "athlete" });

    expect(response.status).toBe(201);
    // El rol del profile es "provider" en beforeEach — el sellerType
    // almacenado debe ser "provider", no "athlete" del body.
    expect(insertCalls[0].payload.sellerType).toBe("provider");
    expect(insertCalls[0].payload.sellerType).not.toBe("athlete");
  });

  it("mapea provider → 'provider'", async () => {
    currentProfileRole = "provider";
    const response = await callPost(validPayload);

    expect(response.status).toBe(201);
    expect(insertCalls[0].payload.sellerType).toBe("provider");
  });

  it("mapea owner → 'academy'", async () => {
    currentProfileRole = "owner";
    const response = await callPost(validPayload);

    expect(response.status).toBe(201);
    expect(insertCalls[0].payload.sellerType).toBe("academy");
  });

  it("mapea admin → 'academy'", async () => {
    currentProfileRole = "admin";
    const response = await callPost(validPayload);

    expect(response.status).toBe(201);
    expect(insertCalls[0].payload.sellerType).toBe("academy");
  });

  it("mapea coach → 'coach'", async () => {
    currentProfileRole = "coach";
    const response = await callPost(validPayload);

    expect(response.status).toBe(201);
    expect(insertCalls[0].payload.sellerType).toBe("coach");
  });

  it("mapea athlete → 'athlete'", async () => {
    currentProfileRole = "athlete";
    const response = await callPost(validPayload);

    expect(response.status).toBe(201);
    expect(insertCalls[0].payload.sellerType).toBe("athlete");
  });

  it("mapea parent → 'external' (los padres no son vendedores)", async () => {
    currentProfileRole = "parent";
    const response = await callPost(validPayload);

    expect(response.status).toBe(201);
    expect(insertCalls[0].payload.sellerType).toBe("external");
  });

  it("rechaza con 400 cuando faltan campos required (title, category)", async () => {
    const response = await callPost({ type: "product" });

    expect(response.status).toBe(400);
    expect(insertCalls).toHaveLength(0);
  });

  // PV-6 (auditoría ZAL-427): un anuncio sin canal de contacto no es
  // publicable. Antes los tres campos eran opcionales y `priceType` por
  // defecto era "contact" → se podía publicar un anuncio "A convenir"
  // sin forma de convenir.
  it("rechaza con 400 cuando no hay canal de contacto (PV-6)", async () => {
    const payload = { ...validPayload };
    delete (payload as Record<string, unknown>).contact;
    const response = await callPost(payload);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(body)).toContain(
      "Necesitamos al menos una forma de que te contacten"
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("rechaza con 400 cuando contact viene con los tres campos vacíos (PV-6)", async () => {
    const response = await callPost({
      ...validPayload,
      contact: { whatsapp: "", email: "", phone: "" },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details.field).toBe("contact");
    expect(JSON.stringify(body)).toContain(
      "Necesitamos al menos una forma de que te contacten"
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("acepta cuando contact trae solo whatsapp (PV-6)", async () => {
    const response = await callPost({
      ...validPayload,
      contact: { whatsapp: "+34 600 000 000" },
    });

    expect(response.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].payload.contact).toEqual({
      whatsapp: "+34 600 000 000",
    });
  });

  it("acepta cuando contact trae solo phone (PV-6)", async () => {
    const response = await callPost({
      ...validPayload,
      contact: { phone: "+34 600 000 001" },
    });

    expect(response.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
  });

  // PV-4 (auditoría ZAL-427): la respuesta 400 debe incluir el campo
  // que falló en `details.field`, no solo el código genérico.
  it("incluye el campo que falló en details (PV-4)", async () => {
    const response = await callPost({ ...validPayload, title: "ab" });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details).toBeDefined();
    expect(body.details.field).toBe("title");
  });
});
