import { beforeEach, describe, expect, it, vi } from "vitest";

import { OperationalError } from "@/modules/shared/domain/operational-error";

const mocks = vi.hoisted(() => ({
  user: { id: "c0000000-0000-4000-8000-000000000001" } as { id: string } | null,
  scope: vi.fn(),
  rateLimit: vi.fn(),
  getProgress: vi.fn(),
  createObjective: vi.fn(),
  changeStatus: vi.fn(),
  createObservation: vi.fn(),
  updateObservation: vi.fn(),
  sessionObservation: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.scope }));
vi.mock("@/modules/athlete-progress/application/athlete-progress-service", () => ({
  getAthleteProgress: mocks.getProgress,
  createAthleteObjective: mocks.createObjective,
  changeAthleteObjectiveStatus: mocks.changeStatus,
  createAthleteObservation: mocks.createObservation,
  updateAthleteObservation: mocks.updateObservation,
  createSessionObservation: mocks.sessionObservation,
}));

const organizationId = "a0000000-0000-4000-8000-000000000001";
const locationId = "a0000000-0000-4000-8000-000000000002";
const athleteId = "a0000000-0000-4000-8000-000000000003";
const objectiveId = "a0000000-0000-4000-8000-000000000004";
const observationId = "a0000000-0000-4000-8000-000000000005";
const sessionId = "a0000000-0000-4000-8000-000000000006";
const enrollmentId = "a0000000-0000-4000-8000-000000000007";
const clientRequestId = "a0000000-0000-4000-8000-000000000008";
const memberId = "a0000000-0000-4000-8000-000000000009";

const loadProgress = () => import("@/app/api/v1/owner/athletes/[athleteId]/progress/route");
const loadObjectives = () => import("@/app/api/v1/owner/athletes/[athleteId]/objectives/route");
const loadStatus = () => import("@/app/api/v1/owner/athletes/[athleteId]/objectives/[objectiveId]/status/route");
const loadObservations = () => import("@/app/api/v1/owner/athletes/[athleteId]/observations/route");
const loadObservation = () => import("@/app/api/v1/owner/athletes/[athleteId]/observations/[observationId]/route");
const loadSessionObservations = () => import("@/app/api/v1/owner/sessions/[sessionId]/observations/route");

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

beforeEach(() => {
  mocks.user = { id: "c0000000-0000-4000-8000-000000000001" };
  for (const mock of [
    mocks.scope,
    mocks.rateLimit,
    mocks.getProgress,
    mocks.createObjective,
    mocks.changeStatus,
    mocks.createObservation,
    mocks.updateObservation,
    mocks.sessionObservation,
  ]) {
    mock.mockReset();
  }
  mocks.scope.mockResolvedValue({ organization: { id: organizationId }, member: { id: memberId } });
  mocks.rateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
});

describe("GET progreso de una gimnasta", () => {
  const path = `/api/v1/owner/athletes/${athleteId}/progress?organizationId=${organizationId}&locationId=${locationId}`;

  it("exige sesión y no consulta nada sin ella", async () => {
    mocks.user = null;
    const { GET } = await loadProgress();
    const response = await GET(request("GET", path), params({ athleteId }));
    expect(response.status).toBe(401);
    expect(mocks.scope).not.toHaveBeenCalled();
  });

  it("valida la consulta antes de resolver el alcance", async () => {
    const { GET } = await loadProgress();
    const response = await GET(
      request("GET", `/api/v1/owner/athletes/${athleteId}/progress?organizationId=${organizationId}`),
      params({ athleteId })
    );
    expect(response.status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
  });

  it("resuelve la superficie operativa con la sede pedida y no guarda en caché", async () => {
    mocks.getProgress.mockResolvedValue({ athlete: { id: athleteId }, objectives: [], observations: [], canWrite: true });
    const { GET } = await loadProgress();
    const response = await GET(request("GET", path), params({ athleteId }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.scope).toHaveBeenCalledWith({
      userId: mocks.user!.id,
      organizationId,
      locationId,
      surface: "coach_operations",
    });
    expect(mocks.getProgress).toHaveBeenCalledWith({
      actor: { userId: mocks.user!.id, memberId },
      athleteId,
      query: { organizationId, locationId },
    });
  });

  it("un entrenador fuera de su sede recibe 403 sin llegar al servicio", async () => {
    mocks.scope.mockRejectedValue(new OperationalError("LOCATION_SCOPE_DENIED", "Sede fuera de alcance", 403));
    const { GET } = await loadProgress();
    const response = await GET(request("GET", path), params({ athleteId }));
    expect(response.status).toBe(403);
    expect(mocks.getProgress).not.toHaveBeenCalled();
  });

  it("sin la migración candidata responde 503 «no disponible», nunca 500", async () => {
    mocks.getProgress.mockRejectedValue(
      new OperationalError("FEATURE_NOT_AVAILABLE", "Los objetivos y observaciones todavía no están activados en esta academia.", 503)
    );
    const { GET } = await loadProgress();
    const response = await GET(request("GET", path), params({ athleteId }));
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect((await response.json()).detail).toMatch(/todavía no están activados/);
  });

  it("respeta el límite de peticiones", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false, limit: 100, remaining: 0, reset: Math.floor(Date.now() / 1000) + 60 });
    const { GET } = await loadProgress();
    const response = await GET(request("GET", path), params({ athleteId }));
    expect(response.status).toBe(429);
    expect(mocks.getProgress).not.toHaveBeenCalled();
  });
});

