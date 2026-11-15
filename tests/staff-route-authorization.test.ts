import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveOwnerScope: vi.fn(),
  rateLimit: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  reactivate: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.resolveOwnerScope,
}));

vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: vi.fn(() => ({})),
  getVerifiedTenantRateLimitIdentifier: vi.fn(() => "synthetic-owner-staff"),
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: vi.fn(() => new Response(null, { status: 429 })),
}));

vi.mock("@/modules/staff/application/owner-staff-profiles", () => ({
  listOwnerStaffProfiles: mocks.list,
  createOwnerStaffProfile: mocks.create,
  updateOwnerStaffProfile: mocks.update,
  archiveOwnerStaffProfile: mocks.archive,
  reactivateOwnerStaffProfile: mocks.reactivate,
}));

import { GET as listStaff, POST as createStaff } from "@/app/api/v1/owner/staff/route";
import { PATCH as updateStaff } from "@/app/api/v1/owner/staff/[staffProfileId]/route";
import { POST as archiveStaff } from "@/app/api/v1/owner/staff/[staffProfileId]/archive/route";
import { POST as reactivateStaff } from "@/app/api/v1/owner/staff/[staffProfileId]/reactivate/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "ec2cc5ab-63d4-45a7-aacc-f0dd00550384";
const memberId = "eb48b630-f0c8-440c-a209-3fe2d85b422f";
const userId = "f870fab5-9168-4406-bb62-dd6b3ae5b5fd";
const staffProfileId = "3c18de5e-6363-4a08-8505-bf401282dfc1";
const version = `v1_${"a".repeat(64)}`;
const scope = {
  organization: { id: organizationId, name: "Synthetic Academy", defaultCurrency: "EUR" },
  member: { id: memberId, role: "owner", locationScopeMode: "all" },
};
const actor = { userId, memberId };

