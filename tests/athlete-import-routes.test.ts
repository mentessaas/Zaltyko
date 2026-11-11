/**
 * O4 · Entrada HTTP de la importación: sesión, origen, permisos, límite de
 * peticiones, Idempotency-Key y tamaño se comprueban antes de leer el cuerpo.
 * Datos sintéticos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.ownerScope }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/modules/athlete-import/application/athlete-import-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/athlete-import/application/athlete-import-service")>()),
  previewAthleteImport: mocks.preview,
  confirmAthleteImport: mocks.confirm,
}));

import { POST as confirmPost } from "@/app/api/v1/owner/athlete-import/confirm/route";
import { ATHLETE_IMPORT_MAX_REQUEST_BYTES } from "@/app/api/v1/owner/athlete-import/import-request";
import { POST as previewPost } from "@/app/api/v1/owner/athlete-import/preview/route";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const memberId = "30000000-0000-4000-8000-000000000001";
const ORIGIN = "https://zaltyko.test";
const mapping = {
  givenName: 0,
  familyName: 1,
  dateOfBirth: null,
  group: null,
  guardianGivenName: null,
  guardianFamilyName: null,
  guardianEmail: null,
  guardianPhone: null,
  guardianRelationship: null,
};

function scope(role = "owner", locationScopeMode = "all") {
  return { organization: { id: organizationId, name: "Club sintético" }, member: { id: memberId, role, locationScopeMode } };
}

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  data.set("file", new Blob(["Nombre;Apellidos\nLucía;Prueba\n"], { type: "text/csv" }), "gimnastas.csv");
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function request(
  route: "preview" | "confirm",
  options: { body?: BodyInit; headers?: Record<string, string>; origin?: string } = {}
) {
  return new Request(`${ORIGIN}/api/v1/owner/athlete-import/${route}?organizationId=${organizationId}`, {
    method: "POST",
    headers: { origin: options.origin ?? ORIGIN, ...options.headers },
    body: options.body ?? form(),
    duplex: "half",
  } as RequestInit);
}

/**
 * A body that records whether anyone read it. With highWaterMark 0 the stream
 * only pulls when a reader asks for data; the default (1) pulls once as soon
 * as the stream is created, which would mark it as read with no reader.
 */
function watchedBody(size = 16) {
  const state = { pulled: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        state.pulled = true;
        controller.enqueue(new Uint8Array(size));
        controller.close();
      },
    },
    { highWaterMark: 0 }
  );
  return { stream, state };
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue(scope());
  mocks.rateLimit.mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: Math.floor(Date.now() / 1000) + 60 });
  mocks.preview.mockResolvedValue({ rows: [] });
  mocks.confirm.mockResolvedValue({ batchId: "b", created: [], skipped: [], replayed: false });
});

describe("entrada de la importación de gimnastas", () => {
  it("el detector de lectura solo marca un cuerpo que alguien lee", async () => {
    const idle = watchedBody();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(idle.state.pulled).toBe(false);
    const read = watchedBody();
    await new Response(read.stream).arrayBuffer();
    expect(read.state.pulled).toBe(true);
  });

  it("pide sesión antes de nada", async () => {
    mocks.currentUser.mockResolvedValueOnce(null);
    const { stream, state } = watchedBody();
    const response = await previewPost(request("preview", { body: stream }));
    expect(response.status).toBe(401);
    expect(state.pulled).toBe(false);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });

  it("rechaza otro origen", async () => {
    const response = await previewPost(request("preview", { origin: "https://otra-web.test" }));
    expect(response.status).toBe(403);
    expect((await response.json()).type).toBe("https://zaltyko.com/problems/invalid-origin");
    expect(mocks.ownerScope).not.toHaveBeenCalled();
  });

  it.each([
    ["coordinación", scope("manager", "all"), "forbidden"],
    ["entrenador", scope("coach", "selected"), "forbidden"],
    ["propiedad con sedes limitadas", scope("owner", "selected"), "location-scope-denied"],
  ])("da 403 a %s sin leer el cuerpo ni gastar el límite", async (_label, memberScope, type) => {
    mocks.ownerScope.mockResolvedValueOnce(memberScope);
    const { stream, state } = watchedBody();
    const response = await previewPost(request("preview", { body: stream }));
    expect(response.status).toBe(403);
    expect((await response.json()).type).toBe(`https://zaltyko.com/problems/${type}`);
    expect(state.pulled).toBe(false);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("aplica el límite de peticiones antes de leer el cuerpo, por ruta, academia y cliente", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false, limit: 10, remaining: 0, reset: Math.floor(Date.now() / 1000) + 60 });
    const { stream, state } = watchedBody();
    const response = await previewPost(request("preview", { body: stream }));
    expect(response.status).toBe(429);
    expect(state.pulled).toBe(false);
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: expect.stringContaining(`/api/v1/owner/athlete-import/preview:tenant:${organizationId}:`),
        limit: 10,
        window: 60,
      })
    );
  });

  it("responde 413 por el tamaño declarado sin leer el cuerpo", async () => {
    const { stream, state } = watchedBody();
    const response = await previewPost(
      request("preview", { body: stream, headers: { "content-length": String(ATHLETE_IMPORT_MAX_REQUEST_BYTES + 1) } })
    );
    expect(response.status).toBe(413);
    expect(state.pulled).toBe(false);
  });

  it("responde 413 si el cuerpo supera el límite aunque no declare tamaño", async () => {
    const chunk = new Uint8Array(512 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.length;
        controller.enqueue(chunk);
        if (sent > ATHLETE_IMPORT_MAX_REQUEST_BYTES * 2) controller.close();
      },
    });
    const response = await previewPost(request("preview", { body: stream }));
    expect(response.status).toBe(413);
    // The read stops right after the limit, not at the end of the stream.
    expect(sent).toBeLessThanOrEqual(ATHLETE_IMPORT_MAX_REQUEST_BYTES + 2 * chunk.length);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("la confirmación exige Idempotency-Key antes de leer el cuerpo", async () => {
    const { stream, state } = watchedBody();
    const response = await confirmPost(request("confirm", { body: stream }));
    expect(response.status).toBe(400);
    expect((await response.json()).detail).toContain("Idempotency-Key");
    expect(state.pulled).toBe(false);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("la confirmación exige la declaración de base legal", async () => {
    const response = await confirmPost(
      request("confirm", {
        headers: { "idempotency-key": "owner-athlete-import:clave-1" },
        body: form({ mapping: JSON.stringify(mapping), previewToken: "a".repeat(64) }),
      })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).type).toBe("https://zaltyko.com/problems/athlete-import-legal-basis-required");
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("pasa al servicio la academia de la dirección, el fichero, el mapeo y la declaración", async () => {
    const response = await confirmPost(
      request("confirm", {
        headers: { "idempotency-key": "owner-athlete-import:clave-2" },
        body: form({ mapping: JSON.stringify(mapping), previewToken: "a".repeat(64), legalBasisConfirmed: "true" }),
      })
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        userId,
        actor: { userId, memberId },
        mapping,
        previewToken: "a".repeat(64),
        idempotencyKey: "owner-athlete-import:clave-2",
        legalBasisConfirmed: true,
      })
    );
    const fileBytes = mocks.confirm.mock.calls[0]![0].fileBytes as Uint8Array;
    expect(new TextDecoder().decode(fileBytes)).toBe("Nombre;Apellidos\nLucía;Prueba\n");
  });
});
