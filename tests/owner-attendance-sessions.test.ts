import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolveOwnerScope: vi.fn() }));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.resolveOwnerScope,
}));

import { getOwnerAttendanceSessionOptions } from "@/modules/attendance/application/owner-attendance-sessions";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const userId = "50000000-0000-4000-8000-000000000005";
const otherUserId = "50000000-0000-4000-8000-000000000006";
const sessionId = "30000000-0000-4000-8000-000000000003";

function makeCursor(overrides: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      userId,
      organizationId,
      locationId,
      startsAt: "2026-10-25T12:00:00.123456Z",
      id: sessionId,
      ...overrides,
    }),
    "utf8"
  ).toString("base64url");
}

beforeEach(() => {
  mocks.resolveOwnerScope.mockReset();
  mocks.resolveOwnerScope.mockResolvedValue({
    organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
    member: { id: "60000000-0000-4000-8000-000000000006", role: "owner" },
    locations: [{ id: locationId, name: "Main" }],
    selectedLocationId: locationId,
    canViewOrganizationAggregate: true,
  });
});

describe("Owner attendance session cursor validation", () => {
  it("rejects malformed cursor bytes before resolving tenant data", async () => {
    await expect(
      getOwnerAttendanceSessionOptions({
        userId,
        organizationId,
        locationId,
        cursor: "%%%",
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 400 });
    expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
  });

  it("binds a cursor position to the authenticated actor and selected tenant/site", async () => {
    await expect(
      getOwnerAttendanceSessionOptions({
        userId: otherUserId,
        organizationId,
        locationId,
        cursor: makeCursor(),
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 400 });
    expect(mocks.resolveOwnerScope).toHaveBeenCalledWith({
      userId: otherUserId,
      organizationId,
      locationId,
      cursor: makeCursor(),
    });
  });

  it("rejects a cursor whose date is not a valid microsecond timestamp", async () => {
    await expect(
      getOwnerAttendanceSessionOptions({
        userId,
        organizationId,
        locationId,
        cursor: makeCursor({ startsAt: "2026-02-30T12:00:00.123456Z" }),
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 400 });
    expect(mocks.resolveOwnerScope).not.toHaveBeenCalled();
  });
});
