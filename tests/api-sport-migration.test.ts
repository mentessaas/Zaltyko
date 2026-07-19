import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const PROFILE_ID = "33333333-3333-3333-3333-333333333333";
const SPORT_CONFIG_ID = "44444444-4444-4444-4444-444444444444";
const ATHLETE_ID = "55555555-5555-5555-5555-555555555555";
const GROUP_ID = "66666666-6666-6666-6666-666666666666";
const CLASS_ID = "77777777-7777-7777-7777-777777777777";
const COACH_ID = "88888888-8888-8888-8888-888888888888";

let selectQueue: unknown[][] = [];
let insertCalls: Array<{ table: unknown; payload: unknown }> = [];
let updateCalls: Array<{ table: unknown; data: unknown }> = [];

function createSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"] as const;

  methods.forEach((method) => {
    chain[method] = vi.fn(() => chain);
  });

  Object.defineProperty(chain, "then", {
    value: (onFulfilled: unknown, onRejected?: unknown) =>
      Promise.resolve(result).then(onFulfilled as (value: unknown[]) => unknown, onRejected as () => unknown),
  });

  return chain;
}

function queueAcademy() {
  selectQueue.push([
    {
      id: ACADEMY_ID,
      tenantId: TENANT_ID,
      ownerId: PROFILE_ID,
    },
  ]);
}

async function importRoute() {
  return import("@/app/api/academies/[academyId]/sport-migration/route");
}

function requestFor(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/academies/${ACADEMY_ID}/sport-migration`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/academies/[academyId]/sport-migration", () => {
  beforeEach(() => {
    vi.resetModules();
    selectQueue = [];
    insertCalls = [];
    updateCalls = [];

    vi.mock("@/lib/authz", () => ({
      withTenant:
        (handler: (request: Request, context: unknown) => Promise<Response>) =>
        (request: Request, contextOverride?: { params?: Record<string, string> }) =>
          handler(request, {
            tenantId: TENANT_ID,
            userId: "user-1",
            profile: {
              id: PROFILE_ID,
              tenantId: TENANT_ID,
              role: "owner",
            },
            params: contextOverride?.params ?? {},
          }),
    }));

    vi.mock("@/lib/sport-config/service", () => ({
      verifyAcademySportConfig: vi.fn().mockResolvedValue({
        id: SPORT_CONFIG_ID,
        academyId: ACADEMY_ID,
        tenantId: TENANT_ID,
      }),
    }));

    vi.mock("@/db", () => ({
      db: {
        select: vi.fn(() => {
          const result = selectQueue.shift();
          if (!result) throw new Error("Select queue exhausted");
          return createSelectChain(result);
        }),
        update: vi.fn((table: unknown) => ({
          set: vi.fn((data: unknown) => {
            updateCalls.push({ table, data });
            return {
              where: vi.fn().mockResolvedValue(undefined),
            };
          }),
        })),
        insert: vi.fn((table: unknown) => ({
          values: vi.fn((payload: unknown) => {
            insertCalls.push({ table, payload });
            return {
              onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
            };
          }),
        })),
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lista pendientes legacy incluyendo coaches sin scope", async () => {
    queueAcademy();
    selectQueue.push([{ id: ATHLETE_ID, name: "Lucía" }]);
    selectQueue.push([{ id: GROUP_ID, name: "Base 3" }]);
    selectQueue.push([{ id: CLASS_ID, name: "Lunes tarde" }]);
    selectQueue.push([{ id: COACH_ID, name: "Ana Coach" }]);

    const { GET } = await importRoute();
    const response = await GET(new Request(`http://localhost/api/academies/${ACADEMY_ID}/sport-migration`), {
      params: { academyId: ACADEMY_ID },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      athletes: [{ id: ATHLETE_ID, name: "Lucía" }],
      groups: [{ id: GROUP_ID, name: "Base 3" }],
      classes: [{ id: CLASS_ID, name: "Lunes tarde" }],
      coaches: [{ id: COACH_ID, name: "Ana Coach" }],
    });
  });

  it("migra atletas escribiendo primarySportConfigId y athlete_sport_configs", async () => {
    queueAcademy();
    selectQueue.push([{ id: ATHLETE_ID }]);

    const { POST } = await importRoute();
    const response = await POST(
      requestFor({
        entityType: "athletes",
        sportConfigId: SPORT_CONFIG_ID,
        ids: [ATHLETE_ID],
      }),
      { params: { academyId: ACADEMY_ID } } as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { updated: 1 } });
    expect(updateCalls[0]?.data).toMatchObject({ primarySportConfigId: SPORT_CONFIG_ID });
    expect(insertCalls[0]?.payload).toEqual([
      expect.objectContaining({
        tenantId: TENANT_ID,
        athleteId: ATHLETE_ID,
        academySportConfigId: SPORT_CONFIG_ID,
      }),
    ]);
  });

  it("migra grupos y clases por sportConfigId", async () => {
    const { POST } = await importRoute();

    queueAcademy();
    selectQueue.push([{ id: GROUP_ID }]);
    const groupResponse = await POST(
      requestFor({
        entityType: "groups",
        sportConfigId: SPORT_CONFIG_ID,
        ids: [GROUP_ID],
      }),
      { params: { academyId: ACADEMY_ID } } as never
    );

    queueAcademy();
    selectQueue.push([{ id: CLASS_ID }]);
    const classResponse = await POST(
      requestFor({
        entityType: "classes",
        sportConfigId: SPORT_CONFIG_ID,
        ids: [CLASS_ID],
      }),
      { params: { academyId: ACADEMY_ID } } as never
    );

    expect(groupResponse.status).toBe(200);
    expect(classResponse.status).toBe(200);
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0]?.data).toEqual({ sportConfigId: SPORT_CONFIG_ID });
    expect(updateCalls[1]?.data).toEqual({ sportConfigId: SPORT_CONFIG_ID });
    expect(insertCalls).toHaveLength(0);
  });

  it("migra solo coaches sin scope a coach_sport_configs", async () => {
    queueAcademy();
    selectQueue.push([{ id: COACH_ID }]);

    const { POST } = await importRoute();
    const response = await POST(
      requestFor({
        entityType: "coaches",
        sportConfigId: SPORT_CONFIG_ID,
        applyAll: true,
      }),
      { params: { academyId: ACADEMY_ID } } as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { updated: 1 } });
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls[0]?.payload).toEqual([
      {
        tenantId: TENANT_ID,
        coachId: COACH_ID,
        academySportConfigId: SPORT_CONFIG_ID,
      },
    ]);
  });
});
