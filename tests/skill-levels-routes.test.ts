import { beforeEach, describe, expect, it, vi } from "vitest";

import { OperationalError } from "@/modules/shared/domain/operational-error";
import { SKILL_LEVELS_UNAVAILABLE_REASON } from "@/modules/skill-levels/domain/skill-levels";

/**
 * Niveles y progresión · rutas API. Se ejecutan de verdad; solo se simulan la
 * identidad, el límite de peticiones, el alcance y la fachada del servicio.
 * Orden fijo: sesión (401), mismo origen en mutaciones (403), validación
 * (400), alcance (403/404), límite (429) y servicio, que vuelve a autorizar.
 */

const mocks = vi.hoisted(() => ({
  user: { id: "c0000000-0000-4000-8000-000000000001" } as { id: string } | null,
  scope: vi.fn(),
  rateLimit: vi.fn(),
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  createTemplate: vi.fn(),
  saveTemplate: vi.fn(),
  evaluate: vi.fn(),
  getAthleteSkills: vi.fn(),
  passLevel: vi.fn(),
  groupRoster: vi.fn(),
  sessionRoster: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.scope }));
vi.mock("@/modules/skill-levels/application/skill-level-service", () => ({
  listSkillTemplates: mocks.listTemplates,
  getSkillTemplate: mocks.getTemplate,
  createSkillTemplate: mocks.createTemplate,
  saveSkillTemplate: mocks.saveTemplate,
  evaluateSkills: mocks.evaluate,
  getAthleteSkills: mocks.getAthleteSkills,
  passSkillLevel: mocks.passLevel,
  getGroupSkillRoster: mocks.groupRoster,
  getSessionSkillRoster: mocks.sessionRoster,
}));

const organizationId = "a0000000-0000-4000-8000-000000000001";
const locationId = "a0000000-0000-4000-8000-000000000002";
const athleteId = "a0000000-0000-4000-8000-000000000003";
const templateId = "a0000000-0000-4000-8000-000000000004";
const levelId = "a0000000-0000-4000-8000-000000000005";
const elementId = "a0000000-0000-4000-8000-000000000006";
const groupId = "a0000000-0000-4000-8000-000000000007";
const sessionId = "a0000000-0000-4000-8000-000000000008";
const clientRequestId = "a0000000-0000-4000-8000-000000000009";
const memberId = "a0000000-0000-4000-8000-00000000000a";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

type RouteCase = {
  name: string;
  method: "GET" | "POST" | "PUT";
  load: () => Promise<Record<string, unknown>>;
  params: Record<string, string>;
  path: string;
  body?: unknown;
  service: () => ReturnType<typeof vi.fn>;
  /** Mensaje de la consulta o cuerpo que no valida. */
  invalid: { path?: string; body?: unknown };
};

const scopeQuery = `organizationId=${organizationId}&locationId=${locationId}`;

const cases: RouteCase[] = [
  {
    name: "GET plantillas",
    method: "GET",
    load: () => import("@/app/api/v1/owner/skill-templates/route"),
    params: {},
    path: `/api/v1/owner/skill-templates?${scopeQuery}`,
    service: () => mocks.listTemplates,
    invalid: { path: `/api/v1/owner/skill-templates?organizationId=${organizationId}` },
  },
  {
    name: "POST plantilla",
    method: "POST",
    load: () => import("@/app/api/v1/owner/skill-templates/route"),
    params: {},
    path: "/api/v1/owner/skill-templates",
    body: { organizationId, locationId, clientRequestId, source: "blank", discipline: "artistic_female", name: "Base 2" },
    service: () => mocks.createTemplate,
    invalid: { body: { organizationId, locationId, clientRequestId, source: "blank", discipline: "gaf", name: "Base" } },
  },
  {
    name: "GET plantilla",
    method: "GET",
    load: () => import("@/app/api/v1/owner/skill-templates/[templateId]/route"),
    params: { templateId },
    path: `/api/v1/owner/skill-templates/${templateId}?${scopeQuery}`,
    service: () => mocks.getTemplate,
    invalid: { path: `/api/v1/owner/skill-templates/${templateId}?locationId=${locationId}` },
  },
  {
    name: "PUT plantilla",
    method: "PUT",
    load: () => import("@/app/api/v1/owner/skill-templates/[templateId]/route"),
    params: { templateId },
    path: `/api/v1/owner/skill-templates/${templateId}`,
    body: {
      organizationId,
      locationId,
      expectedRevision: 1,
      name: "Base 2",
      levels: [{ name: "Nivel 1", elements: [{ name: "Rueda lateral", apparatus: "floor" }] }],
    },
    service: () => mocks.saveTemplate,
    invalid: { body: { organizationId, locationId, expectedRevision: 1, name: "Base 2", levels: [] } },
  },
  {
    name: "POST evaluación",
    method: "POST",
    load: () => import("@/app/api/v1/owner/skill-evaluations/route"),
    params: {},
    path: "/api/v1/owner/skill-evaluations",
    body: {
      organizationId,
      locationId,
      clientRequestId,
      templateId,
      athleteIds: [athleteId],
      elementIds: [elementId],
      status: "achieved",
    },
    service: () => mocks.evaluate,
    invalid: { body: { organizationId, locationId, clientRequestId, templateId, athleteIds: [], elementIds: [elementId], status: "achieved" } },
  },
  {
    name: "GET niveles de una gimnasta",
    method: "GET",
    load: () => import("@/app/api/v1/owner/athletes/[athleteId]/skills/route"),
    params: { athleteId },
    path: `/api/v1/owner/athletes/${athleteId}/skills?${scopeQuery}`,
    service: () => mocks.getAthleteSkills,
    invalid: { path: `/api/v1/owner/athletes/${athleteId}/skills?organizationId=${organizationId}` },
  },
  {
    name: "POST paso de nivel",
    method: "POST",
    load: () => import("@/app/api/v1/owner/athletes/[athleteId]/skills/level-passes/route"),
    params: { athleteId },
    path: `/api/v1/owner/athletes/${athleteId}/skills/level-passes`,
    body: { organizationId, locationId, clientRequestId, templateId, levelId },
    service: () => mocks.passLevel,
    invalid: { body: { organizationId, locationId, clientRequestId, templateId } },
  },
  {
    name: "GET progreso de un grupo",
    method: "GET",
    load: () => import("@/app/api/v1/owner/groups/[groupId]/skills/route"),
    params: { groupId },
    path: `/api/v1/owner/groups/${groupId}/skills?${scopeQuery}&templateId=${templateId}`,
    service: () => mocks.groupRoster,
    invalid: { path: `/api/v1/owner/groups/${groupId}/skills?${scopeQuery}` },
  },
  {
    name: "GET progreso de una sesión",
    method: "GET",
    load: () => import("@/app/api/v1/owner/sessions/[sessionId]/skills/route"),
    params: { sessionId },
    path: `/api/v1/owner/sessions/${sessionId}/skills?${scopeQuery}&templateId=${templateId}`,
    service: () => mocks.sessionRoster,
    invalid: { path: `/api/v1/owner/sessions/${sessionId}/skills?${scopeQuery}` },
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
  for (const mock of [
    mocks.scope,
    mocks.rateLimit,
    mocks.listTemplates,
    mocks.getTemplate,
    mocks.createTemplate,
    mocks.saveTemplate,
    mocks.evaluate,
    mocks.getAthleteSkills,
    mocks.passLevel,
    mocks.groupRoster,
    mocks.sessionRoster,
  ]) {
    mock.mockReset();
    mock.mockResolvedValue({ id: templateId, revision: 1, replayed: false });
  }
  mocks.scope.mockResolvedValue({ organization: { id: organizationId }, member: { id: memberId } });
  mocks.rateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
});

