import { beforeEach, describe, expect, it, vi } from "vitest";

import { ELEMENT_LIBRARY_UNAVAILABLE_REASON, ELEMENT_NOTE_MAX } from "@/modules/element-library/domain/element-library";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Biblioteca de elementos · rutas API. Se ejecutan de verdad; solo se simulan
 * la identidad, el límite de peticiones, el alcance y la fachada del servicio.
 * Orden fijo: sesión (401), mismo origen en la nota (403), validación estricta
 * (400), alcance del equipo técnico (403/404), límite (429) y servicio, que
 * vuelve a autorizar.
 */

const mocks = vi.hoisted(() => ({
  user: { id: "c0000000-0000-4000-8000-000000000001" } as { id: string } | null,
  scope: vi.fn(),
  rateLimit: vi.fn(),
  search: vi.fn(),
  getElement: vi.fn(),
  saveNote: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.scope }));
vi.mock("@/modules/element-library/application/element-library-service", () => ({
  searchCatalogElements: mocks.search,
  getCatalogElement: mocks.getElement,
  saveElementNote: mocks.saveNote,
}));

const organizationId = "a0000000-0000-4000-8000-000000000001";
const locationId = "a0000000-0000-4000-8000-000000000002";
const elementId = "a0000000-0000-4000-8000-000000000003";
const clientRequestId = "a0000000-0000-4000-8000-000000000004";
const memberId = "a0000000-0000-4000-8000-000000000005";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

type RouteCase = {
  name: string;
  method: "GET" | "PUT";
  load: () => Promise<Record<string, unknown>>;
  params: Record<string, string>;
  path: string;
  body?: unknown;
  service: () => ReturnType<typeof vi.fn>;
  /** Consulta o cuerpo con un campo desconocido. */
  unknownField: { path?: string; body?: unknown };
};

const scopeQuery = `organizationId=${organizationId}&locationId=${locationId}`;
const noteBody = { organizationId, locationId, clientRequestId, expectedRevision: null, note: "Brazos pegados en la entrada." };

const cases: RouteCase[] = [
  {
    name: "GET búsqueda",
    method: "GET",
    load: () => import("@/app/api/v1/owner/element-library/route"),
    params: {},
    path: `/api/v1/owner/element-library?${scopeQuery}&discipline=artistic_female&apparatus=vault&q=tsukahara`,
    service: () => mocks.search,
    unknownField: { path: `/api/v1/owner/element-library?${scopeQuery}&discipline=artistic_female&role=owner` },
  },
  {
    name: "GET ficha",
    method: "GET",
    load: () => import("@/app/api/v1/owner/element-library/[elementId]/route"),
    params: { elementId },
    path: `/api/v1/owner/element-library/${elementId}?${scopeQuery}`,
    service: () => mocks.getElement,
    unknownField: { path: `/api/v1/owner/element-library/${elementId}?${scopeQuery}&video=1` },
  },
  {
    name: "PUT nota",
    method: "PUT",
    load: () => import("@/app/api/v1/owner/element-library/[elementId]/note/route"),
    params: { elementId },
    path: `/api/v1/owner/element-library/${elementId}/note`,
    body: noteBody,
    service: () => mocks.saveNote,
    unknownField: { body: { ...noteBody, videoUrl: "https://example.invalid/v" } },
  },
];

