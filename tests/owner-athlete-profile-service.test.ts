import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  assertAccess: vi.fn(),
  lockCommand: vi.fn(),
  findEvent: vi.fn(),
  assertPayload: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
  state: {
    profile: null as Record<string, unknown> | null,
    affectedLocationIds: [] as string[],
    hasGuardianIdentity: false,
    hasStaffIdentity: false,
    deniedLocationId: null as string | null,
    writes: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
    accesses: [] as Array<{ locationId: string; intent?: "write" }>,
  },
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/modules/shared/infrastructure/operational-authorization", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/shared/infrastructure/operational-authorization")
  >();
  return { ...actual, assertOperationalAccess: mocks.assertAccess };
});
vi.mock("@/modules/shared/infrastructure/transactional-records", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/shared/infrastructure/transactional-records")
  >();
  mocks.assertPayload.mockImplementation(actual.assertIdempotencyPayload);
  return {
    ...actual,
    appendAuditEntry: mocks.appendAudit,
    appendOutboxEvent: mocks.appendOutbox,
    assertIdempotencyPayload: mocks.assertPayload,
    findOutboxEvent: mocks.findEvent,
    lockCommand: mocks.lockCommand,
  };
});

import { athletes, people } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  getOwnerAthleteProfile,
  updateOwnerAthleteProfile,
} from "@/modules/athletes/application/owner-athlete-profile";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationA = "10000000-0000-4000-8000-000000000002";
const locationB = "10000000-0000-4000-8000-000000000003";
const athleteId = "10000000-0000-4000-8000-000000000004";
const personId = "10000000-0000-4000-8000-000000000005";
const commandKey = "athlete-profile-command-001";
const originalActor = {
  userId: "10000000-0000-4000-8000-000000000006",
  memberId: "10000000-0000-4000-8000-000000000007",
};
const dialect = new PgDialect();

function input(overrides: Record<string, unknown> = {}) {
  return {
    organizationId,
    locationId: locationA,
    athleteId,
    actor: originalActor,
    expectedGivenName: "Ana",
    expectedFamilyName: "López",
    givenName: "Ana María",
    familyName: "López Ruiz",
    idempotencyKey: commandKey,
    ...overrides,
  };
}

function fingerprint(command: ReturnType<typeof input>): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: command.organizationId,
        locationId: command.locationId,
        athleteId: command.athleteId,
        actor: command.actor,
        expectedGivenName: command.expectedGivenName,
        expectedFamilyName: command.expectedFamilyName,
        givenName: String(command.givenName).trim().normalize("NFC").replace(/\s+/gu, " "),
        familyName: String(command.familyName).trim().normalize("NFC").replace(/\s+/gu, " "),
      })
    )
    .digest("hex");
}

function makeTransaction() {
  const select = vi.fn(() => {
    let table: unknown;
    const query = {
      from: (value: unknown) => {
        table = value;
        return query;
      },
      innerJoin: () => query,
      where: () => query,
      limit: async () =>
        table === athletes && mocks.state.profile ? [mocks.state.profile] : [],
    };
    return query;
  });

  const execute = vi.fn(async (statement: unknown) => {
    const compiled = dialect.sqlToQuery(
      statement as Parameters<PgDialect["sqlToQuery"]>[0]
    );
    if (/\bfor update\b/i.test(compiled.sql)) {
      return { rows: [{ id: athleteId }] };
    }
    return {
      rows: [
        {
          location_ids: mocks.state.affectedLocationIds,
          has_guardian_identity: mocks.state.hasGuardianIdentity,
          has_staff_identity: mocks.state.hasStaffIdentity,
        },
      ],
    };
  });

  const update = vi.fn((table: unknown) => ({
    set: (values: Record<string, unknown>) => {
      mocks.state.writes.push({ table, values });
      return {
        where: () => ({
          returning: async () =>
            table === people ? [{ id: personId }] : [{ id: athleteId }],
        }),
      };
    },
  }));

  const tx = {
    select,
    execute,
    update,
  } as unknown as TransactionClient;
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  return { tx, update };
}

function priorEvent(command = input()) {
  return {
    aggregateId: athleteId,
    payload: {
      athleteId,
      personId,
      commandFingerprint: fingerprint(command),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.profile = {
    athleteId,
    personId,
    isActive: true,
    givenName: "Ana",
    familyName: "López",
  };
  mocks.state.affectedLocationIds = [locationA];
  mocks.state.hasGuardianIdentity = false;
  mocks.state.hasStaffIdentity = false;
  mocks.state.deniedLocationId = null;
  mocks.state.writes = [];
  mocks.state.accesses = [];
  mocks.lockCommand.mockResolvedValue(undefined);
  mocks.findEvent.mockResolvedValue(null);
  mocks.assertPayload.mockImplementation((actual, expected) => {
    for (const [key, value] of Object.entries(expected)) {
      if (actual[key] !== value) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave ya fue usada con otros parámetros",
          409
        );
      }
    }
  });
  mocks.assertAccess.mockImplementation(async (_tx, request) => {
    mocks.state.accesses.push({
      locationId: request.locationId,
      ...(request.intent ? { intent: request.intent } : {}),
    });
    if (request.locationId === mocks.state.deniedLocationId) {
      throw new OperationalError("LOCATION_SCOPE_DENIED", "Sede denegada", 403);
    }
    return { locationScopeMode: "selected" };
  });
  mocks.appendAudit.mockResolvedValue(undefined);
  mocks.appendOutbox.mockResolvedValue(undefined);
});

