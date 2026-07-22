import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFamilyChildrenForUser: vi.fn(),
  chargeRows: [] as unknown[],
}));

function createChargeQuery() {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => {
        return {
          limit: vi.fn(() => Promise.resolve(mocks.chargeRows)),
        };
      }),
    })),
  };
}

vi.mock("@/lib/family/scope-service", () => ({
  getFamilyChildrenForUser: mocks.getFamilyChildrenForUser,
}));

vi.mock("@/lib/stripe/connect-service", () => ({
  getConnectAccount: vi.fn(),
  isConnectReady: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => createChargeQuery()),
  },
}));

describe("resolveFamilyChargeAccess", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getFamilyChildrenForUser.mockReset();
    mocks.chargeRows = [];
  });

  it("does not query charges when the family user has no linked athletes", async () => {
    mocks.getFamilyChildrenForUser.mockResolvedValue([]);

    const { db } = await import("@/db");
    const { resolveFamilyChargeAccess } = await import("@/lib/family/payment-access");
    const result = await resolveFamilyChargeAccess({
      userId: "user-1",
      email: "parent@example.com",
      chargeId: "charge-1",
    });

    expect(result).toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  }, 15_000);

  it("returns only a charge scoped to one of the user's linked athletes", async () => {
    mocks.getFamilyChildrenForUser.mockResolvedValue([
      { id: "athlete-1", academyId: "academy-1" },
      { id: "athlete-2", academyId: "academy-1" },
    ]);
    mocks.chargeRows = [{ id: "charge-1", athleteId: "athlete-2" }];

    const { resolveFamilyChargeAccess } = await import("@/lib/family/payment-access");
    const result = await resolveFamilyChargeAccess({
      userId: "user-1",
      email: "parent@example.com",
      chargeId: "charge-1",
    });

    expect(result).toEqual({ id: "charge-1", athleteId: "athlete-2" });
  }, 15_000);

  it("fails closed when no scoped charge matches", async () => {
    mocks.getFamilyChildrenForUser.mockResolvedValue([{ id: "athlete-1", academyId: "academy-1" }]);
    mocks.chargeRows = [];

    const { resolveFamilyChargeAccess } = await import("@/lib/family/payment-access");
    const result = await resolveFamilyChargeAccess({
      userId: "user-1",
      email: "parent@example.com",
      chargeId: "charge-other-family",
    });

    expect(result).toBeNull();
  }, 15_000);
});
