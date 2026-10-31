import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  assertAccess: vi.fn(),
  assertWritable: vi.fn(),
  lock: vi.fn(),
  findEvent: vi.fn(),
  assertPayload: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/modules/saas-billing/application/organization-usage", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/saas-billing/application/organization-usage")>(),
  assertOrganizationOperationalWritable: mocks.assertWritable,
}));
vi.mock("@/modules/shared/infrastructure/operational-authorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/modules/shared/infrastructure/operational-authorization")>();
  mocks.assertAccess.mockImplementation(actual.assertOperationalAccess);
  return { ...actual, assertOperationalAccess: mocks.assertAccess };
});
vi.mock("@/modules/shared/infrastructure/transactional-records", async importOriginal => {
  const actual = await importOriginal<typeof import("@/modules/shared/infrastructure/transactional-records")>();
  mocks.assertPayload.mockImplementation(actual.assertIdempotencyPayload);
  return {
    ...actual,
    appendAuditEntry: mocks.appendAudit,
    appendOutboxEvent: mocks.appendOutbox,
    assertIdempotencyPayload: mocks.assertPayload,
    findOutboxEvent: mocks.findEvent,
    lockCommand: mocks.lock,
  };
});

import {
  auditLog,
  athletes,
  families,
  familyMembers,
  familyPayers,
  memberLocationScopes,
  outboxEvents,
  organizationMembers,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  associateOwnerFamilyInTransaction,
  familyMemberOverlapPredicate,
  familyMemberStartsAfterPredicate,
  familyMemberStartsOnOrBeforePredicate,
  resolveFamilyMemberAssociation,
} from "@/modules/families/application/owner-family-association";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const familyId = "10000000-0000-4000-8000-000000000003";
const payerId = "10000000-0000-4000-8000-000000000004";
const guardianId = "10000000-0000-4000-8000-000000000005";
const athleteId = "10000000-0000-4000-8000-000000000008";
const idempotencyKey = "family-association-replay-001";
const actor = {
  userId: "10000000-0000-4000-8000-000000000006",
  memberId: "10000000-0000-4000-8000-000000000007",
};
const dialect = new PgDialect();
const commandFingerprint = createHash("sha256")
  .update(JSON.stringify({
    organizationId,
    locationId,
    familyId: null,
    athleteIds: [athleteId],
    effectiveFrom: "2026-10-01",
    familyPayerId: null,
    givenName: "Ana",
    familyName: "López",
    relationship: "parent",
  }))
  .digest("hex");
const existingFamilyCommandFingerprint = createHash("sha256")
  .update(JSON.stringify({
    organizationId,
    locationId,
    familyId,
    athleteIds: [athleteId],
    effectiveFrom: "2026-10-01",
    familyPayerId: payerId,
    givenName: null,
    familyName: null,
    relationship: null,
  }))
  .digest("hex");
const priorEvent = {
  payload: {
    resolvedFamilyId: familyId,
    familyPayerId: payerId,
    commandFingerprint,
  },
};
let member: {
  id: string;
  userId: string;
  organizationId: string;
  status: string;
  role: string;
  locationScopeMode: string;
};
let scopeAllowed: boolean;

