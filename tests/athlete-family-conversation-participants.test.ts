import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    athlete: null as Record<string, unknown> | null,
    guardian: null as Record<string, unknown> | null,
    conversation: null as Record<string, unknown> | null,
    participants: [] as Array<Record<string, unknown>>,
    queries: [] as Array<{
      source: "db" | "tx";
      tableName: string;
      where: unknown;
      limit: number;
      returnedUserIds: unknown[];
    }>,
    inserts: [] as Array<{
      tableName: string;
      values: Array<Record<string, unknown>>;
    }>,
    events: [] as string[],
  };
  const column = (name: string) => ({ column: name });
  const tables = {
    athletes: {
      tableName: "athletes",
      id: column("athletes.id"),
      name: column("athletes.name"),
      tenantId: column("athletes.tenantId"),
      academyId: column("athletes.academyId"),
      deletedAt: column("athletes.deletedAt"),
    },
    conversationParticipants: {
      tableName: "conversationParticipants",
      conversationId: column("conversationParticipants.conversationId"),
      userId: column("conversationParticipants.userId"),
    },
    conversations: {
      tableName: "conversations",
      id: column("conversations.id"),
      tenantId: column("conversations.tenantId"),
      academyId: column("conversations.academyId"),
      metadata: column("conversations.metadata"),
    },
    guardianAthletes: {
      tableName: "guardianAthletes",
      athleteId: column("guardianAthletes.athleteId"),
      guardianId: column("guardianAthletes.guardianId"),
      tenantId: column("guardianAthletes.tenantId"),
    },
    guardians: {
      tableName: "guardians",
      id: column("guardians.id"),
      name: column("guardians.name"),
      profileId: column("guardians.profileId"),
      tenantId: column("guardians.tenantId"),
    },
  };

  function matches(predicate: unknown, row: Record<string, unknown>): boolean {
    if (typeof predicate !== "object" || predicate === null) return true;
    const node = predicate as {
      type?: string;
      column?: { column?: string };
      value?: unknown;
      values?: unknown[];
      conditions?: unknown[];
    };
    const property = node.column?.column?.split(".").at(-1);
    if (node.type === "and") {
      return (node.conditions ?? []).every((condition) =>
        matches(condition, row)
      );
    }
    if (node.type === "eq") return property ? row[property] === node.value : true;
    if (node.type === "inArray") {
      return property ? (node.values ?? []).includes(row[property]) : true;
    }
    if (node.type === "isNull") return property ? row[property] === null : true;
    return true;
  }

  const select = (source: "db" | "tx") =>
    vi.fn(() => {
      let tableName = "";
      let where: unknown;
      const query = {
        from: vi.fn((table: { tableName: string }) => {
          tableName = table.tableName;
          return query;
        }),
        innerJoin: vi.fn(() => query),
        where: vi.fn((predicate: unknown) => {
          where = predicate;
          return query;
        }),
        limit: vi.fn(async (limit: number) => {
          const rows =
            tableName === "athletes"
              ? state.athlete
                ? [state.athlete]
                : []
              : tableName === "guardianAthletes"
                ? state.guardian
                  ? [state.guardian]
                  : []
                : tableName === "conversations"
                  ? state.conversation
                    ? [state.conversation]
                    : []
                  : tableName === "conversationParticipants"
                    ? state.participants
                    : [];
          const result = rows
            .filter((row) => matches(where, row))
            .slice(0, limit);
          state.queries.push({
            source,
            tableName,
            where,
            limit,
            returnedUserIds: result.map((row) => row.userId),
          });
          state.events.push(`select:${source}:${tableName}`);
          return tableName === "conversationParticipants"
            ? result.map(({ userId }) => ({ userId }))
            : result;
        }),
      };
      return query;
    });

  const tx = {
    select: select("tx"),
    insert: vi.fn((table: { tableName: string }) => ({
      values: vi.fn((value: unknown) => ({
        onConflictDoNothing: vi.fn(async () => {
          const values = (Array.isArray(value) ? value : [value]) as Array<
            Record<string, unknown>
          >;
          state.inserts.push({ tableName: table.tableName, values });
          state.events.push(`insert:${table.tableName}`);
        }),
      })),
    })),
  };
  const db = { select: select("db") };
  const authorizeAcademyCapability = vi.fn(async () => {
    state.events.push("authorize:academy");
    return { allowed: true };
  });
  const verifyCoachAthleteScope = vi.fn(async () => {
    state.events.push("authorize:coach-scope");
    return { allowed: true };
  });
  const lockAcademyOperationalWrites = vi.fn(async () => {
    state.events.push("capacity:lock");
  });
  const assertAcademyOperationalWritable = vi.fn(async () => {
    state.events.push("capacity:assert-writable");
  });
  const withTransaction = vi.fn(
    async (callback: (client: unknown) => Promise<unknown>) => {
      state.events.push("transaction:start");
      const result = await callback(tx);
      state.events.push("transaction:finish");
      return result;
    }
  );

  return {
    state,
    tables,
    db,
    tx,
    authorizeAcademyCapability,
    verifyCoachAthleteScope,
    lockAcademyOperationalWrites,
    assertAcademyOperationalWritable,
    withTransaction,
  };
});

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/db/schema", () => mocks.tables);
vi.mock("@/lib/authz", () => ({ withTenant: (handler: unknown) => handler }));
vi.mock("@/lib/authz/resource-scope", () => ({
  authorizeAcademyCapability: mocks.authorizeAcademyCapability,
}));
vi.mock("@/lib/db-transactions", () => ({
  withTransaction: mocks.withTransaction,
}));
vi.mock("@/lib/limits", () => ({
  assertAcademyOperationalWritable: mocks.assertAcademyOperationalWritable,
  lockAcademyOperationalWrites: mocks.lockAcademyOperationalWrites,
}));
vi.mock("@/lib/permissions", () => ({
  verifyCoachAthleteScope: mocks.verifyCoachAthleteScope,
}));
vi.mock("@/lib/api-response", () => ({
  apiError: (error: string, message: string, status: number) =>
    new Response(JSON.stringify({ ok: false, error, message }), { status }),
  apiSuccess: (data: unknown) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200 }),
}));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ type: "and", conditions }),
  eq: (column: unknown, value: unknown) => ({ type: "eq", column, value }),
  inArray: (column: unknown, values: unknown[]) => ({
    type: "inArray",
    column,
    values,
  }),
  isNull: (column: unknown) => ({ type: "isNull", column }),
  sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({
    type: "sql",
    parts: [...parts],
    values,
  }),
}));

