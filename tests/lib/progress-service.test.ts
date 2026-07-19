import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCoachAthleteScope: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  verifyCoachAthleteScope: mocks.verifyCoachAthleteScope,
}));

describe("verifyProgressAccess", () => {
  beforeEach(() => {
    mocks.verifyCoachAthleteScope.mockReset();
  });

  it("delegates athlete scope checks to the shared permission guard", async () => {
    mocks.verifyCoachAthleteScope.mockResolvedValue({ allowed: true });

    const { verifyProgressAccess } = await import("@/lib/progress/service");
    const result = await verifyProgressAccess({
      tenantId: "tenant-1",
      academyId: "academy-1",
      athleteId: "athlete-1",
      athleteGroupId: "group-1",
      profile: {
        id: "profile-1",
        userId: "user-1",
        role: "coach",
        tenantId: "tenant-1",
      },
    });

    expect(result).toEqual({ allowed: true });
    expect(mocks.verifyCoachAthleteScope).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      academyId: "academy-1",
      athleteId: "athlete-1",
      athleteGroupId: "group-1",
      profile: {
        id: "profile-1",
        userId: "user-1",
        role: "coach",
        tenantId: "tenant-1",
      },
    });
  });
});
