import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    allowed: true,
    auditError: null as Error | null,
    auditReceipt: null as { meta: Record<string, unknown>; resourceId: string } | null,
    selectedRows: [] as Array<{ id: string }>,
    updatedRows: [] as Array<{ id: string }>,
    events: [] as string[],
    table: "" as "athletes" | "auditLogs" | "",
  };
  const tables = {
    athletes: {
      tableName: "athletes",
      id: { column: "athletes.id" },
      academyId: { column: "athletes.academyId" },
      tenantId: { column: "athletes.tenantId" },
      status: { column: "athletes.status" },
      deletedAt: { column: "athletes.deletedAt" },
    },
    auditLogs: {
      tableName: "auditLogs",
      tenantId: { column: "auditLogs.tenantId" },
      userId: { column: "auditLogs.userId" },
      action: { column: "auditLogs.action" },
      module: { column: "auditLogs.module" },
      meta: { column: "auditLogs.meta" },
      resourceId: { column: "auditLogs.resourceId" },
    },
  };
  const tx = {
    execute: vi.fn(async () => { state.events.push("lock"); }),
    select: vi.fn(() => {
      const chain = {
        from: vi.fn((table: { tableName: string }) => {
          state.table = table.tableName === "auditLogs" ? "auditLogs" : "athletes";
          return chain;
        }),
        where: vi.fn(() => chain),
        limit: vi.fn(async () => {
          state.events.push(`select:${state.table}`);
          return state.table === "auditLogs"
            ? state.auditReceipt ? [state.auditReceipt] : []
            : state.selectedRows;
        }),
      };
      return chain;
    }),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        state.events.push(`update:${String(values.status)}`);
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => state.updatedRows),
          })),
        };
      }),
    })),
  };
  const createAuditLog = vi.fn(async (
    params: { meta?: Record<string, unknown>; resourceId?: string },
    executor: unknown,
  ) => {
    state.events.push(executor === tx ? "audit:transaction" : "audit:outside");
    if (state.auditError) throw state.auditError;
    state.auditReceipt = {
      meta: params.meta ?? {},
      resourceId: params.resourceId ?? "",
    };
  });
  const lockAcademyOperationalWrites = vi.fn(async (client: typeof tx) => {
    await client.execute();
  });
  const assertWithinPlanLimits = vi.fn(async () => ({ readOnly: false }));
  const withTransaction = vi.fn(async <T>(callback: (client: typeof tx) => Promise<T>) => {
    state.events.push("begin");
    try {
      const result = await callback(tx);
      state.events.push("commit");
      return result;
    } catch (error) {
      state.events.push("rollback");
      throw error;
    }
  });
  const authorizeAcademyCapability = vi.fn(async () => ({ allowed: state.allowed }));

  return {
    state,
    tables,
    tx,
    createAuditLog,
    withTransaction,
    authorizeAcademyCapability,
    lockAcademyOperationalWrites,
    assertWithinPlanLimits,
  };
});

vi.mock("@/db/schema", () => ({ athletes: mocks.tables.athletes, auditLogs: mocks.tables.auditLogs }));
vi.mock("@/lib/authz", () => ({ withTenant: (handler: unknown) => handler }));
vi.mock("@/lib/authz/resource-scope", () => ({ authorizeAcademyCapability: mocks.authorizeAcademyCapability }));
vi.mock("@/lib/authz/audit-service", () => ({ createAuditLog: mocks.createAuditLog }));
vi.mock("@/lib/db-transactions", () => ({ withTransaction: mocks.withTransaction }));
vi.mock("@/lib/limits", () => ({
  lockAcademyOperationalWrites: mocks.lockAcademyOperationalWrites,
  assertWithinPlanLimits: mocks.assertWithinPlanLimits,
}));
vi.mock("@/lib/rate-limit", () => ({
  getUserIdentifier: () => "synthetic-user",
  withRateLimit: (handler: unknown) => handler,
}));
vi.mock("@/lib/api-error-handler", () => ({
  handleApiError: () => new Response(JSON.stringify({ ok: false }), { status: 500 }),
}));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ type: "and", conditions }),
  eq: (column: unknown, value: unknown) => ({ type: "eq", column, value }),
  inArray: (column: unknown, value: unknown) => ({ type: "inArray", column, value }),
  isNull: (column: unknown) => ({ type: "isNull", column }),
  isNotNull: (column: unknown) => ({ type: "isNotNull", column }),
  sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({ parts: [...parts], values }),
}));

import { POST as bulkArchive } from "@/app/api/athletes/bulk-archive/route";
import { POST as restoreAthlete } from "@/app/api/athletes/[athleteId]/restore/route";

const tenantId = "10000000-0000-4000-8000-000000000001";
const academyId = "20000000-0000-4000-8000-000000000002";
const athleteA = "30000000-0000-4000-8000-000000000003";
const athleteB = "40000000-0000-4000-8000-000000000004";
const userId = "50000000-0000-4000-8000-000000000005";
const idempotencyKey = "qa-athlete-lifecycle-01";
const context = { tenantId, userId, profile: { role: "owner" } };

