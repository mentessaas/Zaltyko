import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  assign: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.currentUser,
}));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 30, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: (
    _request: Request,
    organizationId: string
  ) => `verified:${organizationId}`,
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: () =>
    new Response(JSON.stringify({ ok: false }), { status: 429 }),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.ownerScope,
}));
vi.mock("@/modules/saas-billing/application/owner-access", () => ({
  hasSameOrigin: (request: Request) =>
    request.headers.get("origin") === new URL(request.url).origin,
}));
vi.mock("@/modules/athletes/application/owner-athlete-intake", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/modules/athletes/application/owner-athlete-intake")
  >();
  return {
    ...original,
    getOwnerAthleteIntake: mocks.list,
    createOwnerAthleteIntake: mocks.create,
    assignOwnerAthleteToFirstGroup: mocks.assign,
  };
});

import {
  GET as getIntake,
  POST as createIntake,
} from "@/app/api/v1/owner/athlete-intake/route";
import { POST as assignAthlete } from "@/app/api/v1/owner/athlete-intake/[athleteId]/assign/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const athleteId = "10000000-0000-4000-8000-000000000002";
const groupId = "10000000-0000-4000-8000-000000000003";
const userId = "10000000-0000-4000-8000-000000000004";
const memberId = "10000000-0000-4000-8000-000000000005";
const idempotencyKey = "owner-athlete-intake-001";
const scope = {
  organization: { id: organizationId, name: "QA Academy" },
  member: { id: memberId, role: "owner", locationScopeMode: "all" },
};

function request(
  path: string,
  method: "GET" | "POST",
  payload?: unknown,
  options: { origin?: string; key?: string } = {}
) {
  return new Request(`https://sandbox.invalid${path}`, {
    method,
    headers: {
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
      ...(options.origin === undefined ? { origin: "https://sandbox.invalid" } : { origin: options.origin }),
      ...(options.key === "" ? {} : { "idempotency-key": options.key ?? idempotencyKey }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue(scope);
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.list.mockResolvedValue({ items: [], eligibleGroups: [], total: 0, page: 1, pageSize: 50, hasMore: false });
  mocks.create.mockResolvedValue({ athleteId, familyId: groupId, incompleteFamily: true, replayed: false });
  mocks.assign.mockResolvedValue({ athleteId, groupId, membershipId: userId, startsOn: "2026-10-25", replayed: false });
});

describe("rutas HTTP de intake organizativo", () => {
  it("requiere autenticación y rechaza filtros no organizativos o campos extra", async () => {
    mocks.currentUser.mockResolvedValueOnce(null);
    const unauthenticated = await getIntake(
      request(`/api/v1/owner/athlete-intake?organizationId=${organizationId}`, "GET")
    );
    expect(unauthenticated.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();

    const invalidQuery = await getIntake(
      request(`/api/v1/owner/athlete-intake?organizationId=${organizationId}&locationId=${groupId}`, "GET")
    );
    expect(invalidQuery.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();

    const invalidBody = await createIntake(
      request(
        "/api/v1/owner/athlete-intake",
        "POST",
        {
          organizationId,
          givenName: "A",
          familyName: "B",
          family: { kind: "new" },
          role: "owner",
        }
      )
    );
    expect(invalidBody.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("exige mismo origen, clave y Owner/Admin all-sites antes de mutar", async () => {
    const body = {
      organizationId,
      givenName: "A",
      familyName: "B",
      family: { kind: "new", relationship: "parent", startsOn: "2026-10-25" },
    };
    const crossOrigin = await createIntake(
      request("/api/v1/owner/athlete-intake", "POST", body, { origin: "https://other.invalid" })
    );
    expect(crossOrigin.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();

    const missingKey = await createIntake(
      request("/api/v1/owner/athlete-intake", "POST", body, { key: "" })
    );
    expect(missingKey.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();

    mocks.ownerScope.mockResolvedValueOnce({
      ...scope,
      member: { ...scope.member, role: "manager" },
    });
    const manager = await createIntake(
      request("/api/v1/owner/athlete-intake", "POST", body)
    );
    expect(manager.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("deriva actor de la sesión, limita por organización y conserva no-store y replay", async () => {
    mocks.create.mockResolvedValueOnce({ athleteId, familyId: groupId, incompleteFamily: true, replayed: true });
    const response = await createIntake(
      request(
        "/api/v1/owner/athlete-intake",
        "POST",
        {
          organizationId,
          givenName: "A",
          familyName: "B",
          family: { kind: "new", relationship: "parent", startsOn: "2026-10-25" },
        }
      )
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: `verified:${organizationId}` })
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        userId,
        idempotencyKey,
        actor: { userId, memberId },
      })
    );

    const denied = new OperationalError("PLAN_OVER_CAPACITY", "Excedido", 409);
    mocks.create.mockRejectedValueOnce(denied);
    const deniedResponse = await createIntake(
      request(
        "/api/v1/owner/athlete-intake",
        "POST",
        {
          organizationId,
          givenName: "A",
          familyName: "B",
          family: { kind: "new", relationship: "other", startsOn: "2026-10-25" },
        }
      )
    );
    expect(deniedResponse.status).toBe(409);
  });

  it("requiere una asignación explícita y llama solo al comando del grupo indicado", async () => {
    const context = { params: Promise.resolve({ athleteId }) };
    const badOrigin = await assignAthlete(
      request(
        `/api/v1/owner/athlete-intake/${athleteId}/assign`,
        "POST",
        { organizationId, groupId, startsOn: "2026-10-25" },
        { origin: "https://other.invalid" }
      ),
      context
    );
    expect(badOrigin.status).toBe(403);
    expect(mocks.assign).not.toHaveBeenCalled();

    const response = await assignAthlete(
      request(
        `/api/v1/owner/athlete-intake/${athleteId}/assign`,
        "POST",
        { organizationId, groupId, startsOn: "2026-10-25" }
      ),
      context
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.assign).toHaveBeenCalledWith({
      organizationId,
      athleteId,
      groupId,
      startsOn: "2026-10-25",
      userId,
      actor: { userId, memberId },
      idempotencyKey,
    });
  });
});