function request(method: string, path: string, body?: unknown, origin = "https://zaltyko.test") {
  return new Request(new URL(path, "https://zaltyko.test"), {
    method,
    headers: { origin, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(item: RouteCase, overrides: { path?: string; body?: unknown; origin?: string } = {}) {
  const module = await item.load();
  const handler = module[item.method] as Handler;
  const path = overrides.path ?? item.path;
  const body = item.method === "GET" ? undefined : (overrides.body ?? item.body);
  return handler(request(item.method, path, body, overrides.origin), { params: Promise.resolve(item.params) });
}

beforeEach(() => {
  mocks.user = { id: "c0000000-0000-4000-8000-000000000001" };
  for (const mock of [mocks.scope, mocks.rateLimit, mocks.search, mocks.getElement, mocks.saveNote]) mock.mockReset();
  mocks.search.mockResolvedValue({ edition: null, elements: [], truncated: false });
  mocks.getElement.mockResolvedValue({ id: elementId });
  mocks.saveNote.mockResolvedValue({ note: null, replayed: false });
  mocks.scope.mockResolvedValue({ organization: { id: organizationId }, member: { id: memberId } });
  mocks.rateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
});

describe.each(cases)("$name", (item) => {
  it("exige sesión (401) y no consulta nada sin ella", async () => {
    mocks.user = null;
    const response = await call(item);
    expect(response.status).toBe(401);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(item.service()).not.toHaveBeenCalled();
  });

  it("rechaza un campo desconocido (400) antes de resolver el alcance", async () => {
    const response = await call(item, item.unknownField);
    expect(response.status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(item.service()).not.toHaveBeenCalled();
  });

  it("resuelve el alcance del equipo con la sede pedida, llama al servicio y no guarda en caché", async () => {
    const response = await call(item);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.scope).toHaveBeenCalledWith({
      userId: mocks.user!.id,
      organizationId,
      locationId,
      surface: "coach_operations",
    });
    expect(item.service()).toHaveBeenCalledTimes(1);
    expect(item.service().mock.calls[0]![0]).toMatchObject({ actor: { userId: mocks.user!.id, memberId } });
  });

  it("sin acceso a la academia (familia o rol sin acceso) responde 403 sin llegar al servicio", async () => {
    mocks.scope.mockRejectedValue(new OperationalError("FORBIDDEN", "Sin acceso a esta zona de la dirección", 403));
    const response = await call(item);
    expect(response.status).toBe(403);
    expect(item.service()).not.toHaveBeenCalled();
  });

  it("con la biblioteca apagada responde 503 con el motivo, nunca 500", async () => {
    item.service().mockRejectedValue(
      new OperationalError("FEATURE_NOT_AVAILABLE", "La biblioteca de elementos todavía no está activada en esta academia.", 503, {
        reason: ELEMENT_LIBRARY_UNAVAILABLE_REASON,
      })
    );
    const response = await call(item);
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    const body = await response.json();
    expect(body.errors).toEqual({ reason: ELEMENT_LIBRARY_UNAVAILABLE_REASON });
    expect(body.detail).toMatch(/todavía no está activada/);
  });

  it("traduce los errores del servicio (403 de rol, 404, 409) sin ocultarlos", async () => {
    for (const [code, status] of [
      ["FORBIDDEN", 403],
      ["NOT_FOUND", 404],
      ["VERSION_CONFLICT", 409],
    ] as const) {
      item.service().mockRejectedValueOnce(new OperationalError(code, "x", status));
      const response = await call(item);
      expect(response.status).toBe(status);
    }
  });

  it("respeta el límite de peticiones", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false, limit: 100, remaining: 0, reset: Math.floor(Date.now() / 1000) + 60 });
    const response = await call(item);
    expect(response.status).toBe(429);
    expect(item.service()).not.toHaveBeenCalled();
  });
});

describe("búsqueda", () => {
  const search = cases[0]!;

  it("exige la disciplina y no admite un aparato de otra disciplina ni un límite mayor de 100", async () => {
    for (const path of [
      `/api/v1/owner/element-library?${scopeQuery}`,
      `/api/v1/owner/element-library?${scopeQuery}&discipline=rhythmic`,
      `/api/v1/owner/element-library?${scopeQuery}&discipline=artistic_female&apparatus=rings`,
      `/api/v1/owner/element-library?${scopeQuery}&discipline=artistic_female&limit=101`,
      `/api/v1/owner/element-library?${scopeQuery}&discipline=artistic_female&value=Z`,
    ]) {
      expect((await call(search, { path })).status, path).toBe(400);
    }
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("los filtros vacíos cuentan como sin filtro", async () => {
    const response = await call(search, {
      path: `/api/v1/owner/element-library?${scopeQuery}&discipline=artistic_male&apparatus=&group=&value=&q=&limit=`,
    });
    expect(response.status).toBe(200);
    expect(mocks.search.mock.calls[0]![0].query).toMatchObject({ discipline: "artistic_male", apparatus: null, q: null });
  });
});

describe("nota", () => {
  const note = cases[2]!;

  it("rechaza otro origen (403) antes de leer el cuerpo o el alcance", async () => {
    const response = await call(note, { origin: "https://evil.test" });
    expect(response.status).toBe(403);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(mocks.saveNote).not.toHaveBeenCalled();
  });

  it(`una nota de más de ${ELEMENT_NOTE_MAX} caracteres responde 400; justo ${ELEMENT_NOTE_MAX} vale`, async () => {
    const tooLong = await call(note, { body: { ...noteBody, note: "a".repeat(ELEMENT_NOTE_MAX + 1) } });
    expect(tooLong.status).toBe(400);
    expect(mocks.saveNote).not.toHaveBeenCalled();
    const exact = await call(note, { body: { ...noteBody, note: `  ${"a".repeat(ELEMENT_NOTE_MAX)}  ` } });
    expect(exact.status).toBe(200);
    expect(mocks.saveNote.mock.calls[0]![0].command.note).toBe("a".repeat(ELEMENT_NOTE_MAX));
  });

  it("una nota vacía es borrarla, y la revisión esperada es obligatoria", async () => {
    expect((await call(note, { body: { ...noteBody, note: "   ", expectedRevision: 2 } })).status).toBe(200);
    expect(mocks.saveNote.mock.calls[0]![0].command).toMatchObject({ note: null, expectedRevision: 2 });
    const withoutRevision = { organizationId, locationId, clientRequestId, note: "Sin revisión" };
    expect((await call(note, { body: withoutRevision })).status).toBe(400);
  });

  it("un identificador de elemento que no es un id responde 400 sin resolver el alcance", async () => {
    const module = await note.load();
    const response = await (module.PUT as Handler)(request("PUT", note.path, noteBody), {
      params: Promise.resolve({ elementId: "no-es-un-id" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
  });
});
