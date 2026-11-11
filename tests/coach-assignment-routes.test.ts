import { beforeEach, describe, expect, it, vi } from "vitest";

import { OperationalError } from "@/modules/shared/domain/operational-error";

const mocks = vi.hoisted(() => ({
  user: { id: "c0000000-0000-4000-8000-000000000001" } as { id: string } | null,
  scope: vi.fn(),
  sessionAccess: vi.fn(),
  rateLimit: vi.fn(),
  getClass: vi.fn(),
  setClass: vi.fn(),
  getSession: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.scope }));
vi.mock("@/modules/attendance/application/owner-session-attendance", () => ({
  resolveSessionAttendanceAccess: mocks.sessionAccess,
}));
vi.mock("@/modules/coach-assignment/application/coach-assignment-service", () => ({
  getClassCoaches: mocks.getClass,
  setClassCoaches: mocks.setClass,
  getSessionCoaches: mocks.getSession,
  setSessionCoaches: mocks.setSession,
}));

const organizationId = "a0000000-0000-4000-8000-000000000001";
const locationId = "a0000000-0000-4000-8000-000000000002";
const classTemplateId = "a0000000-0000-4000-8000-000000000003";
const sessionId = "a0000000-0000-4000-8000-000000000004";
const clientRequestId = "a0000000-0000-4000-8000-000000000005";
const memberId = "a0000000-0000-4000-8000-000000000006";
const coachProfile = "a0000000-0000-4000-8000-000000000007";

const loadClass = () => import("@/app/api/v1/owner/classes/[classTemplateId]/coaches/route");
const loadSession = () => import("@/app/api/v1/owner/sessions/[sessionId]/coaches/route");

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

const classBody = {
  organizationId,
  locationId,
  clientRequestId,
  staffProfileIds: [coachProfile],
  expectedStaffProfileIds: [],
};
const sessionBody = { ...classBody, reason: "absence" };

beforeEach(() => {
  mocks.user = { id: "c0000000-0000-4000-8000-000000000001" };
  for (const mock of [mocks.scope, mocks.sessionAccess, mocks.rateLimit, mocks.getClass, mocks.setClass, mocks.getSession, mocks.setSession]) {
    mock.mockReset();
  }
  mocks.scope.mockResolvedValue({ organization: { id: organizationId }, member: { id: memberId } });
  mocks.sessionAccess.mockResolvedValue({ organizationId, memberId, role: "coach" });
  mocks.rateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
});

describe("titulares de una clase", () => {
  it("pide sesión iniciada antes de validar nada", async () => {
    mocks.user = null;
    const { GET, PUT } = await loadClass();
    const read = await GET(request("GET", `/api/v1/owner/classes/${classTemplateId}/coaches?organizationId=${organizationId}`), params({ classTemplateId }));
    const write = await PUT(request("PUT", `/api/v1/owner/classes/${classTemplateId}/coaches`, classBody), params({ classTemplateId }));
    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
    expect(mocks.scope).not.toHaveBeenCalled();
  });

  it("lee con la superficie de gestión; la sede es opcional en la consulta", async () => {
    mocks.getClass.mockResolvedValue({ classTemplateId, titulars: [], eligible: [], canWrite: true });
    const { GET } = await loadClass();
    const response = await GET(
      request("GET", `/api/v1/owner/classes/${classTemplateId}/coaches?organizationId=${organizationId}`),
      params({ classTemplateId })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.scope).toHaveBeenCalledWith({ userId: mocks.user!.id, organizationId });
    expect(mocks.getClass).toHaveBeenCalledWith({
      actor: { userId: mocks.user!.id, memberId },
      classTemplateId,
      query: { organizationId },
    });
    expect((await response.json()).data.classTemplateId).toBe(classTemplateId);
  });

  it("rechaza otro origen antes de validar o resolver el alcance", async () => {
    const { PUT } = await loadClass();
    const response = await PUT(
      request("PUT", `/api/v1/owner/classes/${classTemplateId}/coaches`, classBody, "https://evil.test"),
      params({ classTemplateId })
    );
    expect(response.status).toBe(403);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(mocks.setClass).not.toHaveBeenCalled();
  });

  it("valida el cuerpo: ids repetidos o demasiadas personas", async () => {
    const { PUT } = await loadClass();
    const repeated = await PUT(
      request("PUT", `/api/v1/owner/classes/${classTemplateId}/coaches`, { ...classBody, staffProfileIds: [coachProfile, coachProfile] }),
      params({ classTemplateId })
    );
    const invalidId = await PUT(
      request("PUT", `/api/v1/owner/classes/not-a-uuid/coaches`, classBody),
      params({ classTemplateId: "not-a-uuid" })
    );
    expect(repeated.status).toBe(400);
    expect(invalidId.status).toBe(400);
    expect(mocks.setClass).not.toHaveBeenCalled();
  });

  it("un entrenador recibe 403 del alcance de gestión y el servicio no se llama", async () => {
    mocks.scope.mockRejectedValue(new OperationalError("FORBIDDEN", "Sin acceso a la superficie Owner", 403));
    const { PUT } = await loadClass();
    const response = await PUT(request("PUT", `/api/v1/owner/classes/${classTemplateId}/coaches`, classBody), params({ classTemplateId }));
    expect(response.status).toBe(403);
    expect(mocks.setClass).not.toHaveBeenCalled();
  });

  it.each([
    [new OperationalError("FEATURE_NOT_AVAILABLE", "No activada", 503, { reason: "coach_assignment_storage_unavailable" }), 503],
    [new OperationalError("PLAN_OVER_CAPACITY", "Solo lectura", 409), 409],
    [new OperationalError("VERSION_CONFLICT", "Otra persona cambió las entrenadoras", 409), 409],
    [new OperationalError("INVALID_RELATION", "Solo puedes asignar entrenadoras del equipo con acceso a esta sede.", 422), 422],
  ])("traduce los errores del servicio a problem+json sin 500 (%#)", async (error, status) => {
    mocks.setClass.mockRejectedValue(error);
    const { PUT } = await loadClass();
    const response = await PUT(request("PUT", `/api/v1/owner/classes/${classTemplateId}/coaches`, classBody), params({ classTemplateId }));
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    const payload = await response.json();
    expect(payload.detail).toBe(error.message);
    if (status === 503) expect(payload.errors).toEqual({ reason: "coach_assignment_storage_unavailable" });
  });

  it("respeta el límite de peticiones", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false, limit: 1, remaining: 0, reset: Math.floor(Date.now() / 1000) + 60 });
    const { PUT } = await loadClass();
    const response = await PUT(request("PUT", `/api/v1/owner/classes/${classTemplateId}/coaches`, classBody), params({ classTemplateId }));
    expect(response.status).toBe(429);
    expect(mocks.setClass).not.toHaveBeenCalled();
  });
});

