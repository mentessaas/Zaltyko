import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TransactionClient } from "@/lib/db-transactions";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), event: vi.fn(), audit: vi.fn(), outbox: vi.fn(), entitlement: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/modules/saas-billing/application/entitlement-service", () => ({ lockOrganizationForSaasMutation: mocks.lock, resolveEffectiveOrganizationEntitlement: mocks.entitlement }));
vi.mock("@/modules/shared/infrastructure/transactional-records", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/shared/infrastructure/transactional-records")>(),
  lockCommand: mocks.lock, lockGroupCapacity: mocks.lock, findOutboxEvent: mocks.event, appendAuditEntry: mocks.audit, appendOutboxEvent: mocks.outbox,
}));
import { athletes, auditLog, groups, groupMemberships, memberLocationScopes, organizationMembers, outboxEvents } from "@/db/zaltyko-schema";
import { createAthleteForGroup, addGroupMembership, recoverCreatedAthleteForGroup, transitionGroupMembership } from "@/modules/groups/application/group-membership-service";
import {
  eligibleGroupEnrollmentStatuses,
  eligibleGroupMembershipStatuses,
} from "@/modules/groups/application/group-athlete-location-eligibility";

const org = "20000000-0000-4000-8000-000000000001";
const site = "20000000-0000-4000-8000-000000000002";
const memberId = "20000000-0000-4000-8000-000000000003";
const userId = "20000000-0000-4000-8000-000000000004";
const groupId = "20000000-0000-4000-8000-000000000005";
const athleteId = "20000000-0000-4000-8000-000000000006";
const membershipId = "20000000-0000-4000-8000-000000000007";
const recoveryKey = "owner-create-athlete:synthetic-recovery";
const actor = { userId, memberId };
const base = { organizationId: org, groupId, actor, idempotencyKey: "synthetic-group-replay" };
const create = { ...base, givenName: "Prueba", familyName: "Sintética" };
const add = { ...base, athleteId, startsOn: "2026-10-22", status: "active" as const };
const transition = { ...base, membershipId, expectedStatus: "active" as const, toStatus: "paused" as const, effectiveOn: "2026-10-22", reasonCode: null };
type Kind = "create" | "add" | "transition";
const kinds: Kind[] = ["create", "add", "transition"];
type Event = { aggregateId: string; payload: Record<string, string | null> };
const dialect = new PgDialect();
let member: { id: string; role: string; locationScopeMode: string } | null;
let group: { id: string; organizationId: string; locationId: string; capacity: null; status: string } | null;
let athlete: { id: string; organizationId: string; givenName: string; familyName: string } | null;
let membership: { id: string; organizationId: string; athleteId: string; groupId: string; status: string; startsOn: string } | null;
let scoped: boolean;
let usage: { athletes: string; groups: string; classes: string };
let events: Record<string, Event>;
let recoveryEvents: Array<Record<string, unknown>>;
let recoveryAudit: Record<string, unknown> | null;
let recoveryOutboxLimit: number | null;
let writes: ReturnType<typeof vi.fn>;
let execute: ReturnType<typeof vi.fn>;
let athleteLocationRelationships: Array<
  | { kind: "group"; locationId: string; groupId: string; status: string; groupStatus: string }
  | { kind: "enrollment"; locationId: string; status: string }
>;
let groupLocationEligibilityChecks: number;
let groupLocationEligibilityAccepted: number;

function athleteHasEligibleRelationshipAtGroupLocation() {
  return athleteLocationRelationships.some((relationship) => {
    if (relationship.locationId !== site) return false;
    if (relationship.kind === "group") {
      return relationship.groupId !== groupId &&
        relationship.groupStatus === "active" &&
        eligibleGroupMembershipStatuses.includes(relationship.status as typeof eligibleGroupMembershipStatuses[number]);
    }
    return eligibleGroupEnrollmentStatuses.includes(relationship.status as typeof eligibleGroupEnrollmentStatuses[number]);
  });
}