function jsonRequest(url: string, method: string, body?: unknown, headers?: Record<string, string>) {
  return new Request(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function routeContext(id = staffProfileId) {
  return { params: Promise.resolve({ staffProfileId: id }) };
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function expectPrivateNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

describe("Owner staff HTTP guards with mocked session and scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: userId });
    mocks.resolveOwnerScope.mockResolvedValue(scope);
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.list.mockResolvedValue({ items: [], nextCursor: null });
    mocks.create.mockResolvedValue({
      receipt: { staffProfileId, version, isActive: true },
      replayed: false,
    });
    mocks.update.mockResolvedValue({
      receipt: { staffProfileId, version, isActive: true },
      replayed: false,
    });
    mocks.archive.mockResolvedValue({
      receipt: { staffProfileId, version, isActive: false },
      replayed: false,
    });
    mocks.reactivate.mockResolvedValue({
      receipt: { staffProfileId, version, isActive: true },
      replayed: false,
    });
  });

  it("returns 401 privately and never calls a service without a session", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    const response = await listStaff(
      jsonRequest(`https://synthetic.invalid/api/v1/owner/staff?organizationId=${organizationId}`, "GET")
    );

    expect(response.status).toBe(401);
    expectPrivateNoStore(response);
    expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns the scoped directory response with private no-store headers", async () => {
    mocks.list.mockResolvedValueOnce({
      items: [{ id: staffProfileId, givenName: "Synthetic", familyName: "Coach", preferredName: null, isActive: true, version }],
      nextCursor: null,
    });
    const response = await listStaff(
      jsonRequest(`https://synthetic.invalid/api/v1/owner/staff?organizationId=${organizationId}&status=all&limit=10`, "GET")
    );

    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({
      organizationId,
      status: "all",
      limit: 10,
      actor,
    }));
    expect(await responseBody(response)).toMatchObject({
      ok: true,
      data: { items: [{ id: staffProfileId, givenName: "Synthetic" }], nextCursor: null },
    });
  });

  it("denies selected-scope Owners before service calls", async () => {
    mocks.resolveOwnerScope.mockResolvedValueOnce({
      ...scope,
      member: { ...scope.member, locationScopeMode: "selected" },
    });
    const response = await createStaff(
      jsonRequest("https://synthetic.invalid/api/v1/owner/staff", "POST", {
        organizationId,
        givenName: "Synthetic",
        familyName: "Coach",
        preferredName: null,
      }, { "Idempotency-Key": "staff-route-create-1" })
    );

    expect(response.status).toBe(403);
    expectPrivateNoStore(response);
    expect(mocks.create).not.toHaveBeenCalled();

    mocks.resolveOwnerScope.mockResolvedValueOnce({
      ...scope,
      member: { ...scope.member, role: "manager" },
    });
    const managerResponse = await createStaff(
      jsonRequest("https://synthetic.invalid/api/v1/owner/staff", "POST", {
        organizationId,
        givenName: "Synthetic",
        familyName: "Coach",
        preferredName: null,
      }, { "Idempotency-Key": "staff-route-manager-1" })
    );
    expect(managerResponse.status).toBe(403);
    expectPrivateNoStore(managerResponse);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps a foreign-organization lookup hidden and never reaches the read service", async () => {
    mocks.resolveOwnerScope.mockRejectedValueOnce(
      new OperationalError("NOT_FOUND", "Academia no disponible", 404)
    );
    const response = await listStaff(
      jsonRequest(`https://synthetic.invalid/api/v1/owner/staff?organizationId=${organizationId}`, "GET")
    );

    expect(response.status).toBe(404);
    expectPrivateNoStore(response);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("rejects extra personal fields and missing or malformed idempotency keys before scope or mutation", async () => {
    const body = {
      organizationId,
      givenName: "Synthetic",
      familyName: "Coach",
      preferredName: null,
    };
    const extraField = await createStaff(
      jsonRequest("https://synthetic.invalid/api/v1/owner/staff", "POST", {
        ...body,
        email: "synthetic@example.invalid",
      }, { "Idempotency-Key": "staff-route-create-2" })
    );
    const missingKey = await createStaff(
      jsonRequest("https://synthetic.invalid/api/v1/owner/staff", "POST", body)
    );
    const malformedKey = await archiveStaff(
      jsonRequest(`https://synthetic.invalid/api/v1/owner/staff/${staffProfileId}/archive`, "POST", {
        organizationId,
        version,
      }, { "Idempotency-Key": "bad key" }),
      routeContext()
    );
    const malformedPath = await reactivateStaff(
      jsonRequest("https://synthetic.invalid/api/v1/owner/staff/x/reactivate", "POST", {
        organizationId,
        version,
      }, { "Idempotency-Key": "staff-route-reactivate-2" }),
      routeContext("x")
    );

    expect([extraField.status, missingKey.status, malformedKey.status, malformedPath.status]).toEqual([400, 400, 400, 400]);
    for (const response of [extraField, missingKey, malformedKey, malformedPath]) expectPrivateNoStore(response);
    expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.reactivate).not.toHaveBeenCalled();
  });

  it("requires the profile ID in the path, keeps command bodies strict, and passes it separately", async () => {
    const invalidBody = await updateStaff(
      jsonRequest("https://synthetic.invalid/api/v1/owner/staff", "PATCH", {
        organizationId,
        staffProfileId,
        givenName: "Synthetic",
        familyName: "Coach",
        preferredName: null,
        version,
      }, { "Idempotency-Key": "staff-route-update-1" }),
      routeContext()
    );
    expect(invalidBody.status).toBe(400);
    expectPrivateNoStore(invalidBody);
    expect(mocks.update).not.toHaveBeenCalled();

    const response = await updateStaff(
      jsonRequest(`https://synthetic.invalid/api/v1/owner/staff/${staffProfileId}`, "PATCH", {
        organizationId,
        givenName: "Synthetic",
        familyName: "Coach",
        preferredName: null,
        version,
      }, { "Idempotency-Key": "staff-route-update-2" }),
      routeContext()
    );
    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    expect(mocks.update).toHaveBeenCalledWith({
      organizationId,
      staffProfileId,
      givenName: "Synthetic",
      familyName: "Coach",
      preferredName: null,
      version,
      actor,
      idempotencyKey: "staff-route-update-2",
    });
    const body = await responseBody(response);
    expect(body).toMatchObject({
      ok: true,
      data: { receipt: { staffProfileId, version, isActive: true }, replayed: false },
    });
  });

  it("passes status and key validations through archive/reactivate route contracts", async () => {
    const validBody = { organizationId, version };
    const archived = await archiveStaff(
      jsonRequest(`https://synthetic.invalid/api/v1/owner/staff/${staffProfileId}/archive`, "POST", validBody, {
        "Idempotency-Key": "staff-route-archive-1",
      }),
      routeContext()
    );
    const reactivated = await reactivateStaff(
      jsonRequest(`https://synthetic.invalid/api/v1/owner/staff/${staffProfileId}/reactivate`, "POST", validBody, {
        "Idempotency-Key": "staff-route-reactivate-1",
      }),
      routeContext()
    );

    expect([archived.status, reactivated.status]).toEqual([200, 200]);
    expectPrivateNoStore(archived);
    expectPrivateNoStore(reactivated);
    expect(mocks.archive).toHaveBeenCalledWith({
      ...validBody,
      staffProfileId,
      actor,
      idempotencyKey: "staff-route-archive-1",
    });
    expect(mocks.reactivate).toHaveBeenCalledWith({
      ...validBody,
      staffProfileId,
      actor,
      idempotencyKey: "staff-route-reactivate-1",
    });
  });
});

// These mocks verify HTTP handler ordering, response status and cache headers only.
// They do not exercise PostgreSQL membership enforcement or claim that mocks prove RLS.
