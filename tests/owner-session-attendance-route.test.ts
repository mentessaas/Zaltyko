import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  rateLimit: vi.fn(),
  resolveAccess: vi.fn(),
  loadRoster: vi.fn(),
  recordAttendance: vi.fn(),
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
vi.mock("@/modules/attendance/application/owner-session-attendance", () => ({
  loadOwnerSessionAttendanceRoster: mocks.loadRoster,
  resolveSessionAttendanceAccess: mocks.resolveAccess,
}));
vi.mock("@/modules/attendance/application/attendance-service", () => ({
  recordAttendance: mocks.recordAttendance,
}));

import {
  GET,
  POST,
} from "@/app/api/v1/owner/sessions/[sessionId]/attendance/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const sessionId = "30000000-0000-4000-8000-000000000003";
const enrollmentId = "40000000-0000-4000-8000-000000000004";
const userId = "50000000-0000-4000-8000-000000000005";
const memberId = "60000000-0000-4000-8000-000000000006";
const idempotencyKey = "attendance-command-01";
const params = Promise.resolve({ sessionId });
const query = `organizationId=${organizationId}&locationId=${locationId}`;
const payload = { organizationId, locationId, enrollmentId, status: "present" };

function request(method: "GET" | "POST", body?: unknown, key = idempotencyKey) {
  return new Request(
    `https://example.invalid/api/v1/owner/sessions/${sessionId}/attendance?${query}`,
    {
      method,
      ...(method === "POST"
        ? {
            headers: {
              "content-type": "application/json",
              "idempotency-key": key,
            },
            body: JSON.stringify(body),
          }
        : {}),
    }
  );
}

const context = { params };

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.resolveAccess.mockResolvedValue({ memberId, role: "coach" });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.loadRoster.mockResolvedValue([
    { enrollmentId, status: "not_recorded" },
  ]);
  mocks.recordAttendance.mockResolvedValue({
    id: "70000000-0000-4000-8000-000000000007",
    sessionId,
    enrollmentId,
    status: payload.status,
    recordedAt: new Date("2026-10-24T09:00:00.000Z"),
  });
});

describe("Owner session attendance HTTP boundary", () => {
  it("requires a session before parsing POST input or checking access", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const malformed = new Request(
      `https://example.invalid/api/v1/owner/sessions/${sessionId}/attendance`,
      { method: "POST", body: "{" }
    );

    const response = await POST(malformed, context);

    expect(response.status).toBe(401);
    expect(mocks.resolveAccess).not.toHaveBeenCalled();
    expect(mocks.recordAttendance).not.toHaveBeenCalled();
  });

  it("rejects invalid path and strict-body fields before access or write", async () => {
    const invalidParams = { params: Promise.resolve({ sessionId: "bad-id" }) };
    const response = await POST(
      request("POST", { ...payload, actor: { userId, memberId } }),
      invalidParams
    );

    expect(response.status).toBe(400);
    expect(mocks.resolveAccess).not.toHaveBeenCalled();
    expect(mocks.recordAttendance).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before writing", async () => {
    const response = await POST(request("POST", payload, ""), context);

    expect(response.status).toBe(400);
    expect(mocks.recordAttendance).not.toHaveBeenCalled();
  });

  it("preserves a denied location scope and stops before the write", async () => {
    mocks.resolveAccess.mockRejectedValueOnce(
      new OperationalError("LOCATION_SCOPE_DENIED", "Site denied", 403)
    );

    const response = await POST(request("POST", payload), context);

    expect(response.status).toBe(403);
    expect(mocks.recordAttendance).not.toHaveBeenCalled();
  });

  it("stops before the write when the verified tenant is rate-limited", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });

    const response = await POST(request("POST", payload), context);

    expect(response.status).toBe(429);
    expect(mocks.recordAttendance).not.toHaveBeenCalled();
  });

  it("derives the write scope and actor from the verified session", async () => {
    const response = await POST(request("POST", payload), context);

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.resolveAccess).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
      sessionId,
    });
    expect(mocks.recordAttendance).toHaveBeenCalledWith({
      organizationId,
      expectedLocationId: locationId,
      sessionId,
      enrollmentId,
      status: "present",
      idempotencyKey,
      actor: { userId, memberId },
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { sessionId, enrollmentId, status: "present" },
    });
  });

  it("requires the session before loading the attendance roster", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await GET(request("GET"), context);

    expect(response.status).toBe(401);
    expect(mocks.resolveAccess).not.toHaveBeenCalled();
    expect(mocks.loadRoster).not.toHaveBeenCalled();
  });

  it("checks session/site access before loading a private no-store roster", async () => {
    const response = await GET(request("GET"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.resolveAccess).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
      sessionId,
    });
    expect(mocks.loadRoster).toHaveBeenCalledWith(
      { organizationId, locationId, sessionId },
      { memberId, role: "coach" }
    );
  });
});