function prepare(kind: Kind) {
  if (kind === "create") events = {
    "athlete.created": { aggregateId: athleteId, payload: { athleteId } },
    "group.membership_added": { aggregateId: membershipId, payload: { membershipId, groupId, athleteId } },
  };
  else if (kind === "add") events = { "group.membership_added": { aggregateId: membershipId, payload: { membershipId, groupId, startsOn: add.startsOn, status: "active" } } };
  else events = { "group.membership_paused": { aggregateId: membershipId, payload: { membershipId, fromStatus: "active", toStatus: "paused", effectiveOn: transition.effectiveOn, reasonCode: null } } };
}
function prepareRecovery() {
  recoveryEvents = [
    {
      organizationId: org, locationId: site, eventName: "athlete.created", eventVersion: 1,
      aggregateType: "athlete", aggregateId: athleteId, idempotencyKey: recoveryKey,
      payload: { athleteId },
    },
    {
      organizationId: org, locationId: site, eventName: "group.membership_added", eventVersion: 1,
      aggregateType: "group_membership", aggregateId: membershipId, idempotencyKey: recoveryKey,
      payload: { membershipId, groupId, athleteId, startsOn: "2026-10-22", status: "active" },
    },
  ];
  recoveryAudit = {
    organizationId: org, locationId: site, actorUserId: userId,
    action: "athlete.created_and_added_to_group", targetType: "athlete", targetId: athleteId,
    idempotencyKey: `athlete-created:${recoveryKey}`,
    after: { groupId, membershipId },
  };
}
function run(kind: Kind, identity = actor) {
  if (kind === "create") return createAthleteForGroup({ ...create, actor: identity });
  if (kind === "add") return addGroupMembership({ ...add, actor: identity });
  return transitionGroupMembership({ ...transition, actor: identity });
}
function expectNoWrites() {
  expect(writes).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.outbox).not.toHaveBeenCalled();
  for (const [query] of execute.mock.calls) expect(dialect.sqlToQuery(query).sql.trim()).toMatch(/^select\b/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  member = { id: memberId, role: "owner", locationScopeMode: "all" };
  group = { id: groupId, organizationId: org, locationId: site, capacity: null, status: "active" };
  athlete = { id: athleteId, organizationId: org, givenName: create.givenName, familyName: create.familyName };
  membership = { id: membershipId, organizationId: org, athleteId, groupId, status: "active", startsOn: "2026-10-22" };
  scoped = true;
  usage = { athletes: "31", groups: "4", classes: "11" };
  events = {};
  recoveryEvents = [];
  recoveryAudit = null;
  recoveryOutboxLimit = null;
  athleteLocationRelationships = [{
    kind: "group",
    locationId: site,
    groupId: "20000000-0000-4000-8000-000000000010",
    status: "active",
    groupStatus: "active",
  }];
  groupLocationEligibilityChecks = 0;
  groupLocationEligibilityAccepted = 0;
  writes = vi.fn(() => { throw new Error("Unexpected write in replay/denial test"); });
  execute = vi.fn(async query => {
    const text = dialect.sqlToQuery(query).sql;
    if (/count\(\*\)::text as count/i.test(text)) return { rows: [{ count: usage.athletes }] };
    return { rows: /count\(\*\)/i.test(text) ? [usage] : [{ id: org }] };
  });
  const select = vi.fn(() => {
    let table: unknown;
    let params: unknown[] = [];
    let whereSql = "";
    const rowsForQuery = () => {
      if (table === outboxEvents) return recoveryEvents.filter(row => row.organizationId === org && row.idempotencyKey === recoveryKey);
      if (table === auditLog) return recoveryAudit && params.includes(org) && params.includes(`athlete-created:${recoveryKey}`) ? [recoveryAudit] : [];
      return [];
    };
    const query = {
      from: (next: unknown) => { table = next; return query; },
      innerJoin: () => query,
      where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const compiled = dialect.sqlToQuery(clause);
        params = compiled.params;
        whereSql = compiled.sql;
        return query;
      },
      then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(rowsForQuery()).then(resolve, reject),
      limit: async (count = 1) => {
        if (table === outboxEvents) recoveryOutboxLimit = count;
        if (table === groups) return group && [group.organizationId, group.id].every(value => params.includes(value)) ? [group] : [];
        if (table === athletes) {
          const matchesIdentity = athlete && [athlete.organizationId, athlete.id].every(value => params.includes(value));
          const isEligibilityGate = whereSql.includes("eligible_membership") && whereSql.includes("eligible_enrollment");
          if (isEligibilityGate) groupLocationEligibilityChecks += 1;
          const eligible = matchesIdentity && (!isEligibilityGate || athleteHasEligibleRelationshipAtGroupLocation());
          if (isEligibilityGate && eligible) groupLocationEligibilityAccepted += 1;
          return eligible ? [athlete] : [];
        }
        if (table === groupMemberships) return membership && [membership.organizationId, membership.id].every(value => params.includes(value)) ? [membership] : [];
        if (table === auditLog || table === outboxEvents) return rowsForQuery().slice(0, count);
        if (table === organizationMembers) return member && [org, userId, memberId, "active"].every(value => params.includes(value)) ? [member] : [];
        if (table === memberLocationScopes) return scoped && [org, memberId, site].every(value => params.includes(value)) ? [{ id: "synthetic-scope" }] : [];
        throw new Error("Unexpected table in replay/denial test");
      },
    };
    return query;
  });
  const tx = { select, execute, insert: writes, update: writes, delete: writes } as unknown as TransactionClient;
  mocks.transaction.mockImplementation(async callback => callback(tx));
  mocks.event.mockImplementation(async (_tx, { eventName }) => events[eventName] ?? null);
  mocks.entitlement.mockResolvedValue({ planCode: "free", limits: { athleteLimit: 30, groupLimit: 3, classLimit: 10, academyLimit: 1 } });
});