function request(path: string, body: unknown, key = idempotencyKey) {
  return new Request(`https://sandbox.invalid${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function json(response: Response) {
  return response.json() as Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.allowed = true;
  mocks.state.auditError = null;
  mocks.state.auditReceipt = null;
  mocks.state.selectedRows = [];
  mocks.state.updatedRows = [];
  mocks.state.events = [];
  mocks.state.table = "";
});

describe("límite HTTP de archivo y restauración de gimnastas", () => {
  it("exige permiso e idempotency key antes de abrir una transacción", async () => {
    const missingKey = await bulkArchive(request("/api/athletes/bulk-archive", {
      academyId,
      athleteIds: [athleteA],
    }, ""), context as never);
    expect(missingKey.status).toBe(400);
    expect(mocks.withTransaction).not.toHaveBeenCalled();

    mocks.state.allowed = false;
    const denied = await restoreAthlete(
      request(`/api/athletes/${athleteA}/restore`, { academyId }),
      { ...context, params: { athleteId: athleteA } } as never,
    );
    expect(denied.status).toBe(403);
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });

  it("archiva y registra el recibo dentro de la transacción, y reenvíos no vuelven a mutar", async () => {
    mocks.state.selectedRows = [{ id: athleteA }, { id: athleteB }];
    mocks.state.updatedRows = [{ id: athleteA }, { id: athleteB }];
    const body = { academyId, athleteIds: [athleteB, athleteA] };
    const first = await bulkArchive(request("/api/athletes/bulk-archive", body), context as never);

    expect(first.status).toBe(200);
    expect(await json(first)).toMatchObject({
      ok: true,
      data: { archivedCount: 2, replayed: false },
    });
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ meta: expect.objectContaining({ athleteIds: [athleteA, athleteB] }) }),
      mocks.tx,
    );
    expect(mocks.state.events).toEqual([
      "begin", "lock", "lock", "select:auditLogs", "select:athletes", "update:archived", "audit:transaction", "commit",
    ]);

    const replay = await bulkArchive(request("/api/athletes/bulk-archive", body), context as never);
    expect(replay.status).toBe(200);
    expect(await json(replay)).toMatchObject({
      ok: true,
      data: { archivedCount: 2, replayed: true },
    });
    expect(mocks.tx.update).toHaveBeenCalledOnce();
    expect(mocks.createAuditLog).toHaveBeenCalledOnce();
  });

  it("revierte el comando si falla la auditoría dentro de la transacción", async () => {
    mocks.state.selectedRows = [{ id: athleteA }];
    mocks.state.updatedRows = [{ id: athleteA }];
    mocks.state.auditError = new Error("audit insert failed");

    const response = await bulkArchive(request("/api/athletes/bulk-archive", {
      academyId,
      athleteIds: [athleteA],
    }), context as never);

    expect(response.status).toBe(500);
    expect(mocks.state.events).toEqual([
      "begin", "lock", "lock", "select:auditLogs", "select:athletes", "update:archived", "audit:transaction", "rollback",
    ]);
    expect(mocks.state.auditReceipt).toBeNull();
  });

  it("revierte la restauración si falla la auditoría dentro de la transacción", async () => {
    mocks.state.selectedRows = [{ id: athleteA }];
    mocks.state.updatedRows = [{ id: athleteA }];
    mocks.state.auditError = new Error("audit insert failed");

    const response = await restoreAthlete(
      request(`/api/athletes/${athleteA}/restore`, { academyId }),
      { ...context, params: { athleteId: athleteA } } as never,
    );

    expect(response.status).toBe(500);
    expect(mocks.state.events).toEqual([
      "begin", "lock", "lock", "select:auditLogs", "select:athletes", "update:active", "audit:transaction", "rollback",
    ]);
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: athleteA, meta: expect.objectContaining({ restored: true }) }),
      mocks.tx,
    );
    expect(mocks.state.auditReceipt).toBeNull();
  });

  it("rechaza reutilizar la clave de archivo con una selección distinta sin otra mutación", async () => {
    mocks.state.selectedRows = [{ id: athleteA }];
    mocks.state.updatedRows = [{ id: athleteA }];
    const first = await bulkArchive(request("/api/athletes/bulk-archive", {
      academyId,
      athleteIds: [athleteA],
    }), context as never);
    expect(first.status).toBe(200);
    const eventCountAfterFirst = mocks.state.events.length;

    const conflict = await bulkArchive(request("/api/athletes/bulk-archive", {
      academyId,
      athleteIds: [athleteB],
    }), context as never);

    expect(conflict.status).toBe(409);
    expect(await json(conflict)).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    expect(mocks.state.events.slice(eventCountAfterFirst)).toEqual([
      "begin", "lock", "lock", "select:auditLogs", "rollback",
    ]);
    expect(mocks.tx.update).toHaveBeenCalledOnce();
    expect(mocks.createAuditLog).toHaveBeenCalledOnce();
  });

  it("restaura con el mismo recibo y hace replay sin una segunda actualización", async () => {
    mocks.state.selectedRows = [{ id: athleteA }];
    mocks.state.updatedRows = [{ id: athleteA }];
    const body = { academyId };
    const path = `/api/athletes/${athleteA}/restore`;
    const restoreContext = { ...context, params: { athleteId: athleteA } } as never;

    const first = await restoreAthlete(request(path, body), restoreContext);
    expect(first.status).toBe(200);
    expect(await json(first)).toMatchObject({ ok: true, data: { restored: true, replayed: false } });
    expect(mocks.assertWithinPlanLimits).toHaveBeenCalledWith(tenantId, academyId, "athletes", mocks.tx);
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: athleteA, meta: expect.objectContaining({ restored: true }) }),
      mocks.tx,
    );

    const replay = await restoreAthlete(request(path, body), restoreContext);
    expect(replay.status).toBe(200);
    expect(await json(replay)).toMatchObject({ ok: true, data: { restored: true, replayed: true } });
    expect(mocks.tx.update).toHaveBeenCalledOnce();
    expect(mocks.createAuditLog).toHaveBeenCalledOnce();
  });
});
