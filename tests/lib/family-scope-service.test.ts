import { beforeEach, describe, expect, it, vi } from "vitest";

let selectQueue: unknown[][] = [];

function createSelectChain(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      innerJoin: vi.fn(function innerJoin() {
        return this;
      }),
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(result)),
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve),
      })),
    })),
  };
}

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      const result = selectQueue.shift();
      if (!result) {
        throw new Error("Select queue exhausted");
      }
      return createSelectChain(result);
    }),
  },
}));

describe("getFamilyChildrenForUser", () => {
  beforeEach(() => {
    vi.resetModules();
    selectQueue = [];
  });

  it("returns no children when the profile is not a family role", async () => {
    selectQueue.push([{ id: "profile-1", tenantId: "tenant-1", role: "coach" }]);

    const { getFamilyChildrenForUser } = await import("@/lib/family/scope-service");
    const result = await getFamilyChildrenForUser({
      userId: "user-1",
      email: "parent@example.com",
    });

    expect(result).toEqual([]);
  });

  it("deduplicates legacy and guardian children scoped to the family profile", async () => {
    const child = {
      id: "athlete-1",
      name: "Lucia Perez",
      level: "Base",
      status: "active",
      academyId: "academy-1",
      academyName: "Zaltyko Demo Madrid",
    };

    selectQueue.push(
      [{ id: "profile-1", tenantId: "tenant-1", role: "parent" }],
      [child],
      [child]
    );

    const { getFamilyChildrenForUser } = await import("@/lib/family/scope-service");
    const result = await getFamilyChildrenForUser({
      userId: "user-1",
      email: "PARENT@example.com",
    });

    expect(result).toEqual([child]);
  });
});
