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
  families,
  familyPayers,
  memberLocationScopes,
  organizationMembers,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  associateOwnerFamilyInTransaction,
  familyMemberOverlapPredicate,
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
      where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const compiled = dialect.sqlToQuery(clause);
        params = compiled.params;
        whereSql = compiled.sql.toLowerCase().replaceAll('"', "");
        return query;
      },
      limit: async () => {
        if (table === organizationMembers) {
          const matches = params.length === 4
            && matchesBound("organization_members.id", actor.memberId)
            && matchesBound("organization_members.user_id", actor.userId)
            && matchesBound("organization_members.organization_id", organizationId)
            && matchesBound("organization_members.status", "active")
            && member.id === actor.memberId
            && member.userId === actor.userId
            && member.organizationId === organizationId
            && member.status === "active";
          return matches ? [member] : [];
        }
        if (table === memberLocationScopes) {
          const matches = scopeAllowed
            && params.length === 3
            && matchesBound("member_location_scopes.organization_id", organizationId)
            && matchesBound("member_location_scopes.member_id", actor.memberId)
            && matchesBound("member_location_scopes.location_id", locationId);
          return matches ? [{ id: "synthetic-location-scope" }] : [];
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
    setLocationScope: (mode: string, allowed: boolean) => {
      member.locationScopeMode = mode;
      scopeAllowed = allowed;
    },
  };
}

function replay(tx: TransactionClient, athleteIds = [athleteId]) {
  return associateOwnerFamilyInTransaction(tx, {
    organizationId,
    locationId,
    athleteIds,
    effectiveFrom: "2026-10-01",
    payer: { givenName: "Ana", familyName: "López", relationship: "parent" },
    idempotencyKey,
    actor,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  priorEvent.payload.resolvedFamilyId = familyId;
  priorEvent.payload.familyPayerId = payerId;
  priorEvent.payload.commandFingerprint = commandFingerprint;
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
});