function makeTransaction() {
  member = {
    id: actor.memberId,
    userId: actor.userId,
    organizationId,
    status: "active",
    role: "owner",
    locationScopeMode: "all",
  };
  scopeAllowed = true;
  const family = { id: familyId, organizationId };
  const payer = { guardianId };
  const rows = new Map<unknown, unknown[]>([
    [families, [family]],
    [familyPayers, [payer]],
    [auditLog, [{ actorUserId: actor.userId, locationId, targetId: familyId }]],
    [memberLocationScopes, [{ id: "synthetic-location-scope", locationId }]],
    [outboxEvents, [{ id: "synthetic-association-event", locationId }]],
  ]);
  const select = vi.fn(() => {
    let table: unknown;
    let params: unknown[] = [];
    let whereSql = "";
    const matchesBound = (column: string, value: unknown) => {
      const predicate = new RegExp(`${column}\\s*=\\s*\\$(\\d+)`).exec(whereSql);
      return predicate !== null && params[Number(predicate[1]) - 1] === value;
    };
    const query = {
      from: (value: unknown) => { table = value; return query; },
      innerJoin: () => query,
      where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const compiled = dialect.sqlToQuery(clause);
        params = compiled.params;
        whereSql = compiled.sql.toLowerCase().replaceAll('"', "");
        return query;
      },
      limit: async () => {
        if (table === organizationMembers) {
          const matches = params.length === 4
            && matchesBound("organization_members.id", member.id)
            && matchesBound("organization_members.user_id", member.userId)
            && matchesBound("organization_members.organization_id", organizationId)
            && matchesBound("organization_members.status", "active")
            && member.organizationId === organizationId
            && member.status === "active";
          return matches ? [member] : [];
        }
        if (table === memberLocationScopes) {
          const rowsForMember = rows.get(table) ?? [];
          const matchesMember = params.includes(organizationId) &&
            (params.includes(actor.memberId) || params.includes(member.id));
          if (!matchesMember) return [];
          if (whereSql.includes("member_location_scopes.location_id =")) {
            const matchesLocation = scopeAllowed &&
              matchesBound("member_location_scopes.location_id", locationId);
            return matchesLocation
              ? rowsForMember.filter((row) =>
                  (row as { locationId?: string }).locationId === locationId
                )
              : [];
          }
          return rowsForMember;
        }
        if (table === families) {
          const matches = params.length === 2
            && matchesBound("families.organization_id", organizationId)
            && matchesBound("families.id", familyId);
          return matches ? rows.get(table) ?? [] : [];
        }
        if (table === familyPayers) {
          const matches = params.length === 3
            && matchesBound("family_payers.organization_id", organizationId)
            && matchesBound("family_payers.family_id", familyId)
            && matchesBound("family_payers.id", payerId);
          return matches ? rows.get(table) ?? [] : [];
        }
        if (table === outboxEvents) {
          const eventRows = rows.get(table) ?? [];
          const allowedIds = params.filter(
            (value): value is string => typeof value === "string" && value !== organizationId
          );
          return eventRows.filter((row) => {
            const location = (row as { locationId?: string | null }).locationId;
            return location === null || location === undefined || !allowedIds.includes(location);
          }).slice(0, 1);
        }
        return rows.get(table) ?? [];
      },
    };
    return query;
  });
  const write = vi.fn(() => { throw new Error("El replay no debe escribir"); });
  const execute = vi.fn(() => { throw new Error("El replay no debe ejecutar SQL"); });
  const tx = { select, execute, insert: write, update: write, delete: write } as unknown as TransactionClient;
  return {
    tx,
    family,
    write,
    execute,
    setMemberRole: (role: string) => { member.role = role; },
    setMemberIdentity: (userId: string, memberId: string) => {
      member.userId = userId;
      member.id = memberId;
    },
    setAssociationLocations: (locations: Array<string | null>) => {
      rows.set(
        outboxEvents,
        locations.map((locationId, index) => ({
          id: `synthetic-association-event-${index}`,
          locationId,
        }))
      );
    },
    setAuthorizedLocations: (locations: string[]) => {
      rows.set(
        memberLocationScopes,
        locations.map((locationId, index) => ({
          id: `synthetic-location-scope-${index}`,
          locationId,
        }))
      );
    },
    setLocationScope: (mode: string, allowed: boolean) => {
      member.locationScopeMode = mode;
      scopeAllowed = allowed;
    },
  };
}

