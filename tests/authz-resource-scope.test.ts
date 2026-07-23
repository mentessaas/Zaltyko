import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[][],
  select: vi.fn(),
  hasPermission: vi.fn(),
  verifyCoachClassScope: vi.fn(),
  verifyCoachAthleteScope: vi.fn(),
}));

function selectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(result));
  return chain;
}

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock("@/lib/authz/permissions-service", () => ({
  hasPermission: mocks.hasPermission,
}));

vi.mock("@/lib/permissions", () => ({
  verifyCoachClassScope: mocks.verifyCoachClassScope,
  verifyCoachAthleteScope: mocks.verifyCoachAthleteScope,
}));

const context = {
  tenantId: "tenant-a",
  userId: "user-coach",
  profile: {
    id: "profile-coach",
    userId: "user-coach",
    tenantId: "tenant-a",
    role: "coach" as const,
    canLogin: true,
    activeAcademyId: "academy-a",
  },
};

describe("resource authorization", () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.select.mockReset();
    mocks.select.mockImplementation(() => selectChain(mocks.rows.shift() ?? []));
    mocks.hasPermission.mockReset();
    mocks.verifyCoachClassScope.mockReset();
    mocks.verifyCoachAthleteScope.mockReset();
  });

  it("denies a valid class ID when the coach is not assigned to the resource", async () => {
    mocks.rows = [[{ id: "class-b", tenantId: "tenant-a", academyId: "academy-b" }]];
    mocks.verifyCoachClassScope.mockResolvedValue({
      allowed: false,
      reason: "COACH_NOT_ASSIGNED_TO_CLASS",
    });
    const { authorizeClassResource } = await import("@/lib/authz/resource-scope");

    const result = await authorizeClassResource({ context, classId: "class-b" });

    expect(result).toEqual({
      allowed: false,
      reason: "COACH_NOT_ASSIGNED_TO_CLASS",
    });
    expect(mocks.verifyCoachClassScope).toHaveBeenCalledWith(
      expect.objectContaining({ academyId: "academy-b", classId: "class-b" })
    );
  });

  it("allows an assigned class without trusting the active academy", async () => {
    mocks.rows = [[{ id: "class-a", tenantId: "tenant-a", academyId: "academy-a" }]];
    mocks.verifyCoachClassScope.mockResolvedValue({ allowed: true });
    const { authorizeClassResource } = await import("@/lib/authz/resource-scope");

    await expect(
      authorizeClassResource({ context, classId: "class-a" })
    ).resolves.toMatchObject({
      allowed: true,
      resource: { id: "class-a", academyId: "academy-a" },
    });
  });

  it("denies another athlete in the tenant when assignment scope is absent", async () => {
    mocks.rows = [[{
      id: "athlete-b",
      tenantId: "tenant-a",
      academyId: "academy-b",
      groupId: "group-b",
    }]];
    mocks.verifyCoachAthleteScope.mockResolvedValue({
      allowed: false,
      reason: "COACH_NOT_ASSIGNED_TO_ATHLETE",
    });
    const { authorizeAthleteResource } = await import("@/lib/authz/resource-scope");

    await expect(
      authorizeAthleteResource({ context, athleteId: "athlete-b" })
    ).resolves.toEqual({
      allowed: false,
      reason: "COACH_NOT_ASSIGNED_TO_ATHLETE",
    });
  });

  it("rejects a capability check across tenants before consulting role grants", async () => {
    const { authorizeAcademyCapability } = await import("@/lib/authz/resource-scope");

    await expect(
      authorizeAcademyCapability({
        context,
        resourceTenantId: "tenant-b",
        academyId: "academy-b",
        permission: "billing:update",
      })
    ).resolves.toEqual({
      allowed: false,
      reason: "RESOURCE_NOT_FOUND_OR_ACCESS_DENIED",
    });
    expect(mocks.hasPermission).not.toHaveBeenCalled();
  });

  it("requires the capability on the resource academy, not the active academy", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    const { authorizeAcademyCapability } = await import("@/lib/authz/resource-scope");

    await expect(
      authorizeAcademyCapability({
        context,
        resourceTenantId: "tenant-a",
        academyId: "academy-b",
        permission: "billing:update",
      })
    ).resolves.toEqual({ allowed: false, reason: "PERMISSION_DENIED" });
    expect(mocks.hasPermission).toHaveBeenCalledWith(
      "user-coach",
      "academy-b",
      "billing:update"
    );
  });
});