describe("actualización del perfil canónico de gimnasta", () => {
  it("lee los campos separados después de comprobar todas las sedes relacionadas", async () => {
    mocks.state.affectedLocationIds = [locationB, locationA];
    makeTransaction();

    await expect(
      getOwnerAthleteProfile({
        organizationId,
        locationId: locationA,
        athleteId,
        actor: originalActor,
      })
    ).resolves.toEqual({ athleteId, givenName: "Ana", familyName: "López" });

    expect(mocks.state.accesses).toEqual([
      { locationId: locationA },
      { locationId: locationB },
    ]);
    expect(mocks.state.writes).toHaveLength(0);
  });

  it("autoriza todas las sedes afectadas y mantiene PII fuera de auditoría/outbox", async () => {
    mocks.state.affectedLocationIds = [locationB, locationA];
    makeTransaction();

    await expect(updateOwnerAthleteProfile(input())).resolves.toMatchObject({
      athleteId,
      givenName: "Ana María",
      familyName: "López Ruiz",
      replayed: false,
    });

    expect(mocks.state.accesses).toEqual([
      { locationId: locationA },
      { locationId: locationB },
      { locationId: locationA, intent: "write" },
      { locationId: locationB, intent: "write" },
    ]);
    expect(mocks.state.writes).toHaveLength(2);
    expect(mocks.appendOutbox).toHaveBeenCalledOnce();
    expect(mocks.appendAudit).toHaveBeenCalledOnce();
    const recorded = JSON.stringify([
      mocks.appendOutbox.mock.calls,
      mocks.appendAudit.mock.calls,
    ]);
    expect(recorded).not.toContain("Ana María");
    expect(recorded).not.toContain("López Ruiz");
  });

  it("aborta antes de mutar cuando una sede relacionada no está autorizada", async () => {
    mocks.state.affectedLocationIds = [locationA, locationB];
    mocks.state.deniedLocationId = locationB;
    const { update } = makeTransaction();

    await expect(updateOwnerAthleteProfile(input())).rejects.toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
    });

    expect(mocks.state.accesses).toEqual([
      { locationId: locationA },
      { locationId: locationB },
    ]);
    expect(update).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
  });

  it("bloquea cambios a una identidad de guardian/staff desde un ámbito limitado", async () => {
    mocks.state.hasGuardianIdentity = true;
    mocks.state.affectedLocationIds = [locationA, locationB];
    makeTransaction();

    await expect(updateOwnerAthleteProfile(input())).rejects.toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
    });

    expect(mocks.state.writes).toHaveLength(0);
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("no acepta una escritura basada en nombres esperados obsoletos", async () => {
    mocks.state.profile = {
      athleteId,
      personId,
      isActive: true,
      givenName: "Ana Paula",
      familyName: "López",
    };
    const { update } = makeTransaction();

    await expect(updateOwnerAthleteProfile(input())).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
    });

    expect(update).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
  });

  it("reproduce un recibo autorizado en solo lectura devolviendo los nombres actuales", async () => {
    mocks.state.profile = {
      athleteId,
      personId,
      isActive: true,
      givenName: "Ana Lucía",
      familyName: "García López",
    };
    mocks.findEvent.mockResolvedValue(priorEvent());
    const { update } = makeTransaction();

    await expect(updateOwnerAthleteProfile(input())).resolves.toEqual({
      athleteId,
      givenName: "Ana Lucía",
      familyName: "García López",
      replayed: true,
    });

    expect(mocks.state.accesses).toEqual([{ locationId: locationA }]);
    expect(update).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
  });

  it.each([
    ["actor", { actor: { userId: "10000000-0000-4000-8000-000000000008", memberId: originalActor.memberId } }],
    ["sede", { locationId: locationB }],
    ["snapshot esperado", { expectedGivenName: "Ana María" }],
    ["nuevo nombre", { givenName: "Ana Paula" }],
  ])("rechaza replay si cambió %s", async (_label, change) => {
    const original = input();
    mocks.state.affectedLocationIds = [locationA, locationB];
    mocks.findEvent.mockResolvedValue(priorEvent(original));
    const { update } = makeTransaction();

    await expect(
      updateOwnerAthleteProfile(input(change as Record<string, unknown>))
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });

    expect(update).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
  });
});
