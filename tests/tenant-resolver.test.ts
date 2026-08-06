import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  results: [] as unknown[][],
  select: vi.fn(),
  getCurrentProfile: vi.fn(),
}));

function makeSelectChain(result: unknown[]) {
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

vi.mock("@/lib/authz/profile-service", () => ({
  getCurrentProfile: mocks.getCurrentProfile,
}));

import { getTenantId } from "@/lib/authz/tenant-resolver";

describe("tenant resolver", () => {
  beforeEach(() => {
    mocks.results = [];
    mocks.select.mockReset();
    mocks.select.mockImplementation(() => makeSelectChain(mocks.results.shift() ?? []));
    mocks.getCurrentProfile.mockReset();
  });

  it("does not grant a global admin cross-tenant access without membership", async () => {
    mocks.getCurrentProfile.mockResolvedValue({
      id: "profile-admin",
      userId: "user-admin",
      role: "admin",
      tenantId: "tenant-a",
    });
    mocks.results = [
      [{ tenantId: "tenant-b", ownerId: "profile-owner" }],
      [],
    ];

    await expect(getTenantId("user-admin", "academy-b")).resolves.toBeNull();
  });

  it("does not grant an academy owner access to a different academy", async () => {
    mocks.getCurrentProfile.mockResolvedValue({
      id: "profile-owner-a",
      userId: "user-owner-a",
      role: "owner",
      tenantId: "tenant-a",
    });
    mocks.results = [
      [{ tenantId: "tenant-b", ownerId: "profile-owner-b" }],
      [],
    ];

    await expect(getTenantId("user-owner-a", "academy-b")).resolves.toBeNull();
  });

  it("resolves the academy tenant for a valid membership", async () => {
    mocks.getCurrentProfile.mockResolvedValue({
      id: "profile-coach",
      userId: "user-coach",
      role: "coach",
      tenantId: "tenant-a",
    });
    mocks.results = [
      [{ tenantId: "tenant-b", ownerId: "profile-owner" }],
      [{ id: "membership-1" }],
    ];

    await expect(getTenantId("user-coach", "academy-b")).resolves.toBe("tenant-b");
  });

  it("keeps explicit cross-tenant access exclusive to super admin", async () => {
    mocks.getCurrentProfile.mockResolvedValue({
      id: "profile-super",
      userId: "user-super",
      role: "super_admin",
      tenantId: null,
    });
    mocks.results = [[{ tenantId: "tenant-b", ownerId: "profile-owner" }]];

    await expect(getTenantId("user-super", "academy-b")).resolves.toBe("tenant-b");
  });
});
