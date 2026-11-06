import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TransactionClient } from "@/lib/db-transactions";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), event: vi.fn(), audit: vi.fn(), outbox: vi.fn(), price: vi.fn(), entitlement: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/modules/enrollments/application/enrollment-price-service", () => ({ assignEnrollmentPriceInTransaction: mocks.price }));
vi.mock("@/modules/saas-billing/application/entitlement-service", () => ({ lockOrganizationForSaasMutation: mocks.lock, resolveEffectiveOrganizationEntitlement: mocks.entitlement }));
vi.mock("@/modules/shared/infrastructure/transactional-records", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/shared/infrastructure/transactional-records")>(),
  lockCommand: mocks.lock, findOutboxEvent: mocks.event, appendAuditEntry: mocks.audit, appendOutboxEvent: mocks.outbox,
}));
import { enrollments, organizationMembers, memberLocationScopes } from "@/db/zaltyko-schema";
import { createEnrollmentInTransaction, transitionEnrollmentInTransaction, transferEnrollment } from "@/modules/enrollments/application/enrollment-service";

const org = "10000000-0000-4000-8000-000000000001";
const site = "10000000-0000-4000-8000-000000000002";
const memberId = "10000000-0000-4000-8000-000000000003";
const userId = "10000000-0000-4000-8000-000000000004";
const enrollmentId = "10000000-0000-4000-8000-000000000005";
const athleteId = "10000000-0000-4000-8000-000000000006";
const classId = "10000000-0000-4000-8000-000000000007";
const targetId = "10000000-0000-4000-8000-000000000008";
const targetSite = "10000000-0000-4000-8000-000000000009";
const targetClass = "10000000-0000-4000-8000-000000000010";
const actor = { userId, memberId };
const create = { organizationId: org, locationId: site, athleteId, classTemplateId: classId, startsOn: "2026-10-22", status: "pending" as const, source: "owner" as const, pricePlanId: null, idempotencyKey: "synthetic-create-key", actor };
const transition = { organizationId: org, enrollmentId, expectedVersion: 1, toStatus: "cancelled" as const, effectiveOn: "2026-10-22", idempotencyKey: "synthetic-transition-key", actor };
const transfer = { organizationId: org, enrollmentId, expectedVersion: 1, targetLocationId: targetSite, targetClassTemplateId: targetClass, startsOn: "2026-10-22", idempotencyKey: "synthetic-transfer-key", actor };
type Kind = "create" | "transition" | "transfer";
const kinds: Kind[] = ["create", "transition", "transfer"];
const dialect = new PgDialect();
let member: { id: string; role: string; locationScopeMode: string } | null;
let allowedSites: string[];
let records: Array<Record<string, unknown>>;
let tx: TransactionClient;
let writes: ReturnType<typeof vi.fn>;
let execute: ReturnType<typeof vi.fn>;

function eventFor(kind: Kind) {
  const payload = kind === "create"
    ? { enrollmentId, athleteId, classTemplateId: classId, status: "pending", startsOn: create.startsOn, source: "owner", pricePlanId: null }
    : kind === "transition" ? { enrollmentId, toStatus: "cancelled", effectiveOn: transition.effectiveOn }
      : { sourceEnrollmentId: enrollmentId, targetEnrollmentId: targetId, targetLocationId: targetSite, targetClassTemplateId: targetClass, startsOn: transfer.startsOn };
  return { aggregateId: kind === "transfer" ? targetId : enrollmentId, locationId: site, payload };
}
function run(kind: Kind, identity = actor) {
  if (kind === "create") return createEnrollmentInTransaction(tx, { ...create, actor: identity });
  if (kind === "transition") return transitionEnrollmentInTransaction(tx, { ...transition, actor: identity });
  return transferEnrollment({ ...transfer, actor: identity });
}
function expectNoWrites() {
  expect(writes).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.outbox).not.toHaveBeenCalled();
  expect(mocks.price).not.toHaveBeenCalled();
  for (const [query] of execute.mock.calls) expect(dialect.sqlToQuery(query).sql.trim()).toMatch(/^select\b/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  member = { id: memberId, role: "owner", locationScopeMode: "all" };
  allowedSites = [site, targetSite];
  records = [{ id: enrollmentId, organizationId: org, locationId: site, classTemplateId: classId, athleteId, status: "active", startsOn: "2026-10-22", version: 1 }, { id: targetId, organizationId: org, locationId: targetSite, classTemplateId: targetClass, athleteId, status: "pending", startsOn: "2026-10-22", version: 1 }];
  writes = vi.fn(() => { throw new Error("Unexpected write in replay/denial test"); });
  execute = vi.fn(async query => ({ rows: /count\(\*\)/i.test(dialect.sqlToQuery(query).sql) ? [{ athletes: "31", groups: "4", classes: "11" }] : [{ id: org }] }));
  const select = vi.fn(() => {
    let table: unknown;
    let params: unknown[] = [];
    const query = {
      from: (next: unknown) => { table = next; return query; },
      where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => { params = dialect.sqlToQuery(clause).params; return query; },
      limit: async () => {
        if (table === enrollments) return records.filter(row => params.includes(row.organizationId) && params.includes(row.id));
        if (table === organizationMembers) return member && [org, userId, memberId, "active"].every(value => params.includes(value)) ? [member] : [];
        if (table === memberLocationScopes) return [org, memberId].every(value => params.includes(value)) && allowedSites.some(value => params.includes(value)) ? [{ id: "synthetic-scope" }] : [];
        throw new Error("Unexpected table in replay/denial test");
      },
    };
    return query;
  });
  tx = { select, execute, insert: writes, update: writes, delete: writes } as unknown as TransactionClient;
  mocks.transaction.mockImplementation(async callback => callback(tx));
  mocks.entitlement.mockResolvedValue({ planCode: "free", limits: { athleteLimit: 30, groupLimit: 3, classLimit: 10, academyLimit: 1 } });
});