describe("escrituras", () => {
  const objectiveBody = { organizationId, locationId, clientRequestId, title: "Rueda sin manos", discipline: null, apparatus: null, targetDate: null };

  it("rechazan otro origen antes de leer el cuerpo o el alcance", async () => {
    const { POST } = await loadObjectives();
    const response = await POST(
      request("POST", `/api/v1/owner/athletes/${athleteId}/objectives`, objectiveBody, "https://evil.test"),
      params({ athleteId })
    );
    expect(response.status).toBe(403);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(mocks.createObjective).not.toHaveBeenCalled();
  });

  it("crea un objetivo con 201 y responde 200 al repetir la misma petición", async () => {
    const { POST } = await loadObjectives();
    mocks.createObjective.mockResolvedValueOnce({ id: objectiveId, revision: 1, replayed: false });
    mocks.createObjective.mockResolvedValueOnce({ id: objectiveId, revision: 1, replayed: true });
    const first = await POST(request("POST", `/api/v1/owner/athletes/${athleteId}/objectives`, objectiveBody), params({ athleteId }));
    const replay = await POST(request("POST", `/api/v1/owner/athletes/${athleteId}/objectives`, objectiveBody), params({ athleteId }));
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(mocks.createObjective).toHaveBeenCalledWith({
      actor: { userId: mocks.user!.id, memberId },
      athleteId,
      command: objectiveBody,
    });
  });

  it("rechaza un aparato que no es de la disciplina con 400", async () => {
    const { POST } = await loadObjectives();
    const response = await POST(
      request("POST", `/api/v1/owner/athletes/${athleteId}/objectives`, { ...objectiveBody, discipline: "gam", apparatus: "beam" }),
      params({ athleteId })
    );
    expect(response.status).toBe(400);
    expect(mocks.createObjective).not.toHaveBeenCalled();
  });

  it("propaga el bloqueo de solo lectura del plan como 409", async () => {
    mocks.changeStatus.mockRejectedValue(new OperationalError("PLAN_OVER_CAPACITY", "Solo lectura", 409));
    const { POST } = await loadStatus();
    const response = await POST(
      request("POST", `/api/v1/owner/athletes/${athleteId}/objectives/${objectiveId}/status`, {
        organizationId,
        locationId,
        expectedRevision: 1,
        status: "achieved",
      }),
      params({ athleteId, objectiveId })
    );
    expect(response.status).toBe(409);
    expect(mocks.changeStatus).toHaveBeenCalledWith(expect.objectContaining({ athleteId, objectiveId }));
  });

  it("crea y edita observaciones con los ids de la ruta", async () => {
    mocks.createObservation.mockResolvedValue({ id: observationId, revision: 1, replayed: false });
    mocks.updateObservation.mockResolvedValue({ id: observationId, revision: 2, replayed: false });
    const created = await (await loadObservations()).POST(
      request("POST", `/api/v1/owner/athletes/${athleteId}/observations`, {
        organizationId,
        locationId,
        clientRequestId,
        body: "Buena entrada",
        observedOn: null,
        sessionId: null,
        objectiveId: null,
      }),
      params({ athleteId })
    );
    const updated = await (await loadObservation()).PATCH(
      request("PATCH", `/api/v1/owner/athletes/${athleteId}/observations/${observationId}`, {
        organizationId,
        locationId,
        expectedRevision: 1,
        body: "Buena entrada en barra",
        visibility: "family",
      }),
      params({ athleteId, observationId })
    );
    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(mocks.updateObservation).toHaveBeenCalledWith(expect.objectContaining({ athleteId, observationId }));
  });

  it("el acceso rápido de Pasar lista identifica a la gimnasta por la inscripción, no por el cuerpo", async () => {
    mocks.sessionObservation.mockResolvedValue({ id: observationId, revision: 1, replayed: false, athleteId });
    const { POST } = await loadSessionObservations();
    const rejected = await POST(
      request("POST", `/api/v1/owner/sessions/${sessionId}/observations`, {
        organizationId,
        locationId,
        enrollmentId,
        clientRequestId,
        body: "Llega cansada",
        athleteId,
      }),
      params({ sessionId })
    );
    expect(rejected.status).toBe(400);
    const response = await POST(
      request("POST", `/api/v1/owner/sessions/${sessionId}/observations`, {
        organizationId,
        locationId,
        enrollmentId,
        clientRequestId,
        body: "Llega cansada",
      }),
      params({ sessionId })
    );
    expect(response.status).toBe(201);
    expect(mocks.sessionObservation).toHaveBeenCalledWith({
      actor: { userId: mocks.user!.id, memberId },
      sessionId,
      command: { organizationId, locationId, enrollmentId, clientRequestId, body: "Llega cansada", visibility: "team" },
    });
  });
});