import { POST } from "@/app/api/athletes/[athleteId]/family-conversation/route";

const tenantId = "10000000-0000-4000-8000-000000000001";
const academyId = "20000000-0000-4000-8000-000000000002";
const athleteId = "30000000-0000-4000-8000-000000000003";
const guardianId = "40000000-0000-4000-8000-000000000004";
const ownerProfileId = "50000000-0000-4000-8000-000000000005";
const guardianProfileId = "60000000-0000-4000-8000-000000000006";
const conversationId = "70000000-0000-4000-8000-000000000007";
const otherConversationId = "80000000-0000-4000-8000-000000000008";

function makeParticipants({ guardian = true }: { guardian?: boolean } = {}) {
  return [
    { conversationId: otherConversationId, userId: ownerProfileId },
    { conversationId: otherConversationId, userId: guardianProfileId },
    ...Array.from({ length: 8 }, (_, index) => ({
      conversationId,
      userId: `other-conversation-user-${index}`,
    })),
    { conversationId, userId: ownerProfileId },
    ...(guardian ? [{ conversationId, userId: guardianProfileId }] : []),
  ];
}

function request() {
  return new Request(
    `https://sandbox.invalid/api/athletes/${athleteId}/family-conversation`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guardianId }),
    }
  );
}

function context() {
  return {
    tenantId,
    userId: ownerProfileId,
    profile: { id: ownerProfileId, role: "coach" },
    params: { athleteId },
  };
}

async function body(response: Response) {
  return response.json() as Promise<{
    ok: boolean;
    data?: { conversationId?: string; alreadyExists?: boolean };
  }>;
}

