import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let GET: typeof import("@/app/api/classes/route").GET;
let POST: typeof import("@/app/api/classes/route").POST;

const originalEnv = { ...process.env };
const ACADEMY_ID = "11111111-1111-1111-1111-111111111111";

let selectQueue: any[] = [];
let insertCalls: Array<{ table: unknown; payload: unknown }> = [];
let assertWithinPlanLimits: ReturnType<typeof vi.fn>;

const createSelectChain = (finalMethod: "where" | "orderBy" | "limit", result: any) => {
  const chain: Record<string, any> = {};
  const methods = ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"] as const;

  methods.forEach((method) => {
    if (method === finalMethod) {
      chain[method] = vi.fn(() => Promise.resolve(result));
    } else {
      chain[method] = vi.fn(() => chain);
    }
  });

  return chain;
};

describe("API /api/classes", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv };
    selectQueue = [];
    insertCalls = [];

    vi.mock("@/lib/authz", () => ({
      withTenant:
        (handler: (request: Request, context: any) => Promise<Response>) =>
        (request: Request, ctx: any = {}) =>
          handler(request, {
            tenantId: "tenant-123",
            userId: "user-123",
            profile: { id: "profile-1", role: "admin", tenantId: "tenant-123" },
            ...ctx,
          }),
    }));

    vi.mock("@/lib/limits", () => ({
      assertWithinPlanLimits: vi.fn().mockResolvedValue(undefined),
    }));
    const limitsModule = await import("@/lib/limits");
    assertWithinPlanLimits = limitsModule.assertWithinPlanLimits as unknown as ReturnType<
      typeof vi.fn
    >;

    vi.mock("@/lib/permissions", () => ({
      verifyAcademyAccess: vi.fn().mockResolvedValue({ allowed: true }),
    }));

    vi.mock("@/db", () => ({
      db: {
        insert: vi.fn((table) => ({
          values: (payload: unknown) => {
            insertCalls.push({ table, payload });
            return Promise.resolve(undefined);
          },
        })),
        select: vi.fn(() => {
          const chain = selectQueue.shift();
          if (!chain) {
            throw new Error("Select queue exhausted");
          }
          return chain;
        }),
      },
    }));

    const classesModule = await import("@/app/api/classes/route");
    GET = classesModule.GET;
    POST = classesModule.POST;
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("lista clases sin asignaciones", async () => {
    selectQueue.push(
      createSelectChain("orderBy", [
        {
          id: "class-1",
          name: "Equipo FIG Avanzado",
          academyId: ACADEMY_ID,
          academyName: "Gymna Training Center",
          startTime: "17:00",
          endTime: "19:00",
          capacity: 20,
        },
      ])
    );
    selectQueue.push(createSelectChain("where", []));

    const request = new Request(`http://localhost/api/classes?academyId=${ACADEMY_ID}`);
    const response = await GET(request, {} as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: "class-1",
      name: "Equipo FIG Avanzado",
      weekdays: [],
    });
  });

  it("lista clases con entrenadores cuando includeAssignments=true", async () => {
    selectQueue.push(
      createSelectChain("orderBy", [
        {
          id: "class-1",
          name: "Equipo FIG Avanzado",
          academyId: ACADEMY_ID,
          academyName: "Gymna Training Center",
          startTime: "17:00",
          endTime: "19:00",
          capacity: 20,
        },
      ])
    );
    selectQueue.push(
      createSelectChain("where", [
        {
          classId: "class-1",
          weekday: 1,
        },
      ])
    );
    selectQueue.push(
      createSelectChain("where", [
        {
          classId: "class-1",
          coachId: "coach-1",
          coachName: "Luis Romero",
          coachEmail: "coach@gymna.app",
        },
      ])
    );

    const request = new Request(
      `http://localhost/api/classes?academyId=${ACADEMY_ID}&includeAssignments=true`
    );
    const response = await GET(request, {} as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0].weekdays).toEqual([1]);
    expect(body.items[0].coaches).toEqual([
      {
        id: "coach-1",
        name: "Luis Romero",
        email: "coach@gymna.app",
      },
    ]);
  });

  it("crea una clase aplicando límites del plan", async () => {
    const request = new Request("http://localhost/api/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        academyId: ACADEMY_ID,
        name: "Grupo Avanzado",
        weekdays: [2],
        startTime: "18:00",
        endTime: "20:00",
        capacity: 24,
      }),
    });

    const response = await POST(request, {} as any);

    expect(response.status).toBe(200);
    expect(insertCalls).toHaveLength(2);
    const classPayload = insertCalls[0]?.payload as Record<string, unknown>;
    expect(classPayload).toMatchObject({
      academyId: ACADEMY_ID,
      name: "Grupo Avanzado",
      capacity: 24,
    });
    const weekdaysPayload = insertCalls[1]?.payload as Array<Record<string, unknown>>;
    expect(Array.isArray(weekdaysPayload)).toBe(true);
    expect(weekdaysPayload?.[0]).toMatchObject({
      weekday: 2,
    });
    expect(assertWithinPlanLimits).toHaveBeenCalledWith("tenant-123", ACADEMY_ID, "classes");
  });

  it("rechaza creación sin tenant en contexto", async () => {
    const request = new Request("http://localhost/api/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        academyId: ACADEMY_ID,
        name: "Grupo Avanzado",
      }),
    });

    const response = await POST(request, { tenantId: "", profile: { role: "admin" } } as any);

    expect(response.status).toBe(400);
    expect(insertCalls).toHaveLength(0);
  });
});


