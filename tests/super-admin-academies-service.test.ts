import { beforeEach, describe, expect, it, vi } from "vitest";

const selectQueue: any[] = [];
const ilikeCalls: unknown[][] = [];

function createCountChain(result: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

function createRowsChain(result: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => selectQueue.shift()),
  },
}));

vi.mock("@/db/schema", () => ({
  academies: {
    id: "academies.id",
    name: "academies.name",
    academyType: "academies.academyType",
    country: "academies.country",
    region: "academies.region",
    createdAt: "academies.createdAt",
    status: "academies.status",
    isSuspended: "academies.isSuspended",
    ownerId: "academies.ownerId",
  },
  authUsers: { id: "authUsers.id", email: "authUsers.email" },
  profiles: { id: "profiles.id", userId: "profiles.userId", name: "profiles.name" },
  subscriptions: { userId: "subscriptions.userId", status: "subscriptions.status", planId: "subscriptions.planId" },
  plans: { id: "plans.id", code: "plans.code", nickname: "plans.nickname" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  count: vi.fn(() => "count"),
  countDistinct: vi.fn(() => "countDistinct"),
  desc: vi.fn((value: unknown) => value),
  eq: vi.fn((left: unknown, right: unknown) => [left, right]),
  ilike: vi.fn((left: unknown, right: unknown) => {
    ilikeCalls.push([left, right]);
    return [left, right];
  }),
  inArray: vi.fn((left: unknown, right: unknown) => [left, right]),
  max: vi.fn((value: unknown) => value),
  or: vi.fn((...conditions: unknown[]) => conditions),
}));

describe("Super Admin academies search", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    ilikeCalls.length = 0;
  });

  it("searches academy and owner identity with literal wildcard escaping", async () => {
    const countChain = createCountChain([{ total: "1" }]);
    const rowsChain = createRowsChain([{
      id: "academy-1",
      name: "Demo Academy",
      academyType: "general",
      country: "España",
      region: null,
      createdAt: new Date("2026-09-13T08:00:00.000Z"),
      status: "active",
      isSuspended: false,
      planCode: "pro",
      planNickname: "Pro",
    }]);
    selectQueue.push(countChain, rowsChain);

    const { getAcademiesPage } = await import("@/lib/superAdminService");
    const result = await getAcademiesPage({ search: "demo_%", page: 1, pageSize: 50 });

    expect(result.total).toBe(1);
    expect(result.items[0]?.name).toBe("Demo Academy");
    expect(countChain.leftJoin).toHaveBeenCalledTimes(4);
    expect(ilikeCalls).toEqual([
      ["academies.name", "%demo\\_\\%%"],
      ["profiles.name", "%demo\\_\\%%"],
      ["authUsers.email", "%demo\\_\\%%"],
    ]);
  });
});
