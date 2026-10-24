import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  associateOwnerFamily: vi.fn(),
  createEnrollment: vi.fn(),
  searchOwnerEnrollmentCandidates: vi.fn(),
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
vi.mock("@/modules/families/application/owner-family-association", () => ({
  associateOwnerFamily: mocks.associateOwnerFamily,
}));
vi.mock("@/modules/enrollments/application/enrollment-service", () => ({
  createEnrollment: mocks.createEnrollment,
}));
vi.mock("@/modules/enrollments/application/enrollment-query-service", () => ({
  searchOwnerEnrollmentCandidates: mocks.searchOwnerEnrollmentCandidates,
}));

import { POST as associateFamily } from "@/app/api/v1/owner/families/associations/route";
import { POST as enrollAthlete } from "@/app/api/v1/owner/enrollments/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const otherLocationId = "20000000-0000-4000-8000-000000000003";
const athleteId = "30000000-0000-4000-8000-000000000003";
const memberId = "40000000-0000-4000-8000-000000000004";
const userId = "50000000-0000-4000-8000-000000000005";
const idempotencyKey = "owner-family-enrollment-01";

const familyPayload = {
  organizationId,
  locationId,
  athleteIds: [athleteId],
  effectiveFrom: "2026-10-24",
  payer: {
    givenName: "QA",
    familyName: "Guardian",
    relationship: "parent",
  },
};

const enrollmentPayload = {
  organizationId,
  locationId,
  athleteId,
  classTemplateId: "60000000-0000-4000-8000-000000000006",
  startsOn: "2026-10-26",
};

function request(path: string, body: unknown, key = idempotencyKey) {
  return new Request(`https://example.invalid${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue({
    organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
    member: { id: memberId, role: "owner", locationScopeMode: "all" },
  });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.associateOwnerFamily.mockResolvedValue({
    family: { id: "70000000-0000-4000-8000-000000000007" },
    familyPayerId: "80000000-0000-4000-8000-000000000008",
    replayed: false,
  });
  mocks.createEnrollment.mockResolvedValue({
    id: "90000000-0000-4000-8000-000000000009",
    status: "pending",
    startsOn: enrollmentPayload.startsOn,
    pricePlanId: null,
    version: 1,
  });
});

const routes = [
  {
    name: "family association",
    handler: associateFamily,
    path: "/api/v1/owner/families/associations",
    payload: familyPayload,
    service: mocks.associateOwnerFamily,
    expectedCommand: {
      ...familyPayload,
      idempotencyKey,
      actor: { userId, memberId },
    },
    expectedReceipt: {
      familyId: "70000000-0000-4000-8000-000000000007",
      familyPayerId: "80000000-0000-4000-8000-000000000008",
    },
  },
  {
    name: "enrollment",
    handler: enrollAthlete,
    path: "/api/v1/owner/enrollments",
    payload: enrollmentPayload,
    service: mocks.createEnrollment,
    expectedCommand: {
      ...enrollmentPayload,
      status: "pending",
      source: "owner",
      sourceEntityId: null,
      pricePlanId: null,
      idempotencyKey,
      actor: { userId, memberId },
    },
    expectedReceipt: {
      id: "90000000-0000-4000-8000-000000000009",
      status: "pending",
      startsOn: enrollmentPayload.startsOn,
      pricePlanId: null,
      version: 1,
    },
  },
] as const;

describe.each(routes)("Owner $name HTTP boundary", (route) => {
  it("requires the session before parsing or writing", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const malformed = new Request(`https://example.invalid${route.path}`, {
      method: "POST",
      body: "{",
    });

    const response = await route.handler(malformed);

    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(route.service).not.toHaveBeenCalled();
  });

  it("rejects browser-controlled actor and workflow fields", async () => {
    const response = await route.handler(
      request(route.path, {
        ...route.payload,
        actor: { userId, memberId },
        role: "owner",
        status: "active",
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(route.service).not.toHaveBeenCalled();
  });

  it("requires an idempotency key", async () => {
    const response = await route.handler(
      request(route.path, route.payload, "")
    );

    expect(response.status).toBe(400);
    expect(route.service).not.toHaveBeenCalled();
  });

  it("stops before the mutation when site scope is denied", async () => {
    mocks.ownerScope.mockRejectedValueOnce(
      new OperationalError("LOCATION_SCOPE_DENIED", "Site denied", 403)
    );

    const response = await route.handler(
      request(route.path, route.payload)
    );

    expect(response.status).toBe(403);
    expect(route.service).not.toHaveBeenCalled();
  });

  it("does not call the service after a tenant rate-limit rejection", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });

    const response = await route.handler(
      request(route.path, route.payload)
    );

    expect(response.status).toBe(429);
    expect(route.service).not.toHaveBeenCalled();
  });

  it("uses the authenticated actor, validated site and fixed workflow defaults", async () => {
    const response = await route.handler(
      request(route.path, route.payload)
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
    });
    expect(route.service).toHaveBeenCalledWith(route.expectedCommand);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: route.expectedReceipt,
    });
  });
});

describe("Owner enrollment POST site eligibility boundary", () => {
  // Route tests exercise the HTTP contract; the service's SQL eligibility gate
  // and no-write denial are covered in enrollment-site-eligibility.test.ts.
  function mockEnrollmentEligibility(openRelationshipLocationIds: string[]) {
    mocks.createEnrollment.mockImplementationOnce(async (command) => {
      if (!openRelationshipLocationIds.includes(command.locationId)) {
        throw new OperationalError(
          "NOT_FOUND",
          "Atleta activo no encontrado en esta sede",
          404
        );
      }
      return {
        id: "90000000-0000-4000-8000-000000000009",
        status: "pending",
        startsOn: enrollmentPayload.startsOn,
        pricePlanId: null,
        version: 1,
      };
    });
  }

  it(
    "returns the enrollment receipt when an open relationship is at the requested site",
    async () => {
      mockEnrollmentEligibility([locationId]);

      const response = await enrollAthlete(
        request("/api/v1/owner/enrollments", enrollmentPayload)
      );

      expect(response.status).toBe(201);
      expect(mocks.createEnrollment).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId,
          locationId,
          athleteId,
          classTemplateId: enrollmentPayload.classTemplateId,
        })
      );
      expect(await response.json()).toMatchObject({
        ok: true,
        data: {
          id: "90000000-0000-4000-8000-000000000009",
          status: "pending",
        },
      });
    }
  );

  it.each([
    { label: "no open relationship", relationshipLocations: [] },
    {
      label: "an open relationship only at another site",
      relationshipLocations: [otherLocationId],
    },
  ])(
    "does not return a receipt when the athlete has $label",
    async ({ relationshipLocations }) => {
      mockEnrollmentEligibility(relationshipLocations);

      const response = await enrollAthlete(
        request("/api/v1/owner/enrollments", enrollmentPayload)
      );

      expect(response.status).toBe(404);
      expect(mocks.createEnrollment).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId, locationId, athleteId })
      );
      expect(await response.json()).not.toHaveProperty("data");
    }
  );
});