describe("replay autorizado de inscripciones con academia en solo lectura", () => {
  it("una transición sin inscripción ni prueba de ejecución mantiene NOT_FOUND", async () => {
    records = [];
    mocks.event.mockResolvedValue(null);
    await expect(run("transition")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expectNoWrites();
  });
  it.each(["create", "transfer"] as const)("un replay %s sin resultado almacenado conserva el conflicto", async kind => {
    mocks.event.mockResolvedValue(eventFor(kind));
    records = kind === "create" ? [] : [records[0]];
    await expect(run(kind)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expectNoWrites();
  });
  it.each((["create", "transfer"] as const).flatMap(kind =>
    [undefined, null, 42, "", "not-a-uuid", "10000000-0000-4000-8000-000000000099"].map(value => ({ kind, value }))
  ))("un evento $kind con referencia $value no vuelve al camino de escritura", async ({ kind, value }) => {
    const event = eventFor(kind);
    const payload = event.payload as Record<string, unknown>;
    const field = kind === "create" ? "enrollmentId" : "targetEnrollmentId";
    if (value === undefined) delete payload[field];
    else payload[field] = value;
    mocks.event.mockResolvedValue(event);
    await expect(run(kind)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expectNoWrites();
  });
  it.each(kinds)("un replay %s exige coherencia entre aggregateId y resultado", async kind => {
    const event = eventFor(kind);
    event.aggregateId = "10000000-0000-4000-8000-000000000099";
    mocks.event.mockResolvedValue(event);
    await expect(run(kind)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expectNoWrites();
  });
  it("un replay create con misma clave y payload pero distinta sede es conflicto", async () => {
    mocks.event.mockResolvedValue({ ...eventFor("create"), locationId: targetSite });
    await expect(run("create")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expectNoWrites();
  });
  it.each(kinds)("recupera %s ya realizado sin exigir nueva capacidad ni escribir", async kind => {
    mocks.event.mockResolvedValue(eventFor(kind));
    await expect(run(kind)).resolves.toEqual(kind === "transfer" ? { source: records[0], target: records[1] } : records[0]);
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expectNoWrites();
  });
  it.each(kinds)("un comando nuevo %s sigue bloqueado por el exceso", async kind => {
    mocks.event.mockResolvedValue(null);
    await expect(run(kind)).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY", status: 409 });
    expect(mocks.entitlement).toHaveBeenCalled();
    expectNoWrites();
  });
  it.each(kinds)("recupera %s con alcance seleccionado válido sin escribir", async kind => {
    member!.locationScopeMode = "selected";
    mocks.event.mockResolvedValue(eventFor(kind));
    await expect(run(kind)).resolves.toEqual(kind === "transfer" ? { source: records[0], target: records[1] } : records[0]);
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expectNoWrites();
  });
  it.each(kinds)("un replay %s no admite un actor sin membresía", async kind => {
    member = null;
    mocks.event.mockResolvedValue(eventFor(kind));
    await expect(run(kind)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expectNoWrites();
  });
  it.each(kinds)("un replay %s no admite un rol ajeno a la operación", async kind => {
    member!.role = "coach";
    mocks.event.mockResolvedValue(eventFor(kind));
    await expect(run(kind)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expectNoWrites();
  });
  it.each(kinds)("un replay %s no admite otro usuario con el mismo miembro", async kind => {
    mocks.event.mockResolvedValue(eventFor(kind));
    await expect(run(kind, { ...actor, userId: "10000000-0000-4000-8000-000000000011" })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expectNoWrites();
  });
  it.each(kinds)("un replay %s no admite otro miembro con el mismo usuario", async kind => {
    mocks.event.mockResolvedValue(eventFor(kind));
    await expect(run(kind, { ...actor, memberId: "10000000-0000-4000-8000-000000000012" })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expectNoWrites();
  });
  it.each(kinds)("un replay %s no admite perder el alcance de la sede", async kind => {
    member!.locationScopeMode = "selected";
    allowedSites = [];
    mocks.event.mockResolvedValue(eventFor(kind));
    await expect(run(kind)).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    expectNoWrites();
  });
  it.each(kinds)("un replay %s rechaza un cuerpo de evento distinto", async kind => {
    const event = eventFor(kind);
    if (kind === "transition") Object.assign(event.payload, { effectiveOn: "2026-11-01" });
    else Object.assign(event.payload, { startsOn: "2026-11-01" });
    mocks.event.mockResolvedValue(event);
    await expect(run(kind)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expectNoWrites();
  });
  it.each([site, targetSite])("transferir recupera solo con autorización en ambas sedes: acceso a %s", async onlySite => {
    member!.locationScopeMode = "selected";
    allowedSites = [onlySite];
    mocks.event.mockResolvedValue(eventFor("transfer"));
    await expect(run("transfer")).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    expectNoWrites();
  });
});