describe("replay autorizado de gimnastas y pertenencias en solo lectura", () => {
  it("una transición sin pertenencia ni prueba de ejecución mantiene NOT_FOUND", async () => {
    membership = null;
    await expect(run("transition")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expectNoWrites();
  });
  it.each(["athlete", "membership"] as const)("el alta previa sin resultado %s conserva el conflicto", async missing => {
    prepare("create");
    if (missing === "athlete") athlete = null;
    else membership = null;
    await expect(run("create")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expectNoWrites();
  });
  it("una incorporación previa sin pertenencia almacenada conserva el conflicto", async () => {
    prepare("add");
    membership = null;
    await expect(run("add")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expectNoWrites();
  });
  it.each([undefined, null, 42, "", "not-a-uuid", "20000000-0000-4000-8000-000000000099"])("una incorporación previa con referencia %s no inicia otra escritura", async value => {
    prepare("add");
    const payload = events["group.membership_added"].payload as Record<string, unknown>;
    if (value === undefined) delete payload.membershipId;
    else payload.membershipId = value;
    await expect(run("add")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expectNoWrites();
  });
  it.each(["add", "transition"] as const)("un replay %s exige coherencia entre aggregateId y pertenencia", async kind => {
    prepare(kind);
    events[kind === "add" ? "group.membership_added" : "group.membership_paused"].aggregateId = "20000000-0000-4000-8000-000000000099";
    await expect(run(kind)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expectNoWrites();
  });
  it.each(kinds)("recupera %s sin nueva capacidad ni escrituras", async kind => {
    prepare(kind);
    await expect(run(kind)).resolves.toEqual(membership);
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expectNoWrites();
  });
  it("recupera el recibo del alta con la pareja de outbox y el after de auditoría emitidos", async () => {
    prepareRecovery();
    await expect(recoverCreatedAthleteForGroup({ ...base, idempotencyKey: recoveryKey })).resolves.toEqual(membership);
    expect(writes).not.toHaveBeenCalled();
    expect(recoveryOutboxLimit).toBe(3);
  });
  it("rechaza un recibo ambiguo con tres eventos sin leer más de tres", async () => {
    prepareRecovery();
    recoveryEvents.push({ ...recoveryEvents[1] });
    await expect(recoverCreatedAthleteForGroup({ ...base, idempotencyKey: recoveryKey })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(writes).not.toHaveBeenCalled();
    expect(recoveryOutboxLimit).toBe(3);
  });
  it.each(["missing-membership-event", "wrong-group", "wrong-audit-after"] as const)("rechaza un recibo de alta parcial o incoherente: %s", async issue => {
    prepareRecovery();
    if (issue === "missing-membership-event") recoveryEvents.pop();
    if (issue === "wrong-group") (recoveryEvents[1]!.payload as Record<string, unknown>).groupId = "20000000-0000-4000-8000-000000000099";
    if (issue === "wrong-audit-after") recoveryAudit = { ...recoveryAudit!, after: { groupId, membershipId: "20000000-0000-4000-8000-000000000099" } };
    await expect(recoverCreatedAthleteForGroup({ ...base, idempotencyKey: recoveryKey })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(writes).not.toHaveBeenCalled();
  });
  it("deniega la recuperación si el actor auditado o el alcance de sede no coincide", async () => {
    prepareRecovery();
    recoveryAudit = { ...recoveryAudit!, actorUserId: "20000000-0000-4000-8000-000000000099" };
    await expect(recoverCreatedAthleteForGroup({ ...base, idempotencyKey: recoveryKey })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    prepareRecovery();
    member!.locationScopeMode = "selected";
    scoped = false;
    await expect(recoverCreatedAthleteForGroup({ ...base, idempotencyKey: recoveryKey })).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    expect(writes).not.toHaveBeenCalled();
  });
  it.each(kinds)("recupera %s con alcance seleccionado válido", async kind => {
    prepare(kind);
    member!.locationScopeMode = "selected";
    await expect(run(kind)).resolves.toEqual(membership);
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expectNoWrites();
  });
  it.each([
    ["pertenencia a otro grupo activo en la sede", [{ kind: "group", locationId: site, groupId: "20000000-0000-4000-8000-000000000010", status: "paused", groupStatus: "active" }], true],
    ["inscripción abierta en la sede", [{ kind: "enrollment", locationId: site, status: "trial" }], true],
    ["relación solo en otra sede", [{ kind: "group", locationId: "20000000-0000-4000-8000-000000000011", groupId: "20000000-0000-4000-8000-000000000010", status: "active", groupStatus: "active" }], false],
    ["ausencia de relación", [], false],
  ] as const)("el alta directa aplica ámbito por sede: %s", async (_name, relationships, expectedEligible) => {
    athleteLocationRelationships = [...relationships];
    usage = { athletes: "20", groups: "2", classes: "5" };
    writes = vi.fn(() => ({ values: () => ({ returning: async () => [membership] }) }));

    if (expectedEligible) {
      await expect(run("add")).resolves.toEqual(membership);
      expect(writes).toHaveBeenCalled();
    } else {
      await expect(run("add")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
      expectNoWrites();
    }
    expect(groupLocationEligibilityChecks).toBe(1);
    expect(groupLocationEligibilityAccepted).toBe(expectedEligible ? 1 : 0);
  });
  it.each(kinds)("un comando nuevo %s sigue bloqueado por exceso", async kind => {
    await expect(run(kind)).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY", status: 409 });
    expect(mocks.entitlement).toHaveBeenCalled();
    expectNoWrites();
  });
  it("con 30 gimnastas y sin exceso global no permite crear la ficha 31", async () => {
    usage = { athletes: "30", groups: "3", classes: "10" };
    await expect(run("create")).rejects.toMatchObject({ code: "CAPACITY_FULL", status: 409, details: { current: 30, limit: 30 } });
    expectNoWrites();
  });
  it.each(kinds)("un replay %s exige membresía activa", async kind => {
    prepare(kind);
    member = null;
    await expect(run(kind)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expectNoWrites();
  });
  it.each(kinds)("un replay %s exige rol permitido", async kind => {
    prepare(kind);
    member!.role = "coach";
    await expect(run(kind)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expectNoWrites();
  });
  it.each(kinds)("un replay %s no admite otro usuario con el mismo miembro", async kind => {
    prepare(kind);
    await expect(run(kind, { ...actor, userId: "20000000-0000-4000-8000-000000000008" })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expectNoWrites();
  });
  it.each(kinds)("un replay %s no admite otro miembro con el mismo usuario", async kind => {
    prepare(kind);
    await expect(run(kind, { ...actor, memberId: "20000000-0000-4000-8000-000000000009" })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expectNoWrites();
  });
  it.each(kinds)("un replay %s exige acceso a la sede", async kind => {
    prepare(kind);
    member!.locationScopeMode = "selected";
    scoped = false;
    await expect(run(kind)).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    expectNoWrites();
  });
  it.each(kinds)("un replay %s rechaza un evento de otro grupo o fecha", async kind => {
    prepare(kind);
    const event = events[kind === "transition" ? "group.membership_paused" : "group.membership_added"];
    if (kind === "transition") event.payload.effectiveOn = "2026-11-01";
    else event.payload.groupId = "20000000-0000-4000-8000-000000000010";
    await expect(run(kind)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expectNoWrites();
  });
  it.each(["givenName", "familyName"] as const)("el alta anterior no admite cambiar %s", async field => {
    prepare("create");
    athlete![field] = "Otra ficha sintética";
    await expect(run("create")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expectNoWrites();
  });
  it.each(["athlete.created", "group.membership_added"])("un alta anterior sin %s no se completa con escrituras", async missing => {
    prepare("create");
    delete events[missing];
    await expect(run("create")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expectNoWrites();
  });
  it("el alta ya realizada se recupera aunque el grupo haya sido archivado", async () => {
    prepare("create");
    group!.status = "archived";
    await expect(run("create")).resolves.toEqual(membership);
    expectNoWrites();
  });
  it.each(["all", "selected"])("recupera la incorporación previa en grupo archivado con alcance %s", async scope => {
    prepare("add");
    group!.status = "archived";
    membership!.status = "ended";
    member!.locationScopeMode = scope;
    await expect(run("add")).resolves.toEqual(membership);
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expectNoWrites();
  });
  it("archivar el grupo no permite consultar el replay sin acceso a su sede", async () => {
    prepare("add");
    group!.status = "archived";
    member!.locationScopeMode = "selected";
    scoped = false;
    await expect(run("add")).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    expectNoWrites();
  });
  it("archivar el grupo no permite consultar el replay sin membresía", async () => {
    prepare("add");
    group!.status = "archived";
    member = null;
    await expect(run("add")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expectNoWrites();
  });
  it.each(["create", "add"] as const)("el comando nuevo %s no se permite en grupo archivado", async kind => {
    group!.status = "archived";
    await expect(run(kind)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expectNoWrites();
  });
  it("un replay no inventa el grupo si ya no está disponible", async () => {
    prepare("add");
    group = null;
    await expect(run("add")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expectNoWrites();
  });
});