describe("entrenadoras de una sesión", () => {
  it("la lectura usa el acceso de Pasar lista, que admite a la entrenadora en su sede", async () => {
    mocks.getSession.mockResolvedValue({ sessionId, coaches: [], canWrite: false });
    const { GET } = await loadSession();
    const response = await GET(
      request("GET", `/api/v1/owner/sessions/${sessionId}/coaches?organizationId=${organizationId}&locationId=${locationId}`),
      params({ sessionId })
    );
    expect(response.status).toBe(200);
    expect(mocks.sessionAccess).toHaveBeenCalledWith({ userId: mocks.user!.id, organizationId, locationId, sessionId });
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(mocks.getSession).toHaveBeenCalledWith({
      actor: { userId: mocks.user!.id, memberId },
      sessionId,
      query: { organizationId, locationId },
    });
  });

  it("una sesión de otra sede responde 404 a la entrenadora", async () => {
    mocks.sessionAccess.mockRejectedValue(new OperationalError("NOT_FOUND", "Sesión no encontrada", 404));
    const { GET } = await loadSession();
    const response = await GET(
      request("GET", `/api/v1/owner/sessions/${sessionId}/coaches?organizationId=${organizationId}&locationId=${locationId}`),
      params({ sessionId })
    );
    expect(response.status).toBe(404);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("la consulta exige la sede", async () => {
    const { GET } = await loadSession();
    const response = await GET(
      request("GET", `/api/v1/owner/sessions/${sessionId}/coaches?organizationId=${organizationId}`),
      params({ sessionId })
    );
    expect(response.status).toBe(400);
    expect(mocks.sessionAccess).not.toHaveBeenCalled();
  });

  it("cambiar la sesión exige la superficie de gestión, nunca el acceso de Pasar lista", async () => {
    mocks.setSession.mockResolvedValue({ sessionId, coaches: [], substitution: null, replayed: false });
    const { PUT } = await loadSession();
    const response = await PUT(request("PUT", `/api/v1/owner/sessions/${sessionId}/coaches`, sessionBody), params({ sessionId }));
    expect(response.status).toBe(200);
    expect(mocks.scope).toHaveBeenCalledWith({ userId: mocks.user!.id, organizationId, locationId });
    expect(mocks.sessionAccess).not.toHaveBeenCalled();
    expect(mocks.setSession).toHaveBeenCalledWith({
      actor: { userId: mocks.user!.id, memberId },
      sessionId,
      command: sessionBody,
    });
  });

  it("rechaza un motivo de texto libre", async () => {
    const { PUT } = await loadSession();
    const response = await PUT(
      request("PUT", `/api/v1/owner/sessions/${sessionId}/coaches`, { ...sessionBody, reason: "Baja por lesión" }),
      params({ sessionId })
    );
    expect(response.status).toBe(400);
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it("un entrenador no puede sustituir", async () => {
    mocks.scope.mockRejectedValue(new OperationalError("FORBIDDEN", "Sin acceso a la superficie Owner", 403));
    const { PUT } = await loadSession();
    const response = await PUT(request("PUT", `/api/v1/owner/sessions/${sessionId}/coaches`, sessionBody), params({ sessionId }));
    expect(response.status).toBe(403);
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
});
