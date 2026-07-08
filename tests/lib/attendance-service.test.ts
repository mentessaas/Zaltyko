import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCoachClassScope: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  verifyCoachClassScope: mocks.verifyCoachClassScope,
}));

describe("verifyAttendanceWriteAccess", () => {
  beforeEach(() => {
    mocks.verifyCoachClassScope.mockReset();
  });

  it("delegates coach/class scope checks to the shared permission guard", async () => {
    mocks.verifyCoachClassScope.mockResolvedValue({ allowed: false, reason: "COACH_NOT_ASSIGNED_TO_CLASS" });

    const { verifyAttendanceWriteAccess } = await import("@/lib/attendance/service");
    const result = await verifyAttendanceWriteAccess({
      tenantId: "tenant-1",
      academyId: "academy-1",
      classId: "class-1",
      profile: {
        id: "profile-1",
        userId: "user-1",
        role: "coach",
        tenantId: "tenant-1",
      },
    });

    expect(result).toEqual({ allowed: false, reason: "COACH_NOT_ASSIGNED_TO_CLASS" });
    expect(mocks.verifyCoachClassScope).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      academyId: "academy-1",
      classId: "class-1",
      profile: {
        id: "profile-1",
        userId: "user-1",
        role: "coach",
        tenantId: "tenant-1",
      },
    });
  });
});