function replay(
  tx: TransactionClient,
  athleteIds = [athleteId],
  replayActor = actor
) {
  return associateOwnerFamilyInTransaction(tx, {
    organizationId,
    locationId,
    athleteIds,
    effectiveFrom: "2026-10-01",
    payer: { givenName: "Ana", familyName: "López", relationship: "parent" },
    idempotencyKey,
    actor: replayActor,
  });
}

function makeNoReplayTransaction(overlappingRows: Array<{
  organizationId: string;
  familyId: string;
  athleteId: string;
  startsOn: string;
  endsOn: string | null;
}>) {
  member = {
    id: actor.memberId,
    userId: actor.userId,
    organizationId,
    status: "active",
    role: "owner",
    locationScopeMode: "all",
  };
  scopeAllowed = true;
  const family = { id: familyId, organizationId, isActive: true };
  const payer = {
    id: payerId,
    guardianId,
    isPrimary: true,
    startsOn: "2026-01-01",
    endsOn: null,
  };
  const membershipReads: Array<{ whereSql: string; params: unknown[]; limit: number }> = [];
  const memberInserts: Array<Record<string, unknown>> = [];
  const selectBuilder = (distinct = false) => {
    let table: unknown;
    let whereSql = "";
    let params: unknown[] = [];
    const query = {
      from: (value: unknown) => { table = value; return query; },
      innerJoin: () => query,
      where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const compiled = dialect.sqlToQuery(clause);
        whereSql = compiled.sql.toLowerCase().replaceAll('"', "");
        params = compiled.params;
        return query;
      },
      limit: async (count = 1) => {
        if (table === organizationMembers) return [member];
        if (table === memberLocationScopes) return [{ id: "synthetic-location-scope" }];
        if (table === athletes && distinct) return [{ athleteId }];
        if (table === families) return [family];
        if (table === familyPayers) return [payer];
        if (table === familyMembers) {
          membershipReads.push({ whereSql, params, limit: count });
          const effectiveFrom = "2026-10-01";
          const checkingOtherFamilies = whereSql.includes("not in");
          const scoped = overlappingRows.filter(row =>
            params.includes(row.organizationId)
            && (checkingOtherFamilies
              ? row.familyId !== familyId
              : params.includes(row.familyId) && row.familyId === familyId)
            && params.includes(row.athleteId)
            && row.organizationId === organizationId
            && row.athleteId === athleteId
            && (row.endsOn === null || row.endsOn >= effectiveFrom)
          );
          if (checkingOtherFamilies) {
            return scoped.slice(0, count).map(({ startsOn, endsOn }) => ({ startsOn, endsOn }));
          }
          const candidates = whereSql.includes("starts_on >")
            ? scoped.filter(row => row.startsOn > effectiveFrom)
            : scoped.filter(row => row.startsOn <= effectiveFrom);
          return candidates.slice(0, count).map(({ startsOn, endsOn }) => ({ startsOn, endsOn }));
        }
        return [];
      },
    };
    return query;
  };
  const select = vi.fn(() => selectBuilder());
  const selectDistinct = vi.fn(() => selectBuilder(true));
  const insert = vi.fn((table: unknown) => ({
    values: (value: Record<string, unknown>) => {
      if (table === familyMembers) {
        memberInserts.push(value);
        return Promise.resolve([]);
      }
      return { returning: async () => [{ id: "synthetic-created-id" }] };
    },
  }));
  const update = vi.fn(() => ({
    set: () => ({ where: async () => [] }),
  }));
  const execute = vi.fn(async () => []);
  const tx = { select, selectDistinct, execute, insert, update } as unknown as TransactionClient;
  return {
    tx,
    membershipReads,
    memberInserts,
    insert,
    setMemberLocationScopeMode: (mode: string) => {
      member.locationScopeMode = mode;
    },
  };
}

