import { beforeEach, describe, expect, it, vi } from "vitest";

import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * P2 #17 (segunda parte): rutas de planificación. Orden de comprobaciones
 * (401, mismo origen, 400, alcance, servicio), superficie operativa para el
 * plan de la sesión y de gestión para la plantilla, sin caché, y el 503 del
 * candidato sin aplicar con su motivo (nunca un 500).
 */
const mocks = vi.hoisted(() => ({
  user: { id: "c0000000-0000-4000-8000-000000000001" } as { id: string } | null,
  scope: vi.fn(),
  rateLimit: vi.fn(),
  getPlan: vi.fn(),
  savePlan: vi.fn(),
  markBlock: vi.fn(),
  getTemplate: vi.fn(),
  saveTemplate: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.scope }));
vi.mock("@/modules/session-plans/application/session-plan-service", () => ({
  getSessionPlan: mocks.getPlan,
  saveSessionPlan: mocks.savePlan,
  markSessionPlanBlock: mocks.markBlock,
  getClassPlanTemplate: mocks.getTemplate,
  saveClassPlanTemplate: mocks.saveTemplate,
}));

const organizationId = "a0000000-0000-4000-8000-000000000001";
const locationId = "a0000000-0000-4000-8000-000000000002";
const sessionId = "a0000000-0000-4000-8000-000000000003";
const blockId = "a0000000-0000-4000-8000-000000000004";
const classTemplateId = "a0000000-0000-4000-8000-000000000005";
const clientRequestId = "a0000000-0000-4000-8000-000000000006";
const memberId = "a0000000-0000-4000-8000-000000000007";

const loadPlan = () => import("@/app/api/v1/owner/sessions/[sessionId]/plan/route");
const loadBlock = () => import("@/app/api/v1/owner/sessions/[sessionId]/plan/blocks/[blockId]/route");
const loadTemplate = () => import("@/app/api/v1/owner/classes/[classTemplateId]/plan-template/route");