describe.each(cases)("$name", (item) => {
  it("exige sesión y no consulta nada sin ella", async () => {
    mocks.user = null;
    const response = await call(item);
    expect(response.status).toBe(401);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(item.service()).not.toHaveBeenCalled();
  });

  it("valida antes de resolver el alcance", async () => {
    const response = await call(item, item.invalid);
    expect(response.status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(item.service()).not.toHaveBeenCalled();
  });

  it("resuelve el alcance del equipo con la sede pedida, vuelve a autorizar en el servicio y no guarda en caché", async () => {
    const response = await call(item);
    expect([200, 201]).toContain(response.status);
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

  it("un entrenador fuera de su sede recibe 403 sin llegar al servicio", async () => {
    mocks.scope.mockRejectedValue(new OperationalError("LOCATION_SCOPE_DENIED", "Sede fuera de alcance", 403));
    const response = await call(item);
    expect(response.status).toBe(403);
    expect(item.service()).not.toHaveBeenCalled();
  });

  it("con la función apagada responde 503 «no disponible», nunca 500", async () => {
    item.service().mockRejectedValue(
      new OperationalError("FEATURE_NOT_AVAILABLE", "Los niveles y la progresión todavía no están activados en esta academia.", 503, {
        reason: SKILL_LEVELS_UNAVAILABLE_REASON,
      })
    );
    const response = await call(item);
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect((await response.json()).detail).toMatch(/todavía no están activados/);
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

  if (item.method !== "GET") {
    it("rechaza otro origen antes de leer el cuerpo o el alcance", async () => {
      const response = await call(item, { origin: "https://evil.test" });
      expect(response.status).toBe(403);
      expect(mocks.scope).not.toHaveBeenCalled();
      expect(item.service()).not.toHaveBeenCalled();
    });
  }
});

describe("altas idempotentes", () => {
  const writers = cases.filter((item) => item.name === "POST plantilla" || item.name === "POST paso de nivel");

  it.each(writers)("$name: 201 al crear y 200 al repetir la misma petición", async (item) => {
    item.service().mockResolvedValueOnce({ id: templateId, revision: 1, replayed: false });
    item.service().mockResolvedValueOnce({ id: templateId, revision: 1, replayed: true });
    expect((await call(item)).status).toBe(201);
    expect((await call(item)).status).toBe(200);
  });
});

describe("parámetros de la ruta", () => {
  it("un identificador que no es un id responde 400 sin resolver el alcance", async () => {
    const item = cases.find((entry) => entry.name === "GET niveles de una gimnasta")!;
    const module = await item.load();
    const response = await (module.GET as Handler)(request("GET", item.path), {
      params: Promise.resolve({ athleteId: "no-es-un-id" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
  });

  it("el cuerpo no puede traer campos desconocidos", async () => {
    const item = cases.find((entry) => entry.name === "POST evaluación")!;
    const response = await call(item, { body: { ...(item.body as object), role: "owner" } });
    expect(response.status).toBe(400);
    expect(item.service()).not.toHaveBeenCalled();
  });
});
