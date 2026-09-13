import { beforeEach, describe, expect, it, vi } from "vitest";

const selectQueue: any[] = [];
const countJoins: unknown[][] = [];

function createCountChain(result: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn((...args: unknown[]) => {
      countJoins.push(args);
      return chain;
    }),
    where: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

function createRowsChain(result: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

function createResponseCountsChain(result: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    groupBy: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => selectQueue.shift()),
  },
}));

vi.mock("@/db/schema", () => ({
  academies: { id: "academies.id", name: "academies.name" },
  authUsers: { id: "authUsers.id", email: "authUsers.email" },
  profiles: { id: "profiles.id", userId: "profiles.userId", name: "profiles.name" },
  ticketResponses: { id: "ticketResponses.id", ticketId: "ticketResponses.ticketId" },
  tickets: {
    id: "tickets.id",
    title: "tickets.title",
    description: "tickets.description",
    status: "tickets.status",
    priority: "tickets.priority",
    category: "tickets.category",
    createdAt: "tickets.createdAt",
    updatedAt: "tickets.updatedAt",
    academyId: "tickets.academyId",
    createdBy: "tickets.createdBy",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  count: vi.fn(() => "count"),
  desc: vi.fn((value: unknown) => value),
  eq: vi.fn((left: unknown, right: unknown) => [left, right]),
  ilike: vi.fn((left: unknown, right: unknown) => [left, right]),
  inArray: vi.fn((left: unknown, right: unknown) => [left, right]),
  or: vi.fn((...conditions: unknown[]) => conditions),
}));

describe("Super Admin support search query", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    countJoins.length = 0;
  });

  it("applies academy and requester joins to the pagination count", async () => {
    const countChain = createCountChain([{ total: "1" }]);
    const rowsChain = createRowsChain([{
      id: "ticket-1",
      title: "Acceso",
      description: "No puedo entrar",
      status: "open",
      priority: "high",
      category: "technical",
      createdAt: new Date("2026-09-13T08:00:00.000Z"),
      updatedAt: new Date("2026-09-13T08:00:00.000Z"),
      creatorId: "profile-1",
      creatorName: "Ana",
      creatorEmail: "ana@example.com",
      academyId: "academy-1",
      academyName: "Demo",
    }]);
    const responseCountsChain = createResponseCountsChain([{ ticketId: "ticket-1", total: "2" }]);
    selectQueue.push(countChain, rowsChain, responseCountsChain);

    const { getAllTickets, normalizeSupportFilters } = await import(
      "@/app/(super-admin)/super-admin/support/page"
    );
    const result = await getAllTickets(
      normalizeSupportFilters({ search: "Ana" }),
      1,
    );

    expect(result.total).toBe(1);
    expect(result.items[0]?._count.responses).toBe(2);
    expect(countJoins).toHaveLength(3);
  });
});