function request(method: string, path: string, body?: unknown, origin = "https://zaltyko.test") {
  return new Request(new URL(path, "https://zaltyko.test"), {
    method,
    headers: { origin, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

const planBody = {
  organizationId,
  locationId,
  clientRequestId,
  expectedRevision: null,
  focus: "Rondada",
  blocks: [{ kind: "warmup", content: "Movilidad", durationMinutes: 10 }],
  objectiveIds: [],
};

beforeEach(() => {
  mocks.user = { id: "c0000000-0000-4000-8000-000000000001" };
  for (const mock of [mocks.scope, mocks.rateLimit, mocks.getPlan, mocks.savePlan, mocks.markBlock, mocks.getTemplate, mocks.saveTemplate]) {
    mock.mockReset();
  }
  mocks.scope.mockResolvedValue({ organization: { id: organizationId }, member: { id: memberId } });
  mocks.rateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
});

describe("GET plan de la sesión", () => {
  const path = `/api/v1/owner/sessions/${sessionId}/plan?organizationId=${organizationId}&locationId=${locationId}`;

  it("exige sesión y no consulta nada sin ella", async () => {
    mocks.user = null;
    const { GET } = await loadPlan();
    const response = await GET(request("GET", path), params({ sessionId }));
    expect(response.status).toBe(401);
    expect(mocks.scope).not.toHaveBeenCalled();
  });

  it("valida la consulta antes de resolver el alcance", async () => {
    const { GET } = await loadPlan();
    const response = await GET(
      request("GET", `/api/v1/owner/sessions/${sessionId}/plan?organizationId=${organizationId}`),
      params({ sessionId })
    );
    expect(response.status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
  });

  it("rechaza un identificador de sesión mal formado", async () => {
    const { GET } = await loadPlan();
    const response = await GET(request("GET", path), params({ sessionId: "no-es-un-uuid" }));
    expect(response.status).toBe(400);
    expect(mocks.getPlan).not.toHaveBeenCalled();
  });

  it("usa la superficie operativa (criterio de Pasar lista) y no guarda en caché", async () => {
    mocks.getPlan.mockResolvedValue({ plan: null });
    const { GET } = await loadPlan();
    const response = await GET(request("GET", path), params({ sessionId }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.scope).toHaveBeenCalledWith({
      userId: mocks.user!.id,
      organizationId,
      locationId,
      surface: "coach_operations",
    });
    expect(mocks.getPlan).toHaveBeenCalledWith({
      actor: { userId: mocks.user!.id, memberId },
      sessionId,
      query: { organizationId, locationId },
    });
    expect(await response.json()).toMatchObject({ ok: true, data: { plan: null } });
  });

  it("sin el candidato aplicado responde 503 con su motivo, no 500", async () => {
    mocks.getPlan.mockRejectedValue(
      new OperationalError("FEATURE_NOT_AVAILABLE", "No activado", 503, { reason: "session_plans_unavailable" })
    );
    const { GET } = await loadPlan();
    const response = await GET(request("GET", path), params({ sessionId }));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(await response.json())).toContain("session_plans_unavailable");
  });

  it("un error inesperado no se convierte en respuesta", async () => {
    mocks.getPlan.mockRejectedValue(new Error("boom"));
    const { GET } = await loadPlan();
    await expect(GET(request("GET", path), params({ sessionId }))).rejects.toThrow("boom");
  });

  it("respeta el límite de peticiones antes de llamar al servicio", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false, limit: 1, remaining: 0, reset: 0 });
    const { GET } = await loadPlan();
    const response = await GET(request("GET", path), params({ sessionId }));
    expect(response.status).toBe(429);
    expect(mocks.getPlan).not.toHaveBeenCalled();
  });
});

describe("PUT plan de la sesión", () => {
  const path = `/api/v1/owner/sessions/${sessionId}/plan`;

  it("rechaza otro origen antes de leer el cuerpo o el alcance", async () => {
    const { PUT } = await loadPlan();
    const response = await PUT(request("PUT", path, planBody, "https://evil.example"), params({ sessionId }));
    expect(response.status).toBe(403);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(mocks.savePlan).not.toHaveBeenCalled();
  });

  it.each([
    ["sin clientRequestId", { ...planBody, clientRequestId: undefined }],
    ["con más de 20 bloques", { ...planBody, blocks: Array.from({ length: 21 }, () => ({ kind: "other", content: "x" })) }],
    ["con un aparato de otra disciplina", { ...planBody, blocks: [{ kind: "technique", discipline: "gr", apparatus: "beam", content: "x" }] }],
    ["con un campo desconocido", { ...planBody, sessionStaffOnly: true }],
  ])("valida el cuerpo (%s) antes del alcance", async (_label, body) => {
    const { PUT } = await loadPlan();
    const response = await PUT(request("PUT", path, body), params({ sessionId }));
    expect(response.status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
  });

  it("crea con 201, repite con 200 y pasa el cuerpo validado al servicio", async () => {
    mocks.savePlan.mockResolvedValueOnce({ id: blockId, revision: 1, replayed: false });
    mocks.savePlan.mockResolvedValueOnce({ id: blockId, revision: 1, replayed: true });
    const { PUT } = await loadPlan();
    const created = await PUT(request("PUT", path, planBody), params({ sessionId }));
    const replayed = await PUT(request("PUT", path, planBody), params({ sessionId }));
    expect(created.status).toBe(201);
    expect(replayed.status).toBe(200);
    expect(created.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.scope).toHaveBeenCalledWith(expect.objectContaining({ surface: "coach_operations", locationId }));
    expect(mocks.savePlan).toHaveBeenCalledWith({
      actor: { userId: mocks.user!.id, memberId },
      sessionId,
      command: expect.objectContaining({ clientRequestId, focus: "Rondada", source: "manual" }),
    });
  });

  it("traduce el solo lectura del plan a 409 sin caché", async () => {
    mocks.savePlan.mockRejectedValue(new OperationalError("PLAN_OVER_CAPACITY", "Solo lectura", 409));
    const { PUT } = await loadPlan();
    const response = await PUT(request("PUT", path, planBody), params({ sessionId }));
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("PUT bloque hecho", () => {
  const path = `/api/v1/owner/sessions/${sessionId}/plan/blocks/${blockId}`;
  const body = { organizationId, locationId, done: true };

  it("exige sesión, mismo origen y un cuerpo válido", async () => {
    const { PUT } = await loadBlock();
    mocks.user = null;
    expect((await PUT(request("PUT", path, body), params({ sessionId, blockId }))).status).toBe(401);
    mocks.user = { id: "c0000000-0000-4000-8000-000000000001" };
    expect((await PUT(request("PUT", path, body, "https://evil.example"), params({ sessionId, blockId }))).status).toBe(403);
    expect((await PUT(request("PUT", path, { organizationId, locationId }), params({ sessionId, blockId }))).status).toBe(400);
    expect(mocks.markBlock).not.toHaveBeenCalled();
  });

  it("marca el bloque con la superficie operativa", async () => {
    mocks.markBlock.mockResolvedValue({ id: blockId, done: true, replayed: false });
    const { PUT } = await loadBlock();
    const response = await PUT(request("PUT", path, body), params({ sessionId, blockId }));
    expect(response.status).toBe(200);
    expect(mocks.scope).toHaveBeenCalledWith(expect.objectContaining({ surface: "coach_operations" }));
    expect(mocks.markBlock).toHaveBeenCalledWith({
      actor: { userId: mocks.user!.id, memberId },
      sessionId,
      blockId,
      command: body,
    });
  });
});

describe("plantilla de plan de la clase", () => {
  const getPath = `/api/v1/owner/classes/${classTemplateId}/plan-template?organizationId=${organizationId}&locationId=${locationId}`;
  const putPath = `/api/v1/owner/classes/${classTemplateId}/plan-template`;
  const body = { organizationId, locationId, expectedRevision: null, focus: "Barra", blocks: [] };

  it("usa la superficie de gestión (sin coach_operations) al leer y al guardar", async () => {
    mocks.getTemplate.mockResolvedValue({ classTemplateId, template: null });
    mocks.saveTemplate.mockResolvedValue({ id: classTemplateId, revision: 1, replayed: false });
    const { GET, PUT } = await loadTemplate();
    expect((await GET(request("GET", getPath), params({ classTemplateId }))).status).toBe(200);
    expect((await PUT(request("PUT", putPath, body), params({ classTemplateId }))).status).toBe(201);
    for (const [call] of mocks.scope.mock.calls) {
      expect(call).toEqual({ userId: mocks.user!.id, organizationId, locationId });
    }
    expect(mocks.scope).toHaveBeenCalledTimes(2);
  });

  it("si el alcance deniega al entrenador no llega al servicio", async () => {
    mocks.scope.mockRejectedValue(new OperationalError("FORBIDDEN", "No", 403));
    const { GET, PUT } = await loadTemplate();
    expect((await GET(request("GET", getPath), params({ classTemplateId }))).status).toBe(403);
    expect((await PUT(request("PUT", putPath, body), params({ classTemplateId }))).status).toBe(403);
    expect(mocks.getTemplate).not.toHaveBeenCalled();
    expect(mocks.saveTemplate).not.toHaveBeenCalled();
  });

  it("rechaza otro origen y bloques con identificador", async () => {
    const { PUT } = await loadTemplate();
    expect((await PUT(request("PUT", putPath, body, "https://evil.example"), params({ classTemplateId }))).status).toBe(403);
    const withId = { ...body, blocks: [{ id: blockId, kind: "warmup", content: "x" }] };
    expect((await PUT(request("PUT", putPath, withId), params({ classTemplateId }))).status).toBe(400);
    expect(mocks.saveTemplate).not.toHaveBeenCalled();
  });
});
