import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  createGroup: vi.fn(),
  createClass: vi.fn(),
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
vi.mock("@/modules/groups/application/group-management-service", () => ({
  createOperationalGroup: mocks.createGroup,
  getOwnerGroupsPageData: vi.fn(),
}));
vi.mock("@/modules/scheduling/application/class-management-service", () => ({
  createScheduledClass: mocks.createClass,
  getOwnerClassesPageData: vi.fn(),
}));

import { POST as createGroup } from "@/app/api/v1/owner/groups/route";
import { POST as createClass } from "@/app/api/v1/owner/classes/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { MAX_CLASS_CAPACITY } from "@/modules/scheduling/domain/class-capacity";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const programId = "30000000-0000-4000-8000-000000000003";
const memberId = "40000000-0000-4000-8000-000000000004";
const userId = "50000000-0000-4000-8000-000000000005";
const idempotencyKey = "owner-capacity-command-01";

const groupPayload = {
  organizationId,
  locationId,
  programId,
  name: "QA iniciación",
  capacity: 20,
};

const classPayload = {
  organizationId,
  locationId,
  programId,
  name: "QA artística",
  capacity: 18,
  effectiveFrom: "2026-10-26",
  effectiveTo: null,
  schedule: [
    { isoWeekday: 1, startsAtLocal: "17:00", endsAtLocal: "18:00" },
  ],
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
  mocks.createGroup.mockResolvedValue({
    id: "60000000-0000-4000-8000-000000000006",
    name: groupPayload.name,
    locationId,
    programId,
    capacity: groupPayload.capacity,
  });
  mocks.createClass.mockResolvedValue({
    classTemplate: {
      id: "70000000-0000-4000-8000-000000000007",
      name: classPayload.name,
    },
    sessionCount: 18,
    generatedThrough: "2027-02-19",
  });
});

const routes = [
  {
    name: "group",
    handler: createGroup,
    path: "/api/v1/owner/groups",
    payload: groupPayload,
    service: mocks.createGroup,
    expectedScope: { userId, organizationId },
    expectedCommand: {
      ...groupPayload,
      idempotencyKey,
      actor: { userId, memberId },
    },
    expectedReceipt: {
      id: "60000000-0000-4000-8000-000000000006",
      name: groupPayload.name,
    },
  },
  {
    name: "class",
    handler: createClass,
    path: "/api/v1/owner/classes",
    payload: classPayload,
    service: mocks.createClass,
    expectedScope: { userId, organizationId, locationId },
    expectedCommand: {
      ...classPayload,
      idempotencyKey,
      actor: { userId, memberId },
    },
    expectedReceipt: {
      id: "70000000-0000-4000-8000-000000000007",
      name: classPayload.name,
      sessionCount: 18,
      generatedThrough: "2027-02-19",
    },
  },
] as const;

describe.each(routes)("Owner $name capacity HTTP boundary", (route) => {
  it("requires the session before parsing the request or resolving scope", async () => {
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

  it("rejects browser-supplied actor and role fields", async () => {
    const response = await route.handler(
      request(route.path, {
        ...route.payload,
        actor: { userId, memberId },
        role: "owner",
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(route.service).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before invoking the write service", async () => {
    const response = await route.handler(
      request(route.path, route.payload, "")
    );

    expect(response.status).toBe(400);
    expect(route.service).not.toHaveBeenCalled();
  });

  it("stops before the write service when tenant scope is denied", async () => {
    mocks.ownerScope.mockRejectedValueOnce(
      new OperationalError("FORBIDDEN", "Scope denied", 403)
    );

    const response = await route.handler(
      request(route.path, route.payload)
    );

    expect(response.status).toBe(403);
    expect(route.service).not.toHaveBeenCalled();
  });

  it("stops before the write service when rate-limited", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });

    const response = await route.handler(
      request(route.path, route.payload)
    );

    expect(response.status).toBe(429);
    expect(route.service).not.toHaveBeenCalled();
  });

  it("derives the tenant and actor from the authenticated request and returns the receipt", async () => {
    const response = await route.handler(
      request(route.path, route.payload)
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerScope).toHaveBeenCalledWith(route.expectedScope);
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: `verified:${organizationId}` })
    );
    expect(route.service).toHaveBeenCalledWith(route.expectedCommand);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: route.expectedReceipt,
    });
  });
});

describe("Owner class capacity and attendance roster bound", () => {
  it("accepts the shared maximum supported by the attendance roster", async () => {
    const response = await createClass(
      request("/api/v1/owner/classes", {
        ...classPayload,
        capacity: MAX_CLASS_CAPACITY,
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.createClass).toHaveBeenCalledWith(
      expect.objectContaining({ capacity: MAX_CLASS_CAPACITY })
    );
  });

  it("rejects a class capacity above the shared roster maximum before writing", async () => {
    const response = await createClass(
      request("/api/v1/owner/classes", {
        ...classPayload,
        capacity: MAX_CLASS_CAPACITY + 1,
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.createClass).not.toHaveBeenCalled();
  });
});
