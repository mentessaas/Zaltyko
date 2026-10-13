import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH as changeEnrollment } from "@/app/api/v1/owner/enrollments/[enrollmentId]/route";
import {
  GET as searchCandidates,
  POST as createEnrollmentRoute,
} from "@/app/api/v1/owner/enrollments/route";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/rate-limit";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  createEnrollment,
  transitionEnrollment,
} from "@/modules/enrollments/application/enrollment-service";
import { searchOwnerEnrollmentCandidates } from "@/modules/enrollments/application/enrollment-query-service";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: vi.fn(() => ({ limit: 30, window: 60 })),
  getVerifiedTenantRateLimitIdentifier: vi.fn(() => "verified-tenant"),
  rateLimit: vi.fn(),
  rateLimitExceededResponse: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));
vi.mock("@/modules/enrollments/application/enrollment-service", () => ({
  createEnrollment: vi.fn(),
  transitionEnrollment: vi.fn(),
}));
vi.mock("@/modules/enrollments/application/enrollment-query-service", () => ({
  searchOwnerEnrollmentCandidates: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const organizationId = "10000000-0000-4000-8000-000000000003";
const locationId = "10000000-0000-4000-8000-000000000004";
const athleteId = "10000000-0000-4000-8000-000000000005";
const classTemplateId = "10000000-0000-4000-8000-000000000006";
const enrollmentId = "10000000-0000-4000-8000-000000000007";

const ownerScope = {
  organization: {
    id: organizationId,
    name: "Academia Sintética",
    defaultCurrency: "EUR",
  },
  member: { id: memberId, role: "manager", locationScopeMode: "selected" },
  locations: [{ id: locationId, name: "Sede Centro" }],
  selectedLocationId: locationId,
  canViewOrganizationAggregate: false,
};

function request(
  path: string,
  body?: unknown,
  method = "POST",
  idempotencyKey = "enrollment-command-001"
) {
  return new Request("https://zaltyko.test" + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const createBody = {
  organizationId,
  locationId,
  athleteId,
  classTemplateId,
  startsOn: "2026-10-13",
};

describe("API owner de inscripciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: userId });
    vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope);
    vi.mocked(rateLimit).mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: 1_800_000_000,
    });
    vi.mocked(createEnrollment).mockResolvedValue({
      id: enrollmentId,
      status: "pending",
      startsOn: createBody.startsOn,
      version: 1,
    } as never);
    vi.mocked(transitionEnrollment).mockResolvedValue({
      id: enrollmentId,
      status: "active",
      startsOn: createBody.startsOn,
      endsOn: null,
      version: 2,
    } as never);
    vi.mocked(searchOwnerEnrollmentCandidates).mockResolvedValue([
      { id: athleteId, name: "Luz Sintética" },
    ]);
  });

  afterEach(() => vi.clearAllMocks());

  it("busca candidatos con el tenant, sede y clase solicitados", async () => {
    const response = await searchCandidates(
      new Request(
        "https://zaltyko.test/api/v1/owner/enrollments?organizationId=" +
          organizationId +
          "&locationId=" +
          locationId +
          "&classTemplateId=" +
          classTemplateId +
          "&q=Luz"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload.data.items).toEqual([
      { id: athleteId, name: "Luz Sintética" },
    ]);
    expect(searchOwnerEnrollmentCandidates).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
      classTemplateId,
      query: "Luz",
    });
  });

  it("requiere sesión antes de buscar o mutar datos", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const searchResponse = await searchCandidates(
      new Request(
        "https://zaltyko.test/api/v1/owner/enrollments?organizationId=" +
          organizationId +
          "&locationId=" +
          locationId +
          "&classTemplateId=" +
          classTemplateId +
          "&q=Lu"
      )
    );
    const createResponse = await createEnrollmentRoute(
      request("/api/v1/owner/enrollments", createBody)
    );

    expect(searchResponse.status).toBe(401);
    expect(createResponse.status).toBe(401);
    expect(resolveOwnerScope).not.toHaveBeenCalled();
    expect(searchOwnerEnrollmentCandidates).not.toHaveBeenCalled();
    expect(createEnrollment).not.toHaveBeenCalled();
  });

  it("crea siempre una inscripción pendiente y deriva el actor de la sesión", async () => {
    const response = await createEnrollmentRoute(
      request("/api/v1/owner/enrollments", createBody)
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(createEnrollment).toHaveBeenCalledWith({
      ...createBody,
      status: "pending",
      source: "owner",
      sourceEntityId: null,
      pricePlanId: null,
      idempotencyKey: "enrollment-command-001",
      actor: { userId, memberId },
    });
  });

  it("rechaza campos de actor/estado del cliente y exige clave idempotente", async () => {
    const forgedActor = await createEnrollmentRoute(
      request("/api/v1/owner/enrollments", {
        ...createBody,
        status: "active",
        actor: { userId, memberId },
      })
    );
    const missingKey = await createEnrollmentRoute(
      request("/api/v1/owner/enrollments", createBody, "POST", "")
    );

    expect(forgedActor.status).toBe(400);
    expect(missingKey.status).toBe(400);
    expect(createEnrollment).not.toHaveBeenCalled();
  });

  it("actualiza estado con versión, fecha y clave idempotente", async () => {
    const response = await changeEnrollment(
      request(
        "/api/v1/owner/enrollments/" + enrollmentId,
        {
          organizationId,
          expectedVersion: 1,
          toStatus: "active",
          effectiveOn: "2026-10-13",
        },
        "PATCH"
      ),
      { params: Promise.resolve({ enrollmentId }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(transitionEnrollment).toHaveBeenCalledWith({
      organizationId,
      enrollmentId,
      expectedVersion: 1,
      toStatus: "active",
      effectiveOn: "2026-10-13",
      reasonCode: null,
      idempotencyKey: "enrollment-command-001",
      actor: { userId, memberId },
    });
  });

  it("no expone transiciones de prueba sin el flujo específico de trials", async () => {
    const response = await changeEnrollment(
      request(
        "/api/v1/owner/enrollments/" + enrollmentId,
        {
          organizationId,
          expectedVersion: 1,
          toStatus: "trial",
          effectiveOn: "2026-10-13",
        },
        "PATCH"
      ),
      { params: Promise.resolve({ enrollmentId }) }
    );

    expect(response.status).toBe(400);
    expect(transitionEnrollment).not.toHaveBeenCalled();
  });
});