function associateWithoutReplay(tx: TransactionClient) {
  mocks.findEvent.mockResolvedValue(null);
  return associateOwnerFamilyInTransaction(tx, {
    organizationId,
    locationId,
    familyId,
    athleteIds: [athleteId],
    effectiveFrom: "2026-10-01",
    payer: { familyPayerId: payerId },
    idempotencyKey: "family-no-replay-001",
    actor,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  priorEvent.payload.resolvedFamilyId = familyId;
  priorEvent.payload.familyPayerId = payerId;
  priorEvent.payload.commandFingerprint = commandFingerprint;
  priorEvent.payload.actorMemberId = actor.memberId;
  mocks.lock.mockResolvedValue(undefined);
  mocks.findEvent.mockImplementation(async (_tx, input) => {
    if (
      input.organizationId === organizationId
      && input.eventName === "family.owner_associated"
      && input.idempotencyKey === idempotencyKey
    ) {
      return priorEvent;
    }
    return null;
  });
});

describe("intervalos de pertenencia familiar", () => {
  it("incluye relaciones con fin nulo o posterior a la fecha efectiva en la lectura", () => {
    const effectiveFrom = "2026-10-23";
    const compiled = dialect.sqlToQuery(
      familyMemberOverlapPredicate(effectiveFrom)
    );

    expect(compiled.sql).toContain("is null");
    expect(compiled.sql).toContain(">=");
    expect(compiled.params).toContain(effectiveFrom);
  });

  it("acota los dos sondeos por inicio futuro y relación ya vigente", () => {
    const effectiveFrom = "2026-10-23";
    const future = dialect.sqlToQuery(familyMemberStartsAfterPredicate(effectiveFrom));
    const current = dialect.sqlToQuery(familyMemberStartsOnOrBeforePredicate(effectiveFrom));

    expect(future.sql).toContain(">");
    expect(future.params).toContain(effectiveFrom);
    expect(current.sql).toContain("<=");
    expect(current.params).toContain(effectiveFrom);
  });

  it("reutiliza una relación que cubre la fecha efectiva aunque tenga fin futuro", () => {
    expect(
      resolveFamilyMemberAssociation(
        [{ startsOn: "2026-01-01", endsOn: "2026-12-31" }],
        "2026-10-23"
      )
    ).toBe("already-associated");
  });

  it.each([null, "2026-12-31"] as const)(
    "rechaza una relación futura que se solapa (%s)",
    (endsOn) => {
      expect(
        resolveFamilyMemberAssociation(
          [{ startsOn: "2026-11-01", endsOn }],
          "2026-10-23"
        )
      ).toBe("date-conflict");
    }
  );

  it("permite una nueva relación cuando las anteriores terminaron antes", () => {
    expect(
      resolveFamilyMemberAssociation(
        [{ startsOn: "2026-01-01", endsOn: "2026-10-22" }],
        "2026-10-23"
      )
    ).toBe("create");
  });

  it("falla cerrado si una relación que cubre la fecha convive con otra futura", () => {
    expect(
      resolveFamilyMemberAssociation(
        [
          { startsOn: "2026-01-01", endsOn: null },
          { startsOn: "2026-11-01", endsOn: "2026-12-31" },
        ],
        "2026-10-23"
      )
    ).toBe("date-conflict");
  });

  it("prioriza un solapamiento futuro sobre una relación vigente y no inserta", async () => {
    const { tx, membershipReads, memberInserts } = makeNoReplayTransaction([
      { organizationId, familyId, athleteId, startsOn: "2026-01-01", endsOn: null },
      { organizationId, familyId, athleteId, startsOn: "2026-11-01", endsOn: "2026-12-31" },
    ]);

    await expect(associateWithoutReplay(tx)).rejects.toMatchObject({
      code: "FAMILY_MEMBERSHIP_DATE_CONFLICT",
      status: 409,
    });

    expect(membershipReads).toHaveLength(2);
    expect(membershipReads[0]?.whereSql).toContain("family_members.family_id not in");
    expect(membershipReads[1]?.whereSql).toContain("family_members.starts_on >");
    expect(membershipReads.every(({ limit }) => limit === 1)).toBe(true);
    expect(membershipReads.every(({ whereSql, params }) =>
      ["family_members.organization_id", "family_members.family_id", "family_members.athlete_id"]
        .every(column => whereSql.includes(column))
      && [organizationId, familyId, athleteId].every(value => params.includes(value))
    )).toBe(true);
    expect(memberInserts).toEqual([]);
  });

  it("reutiliza una relación vigente sin insertarla y limita ambos sondeos a una fila", async () => {
    const { tx, membershipReads, memberInserts } = makeNoReplayTransaction([
      { organizationId, familyId, athleteId, startsOn: "2026-01-01", endsOn: "2026-12-31" },
    ]);

    await associateWithoutReplay(tx);

    expect(membershipReads).toHaveLength(3);
    expect(membershipReads.map(read => read.limit)).toEqual([1, 1, 1]);
    expect(membershipReads.every(({ params }) =>
      [organizationId, familyId, athleteId].every(value => params.includes(value))
    )).toBe(true);
    expect(membershipReads.every(({ whereSql }) =>
      ["family_members.organization_id", "family_members.family_id", "family_members.athlete_id"]
        .every(column => whereSql.includes(column))
    )).toBe(true);
    expect(memberInserts).toEqual([]);
  });

  it("inserta cuando no hay solapamiento dentro de la organización, familia y gimnasta consultadas", async () => {
    const { tx, membershipReads, memberInserts } = makeNoReplayTransaction([
      { organizationId: "10000000-0000-4000-8000-000000000099", familyId, athleteId, startsOn: "2026-11-01", endsOn: null },
      { organizationId, familyId: "10000000-0000-4000-8000-000000000098", athleteId, startsOn: "2026-08-01", endsOn: "2026-09-30" },
      { organizationId, familyId, athleteId: "10000000-0000-4000-8000-000000000097", startsOn: "2026-11-01", endsOn: null },
      { organizationId, familyId, athleteId, startsOn: "2026-01-01", endsOn: "2026-09-30" },
    ]);

    await associateWithoutReplay(tx);

    expect(membershipReads).toHaveLength(3);
    expect(membershipReads.map(read => read.limit)).toEqual([1, 1, 1]);
    expect(membershipReads.every(({ params }) =>
      [organizationId, familyId, athleteId].every(value => params.includes(value))
    )).toBe(true);
    expect(membershipReads.every(({ whereSql }) =>
      ["family_members.organization_id", "family_members.family_id", "family_members.athlete_id"]
        .every(column => whereSql.includes(column))
    )).toBe(true);
    expect(memberInserts).toEqual([{
      organizationId,
      familyId,
      athleteId,
      relationship: "other",
      startsOn: "2026-10-01",
    }]);
  });
});

describe("replay de asociación familiar en solo lectura", () => {
  it("recupera la asociación con autorización de lectura y sin volver a escribir", async () => {
    const { tx, family, write, execute } = makeTransaction();

    await expect(replay(tx)).resolves.toEqual({
      family,
      familyPayerId: payerId,
      guardianId,
      replayed: true,
    });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(mocks.assertAccess).toHaveBeenCalledWith(tx, {
      organizationId,
      locationId,
      actor,
      allowedRoles: ["owner", "admin", "manager"],
    });
    expect(mocks.findEvent).toHaveBeenCalledWith(tx, {
      organizationId,
      eventName: "family.owner_associated",
      idempotencyKey,
    });
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("recupera un recibo antiguo usando el actorUserId auditado cuando no guardaba actorMemberId", async () => {
    const { tx, write, execute } = makeTransaction();
    delete priorEvent.payload.actorMemberId;

    await expect(replay(tx)).resolves.toMatchObject({
      family: { id: familyId },
      familyPayerId: payerId,
      guardianId,
      replayed: true,
    });

    expect(write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("sigue denegando el replay a roles sin acceso", async () => {
    const { tx, write, execute, setMemberRole } = makeTransaction();
    setMemberRole("coach");

    await expect(replay(tx)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("revalida todas las sedes antes de leer el replay de una familia existente", async () => {
    const { tx, write, execute, setLocationScope } = makeTransaction();
    priorEvent.payload.commandFingerprint = existingFamilyCommandFingerprint;
    setLocationScope("selected", true);

    await expect(
      associateOwnerFamilyInTransaction(tx, {
        organizationId,
        locationId,
        familyId,
        athleteIds: [athleteId],
        effectiveFrom: "2026-10-01",
        payer: { familyPayerId: payerId },
        idempotencyKey,
        actor,
      })
    ).rejects.toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
    });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("permite recuperar una creación perdida desde la misma sede a su autor con alcance parcial", async () => {
    const { tx, family, write, execute, setLocationScope } = makeTransaction();
    priorEvent.payload.commandFingerprint = commandFingerprint;
    setLocationScope("selected", true);

    await expect(replay(tx)).resolves.toEqual({
      family,
      familyPayerId: payerId,
      guardianId,
      replayed: true,
    });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("deniega el replay de una creación a otro usuario aunque tenga acceso a la sede", async () => {
    const { tx, write, execute, setLocationScope, setMemberIdentity } = makeTransaction();
    const otherActor = {
      userId: "10000000-0000-4000-8000-000000000099",
      memberId: "10000000-0000-4000-8000-000000000098",
    };
    setMemberIdentity(otherActor.userId, otherActor.memberId);
    setLocationScope("selected", true);

    await expect(replay(tx, [athleteId], otherActor)).rejects.toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
    });

    expect(write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("deniega replay parcial si el historial de asociación de la familia incluye otra sede", async () => {
    const { tx, write, execute, setLocationScope, setAssociationLocations } =
      makeTransaction();
    setLocationScope("selected", true);
    setAssociationLocations([locationId, "10000000-0000-4000-8000-000000000020"]);

    await expect(replay(tx)).rejects.toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
    });

    expect(write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("permite replay a alcance parcial cuando todas las sedes relacionadas están autorizadas", async () => {
    const {
      tx,
      family,
      write,
      execute,
      setLocationScope,
      setAssociationLocations,
      setAuthorizedLocations,
    } = makeTransaction();
    const otherLocationId = "10000000-0000-4000-8000-000000000020";
    setLocationScope("selected", true);
    setAssociationLocations([locationId, otherLocationId]);
    setAuthorizedLocations([locationId, otherLocationId]);

    await expect(replay(tx)).resolves.toEqual({
      family,
      familyPayerId: payerId,
      guardianId,
      replayed: true,
    });

    expect(write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("conserva el alcance seleccionado de sede para el replay", async () => {
    const { tx, setLocationScope, write, execute } = makeTransaction();
    setLocationScope("selected", false);

    await expect(replay(tx)).rejects.toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
    });

    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("rechaza reutilizar la misma clave con otra gimnasta", async () => {
    const { tx, write, execute } = makeTransaction();

    await expect(
      replay(tx, ["10000000-0000-4000-8000-000000000009"])
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    expect(mocks.assertAccess).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it.each(["resolvedFamilyId", "familyPayerId"] as const)("rechaza un resultado previo con %s que no sea UUID", async field => {
    const { tx, write, execute } = makeTransaction();
    priorEvent.payload[field] = "not-a-uuid";

    await expect(replay(tx)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });

    expect(mocks.assertAccess).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("deniega modificar una familia existente con alcance parcial antes de escribir", async () => {
    const { tx, memberInserts, insert, setMemberLocationScopeMode } =
      makeNoReplayTransaction([]);
    setMemberLocationScopeMode("selected");

    await expect(associateWithoutReplay(tx)).rejects.toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
    });

    expect(memberInserts).toEqual([]);
    expect(insert).not.toHaveBeenCalled();
  });
});