function expectParticipantQueryScope(query: {
  where: unknown;
  limit: number;
}) {
  expect(query.where).toEqual(
    expect.objectContaining({
      type: "and",
      conditions: expect.arrayContaining([
        expect.objectContaining({
          type: "eq",
          column: mocks.tables.conversationParticipants.conversationId,
          value: conversationId,
        }),
        expect.objectContaining({
          type: "inArray",
          column: mocks.tables.conversationParticipants.userId,
          values: [ownerProfileId, guardianProfileId],
        }),
      ]),
    })
  );
  expect(query.limit).toBe(2);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.athlete = {
    id: athleteId,
    name: "Gimnasta sintética",
    tenantId,
    academyId,
    deletedAt: null,
  };
  mocks.state.guardian = {
    id: guardianId,
    name: "Tutor sintético",
    profileId: guardianProfileId,
    tenantId,
    athleteId,
    guardianId,
    linkId: "90000000-0000-4000-8000-000000000009",
  };
  mocks.state.conversation = { id: conversationId, tenantId, academyId };
  mocks.state.participants = makeParticipants();
  mocks.state.queries = [];
  mocks.state.inserts = [];
  mocks.state.events = [];
});

describe("participantes de conversación familiar existente", () => {
  it("encuentra al coach y al tutor aunque haya muchos otros participantes delante", async () => {
    const response = await POST(request(), context() as never);

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({
      ok: true,
      data: { conversationId, alreadyExists: true },
    });
    expect(mocks.state.inserts).toEqual([]);
    expect(mocks.withTransaction).not.toHaveBeenCalled();
    expect(mocks.lockAcademyOperationalWrites).not.toHaveBeenCalled();
    expect(mocks.assertAcademyOperationalWritable).not.toHaveBeenCalled();
    expect(mocks.authorizeAcademyCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceTenantId: tenantId,
        academyId,
        permission: "communications:send",
      })
    );
    expect(mocks.verifyCoachAthleteScope).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, academyId, athleteId })
    );

    const participantQueries = mocks.state.queries.filter(
      (query) => query.tableName === "conversationParticipants"
    );
    expect(participantQueries).toHaveLength(1);
    expect(participantQueries[0]?.returnedUserIds).toEqual([
      ownerProfileId,
      guardianProfileId,
    ]);
    expectParticipantQueryScope(participantQueries[0]!);
    expect(mocks.state.events.indexOf("authorize:academy")).toBeLessThan(
      mocks.state.events.indexOf("authorize:coach-scope")
    );
    expect(mocks.state.events.indexOf("authorize:coach-scope")).toBeLessThan(
      mocks.state.events.indexOf("select:db:conversationParticipants")
    );
  });

  it("en una reparación añade solo al tutor que falta y mantiene el alcance de academia", async () => {
    mocks.state.participants = makeParticipants({ guardian: false });

    const response = await POST(request(), context() as never);

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({
      ok: true,
      data: { conversationId, alreadyExists: true },
    });
    expect(mocks.state.inserts).toEqual([
      {
        tableName: "conversationParticipants",
        values: [
          {
            conversationId,
            userId: guardianProfileId,
            role: "member",
            notificationsEnabled: "true",
          },
        ],
      },
    ]);
    expect(mocks.withTransaction).toHaveBeenCalledOnce();
    expect(mocks.lockAcademyOperationalWrites).toHaveBeenCalledWith(
      mocks.tx,
      academyId
    );
    expect(mocks.assertAcademyOperationalWritable).toHaveBeenCalledWith(
      tenantId,
      academyId,
      mocks.tx
    );
    expect(mocks.authorizeAcademyCapability).toHaveBeenCalledOnce();
    expect(mocks.verifyCoachAthleteScope).toHaveBeenCalledOnce();

    const participantQueries = mocks.state.queries.filter(
      (query) => query.tableName === "conversationParticipants"
    );
    expect(participantQueries).toHaveLength(2);
    expect(participantQueries.map((query) => query.returnedUserIds)).toEqual([
      [ownerProfileId],
      [ownerProfileId],
    ]);
    participantQueries.forEach(expectParticipantQueryScope);
    expect(mocks.state.events.indexOf("authorize:coach-scope")).toBeLessThan(
      mocks.state.events.indexOf("transaction:start")
    );
    expect(mocks.state.events.indexOf("transaction:start")).toBeLessThan(
      mocks.state.events.indexOf("capacity:lock")
    );
    expect(mocks.state.events.indexOf("capacity:lock")).toBeLessThan(
      mocks.state.events.indexOf("capacity:assert-writable")
    );
  });
});
