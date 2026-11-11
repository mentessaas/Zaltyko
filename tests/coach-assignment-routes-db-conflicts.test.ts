import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Rutas de asignación con el SERVICIO REAL y la base simulada: la
 * transacción aborta como lo haría PostgreSQL (con Drizzle y node-postgres el
 * código llega en `cause`). Cada ruta debe responder 409 reintentable, nunca
 * 500. Complementa tests/coach-assignment-routes.test.ts, que simula el
 * servicio.
 */
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  scope: vi.fn(),
  sessionAccess: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => ({ id: "c0000000-0000-4000-8000-000000000001" }),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: async () => ({ success: true, limit: 100, remaining: 99, reset: 0 }),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.scope }));
vi.mock("@/modules/attendance/application/owner-session-attendance", () => ({
  resolveSessionAttendanceAccess: mocks.sessionAccess,
}));

import { GET as getClass, PUT as putClass } from "@/app/api/v1/owner/classes/[classTemplateId]/coaches/route";
import { GET as getSession, PUT as putSession } from "@/app/api/v1/owner/sessions/[sessionId]/coaches/route";

const organizationId = "b0000000-0000-4000-8000-000000000001";
const locationId = "b0000000-0000-4000-8000-000000000002";
const classTemplateId = "b0000000-0000-4000-8000-000000000003";
const sessionId = "b0000000-0000-4000-8000-000000000004";
const memberId = "b0000000-0000-4000-8000-000000000005";
const clientRequestId = "b0000000-0000-4000-8000-000000000006";
const body = { organizationId, locationId, clientRequestId, staffProfileIds: [], expectedStaffProfileIds: [] };

function request(method: string, path: string, payload?: unknown) {
  return new Request(new URL(path, "https://zaltyko.test"), {
    method,
    headers: { origin: "https://zaltyko.test", "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

function postgresAbort(code: string, wrapped: boolean): Error {
  const pg = Object.assign(new Error("deadlock detected"), { code });
  return wrapped ? Object.assign(new Error("Failed query: select ..."), { cause: pg }) : pg;
}

beforeEach(() => {
  mocks.transaction.mockReset();
  mocks.scope.mockReset().mockResolvedValue({ organization: { id: organizationId }, member: { id: memberId } });
  mocks.sessionAccess.mockReset().mockResolvedValue({ organizationId, memberId, role: "owner" });
});

const routes = [
  ["GET clase", () => getClass(request("GET", `/api/v1/owner/classes/${classTemplateId}/coaches?organizationId=${organizationId}`), { params: Promise.resolve({ classTemplateId }) })],
  ["PUT clase", () => putClass(request("PUT", `/api/v1/owner/classes/${classTemplateId}/coaches`, body), { params: Promise.resolve({ classTemplateId }) })],
  ["GET sesión", () => getSession(request("GET", `/api/v1/owner/sessions/${sessionId}/coaches?organizationId=${organizationId}&locationId=${locationId}`), { params: Promise.resolve({ sessionId }) })],
  ["PUT sesión", () => putSession(request("PUT", `/api/v1/owner/sessions/${sessionId}/coaches`, { ...body, reason: null }), { params: Promise.resolve({ sessionId }) })],
] as const;

describe("rutas de asignación con el servicio real ante abortos de PostgreSQL", () => {
  for (const [label, call] of routes) {
    for (const wrapped of [true, false]) {
      it.each(["40P01", "40001", "55P03"])(`${label}: %s ${wrapped ? "en cause" : "directo"} → 409 reintentable`, async (code) => {
        mocks.transaction.mockImplementation(async () => {
          throw postgresAbort(code, wrapped);
        });
        const response = await call();
        expect(mocks.transaction).toHaveBeenCalledOnce();
        expect(response.status).toBe(409);
        const problem = await response.json();
        expect(problem).toMatchObject({
          type: "https://zaltyko.com/problems/concurrency-retry",
          status: 409,
          errors: { retryable: true },
        });
        // Lo tradujo el servicio (inAssignmentTransaction), no la red de la ruta.
        expect(problem.detail).toBe("Otra operación estaba cambiando estas entrenadoras a la vez. Vuelve a intentarlo.");
      });
    }
  }
});

describe("un error de base de datos no reintentable no se disfraza de 409", () => {
  for (const [label, call] of routes) {
    it(`${label}: un 23505 que sale del servicio real se propaga (no 409)`, async () => {
      const failure = postgresAbort("23505", true);
      mocks.transaction.mockImplementation(async () => {
        throw failure;
      });
      let thrown: unknown;
      let response: Response | undefined;
      try {
        response = await call();
      } catch (error) {
        thrown = error;
      }
      expect(mocks.transaction).toHaveBeenCalledOnce();
      expect(response).toBeUndefined();
      expect(thrown).toBe(failure);
    });
  }
});

