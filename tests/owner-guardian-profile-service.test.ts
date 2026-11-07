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
    personId: "10000000-0000-4000-8000-000000000005",
    updated: null as Record<string, unknown> | null,
    queries: [] as string[],
    accessIntents: [] as Array<string | undefined>,
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

import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  getOwnerGuardianProfile,
  normalizeOwnerGuardianProfileName,
  updateOwnerGuardianProfile,
} from "@/modules/families/application/owner-guardian-profile";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const guardianId = "10000000-0000-4000-8000-000000000003";
const userId = "10000000-0000-4000-8000-000000000004";
const memberId = "10000000-0000-4000-8000-000000000006";
const idempotencyKey = "owner-guardian-profile-001";
const originalUpdatedAt = "2026-10-25T09:30:00.123456Z";
const dialect = new PgDialect();
type Actor = { userId: string; memberId: string };
type TestScope = { organizationId: string; locationId: string; guardianId: string; actor: Actor };
type TestCommand = TestScope & {
  expectedGivenName: string;
  expectedFamilyName: string;
  expectedUpdatedAt: string;
  givenName: string;
  familyName: string;
  idempotencyKey: string;
};

function scope(overrides: Partial<TestScope> = {}): TestScope {
  return {
    organizationId,
    locationId,
    guardianId,
    actor: { userId, memberId },
    ...overrides,
  };
}

function command(overrides: Partial<TestCommand> = {}): TestCommand {
  return {
    ...scope(),
    expectedGivenName: "Ana",
    expectedFamilyName: "López",
    expectedUpdatedAt: originalUpdatedAt,
    givenName: "Ana María",
    familyName: "López Ruiz",
    idempotencyKey,
    ...overrides,
  };
}

function fingerprint(input: TestCommand): string {
  return createHash("sha256").update(JSON.stringify({
    organizationId: input.organizationId,
    locationId: input.locationId,
    guardianId: input.guardianId,
    actorUserId: input.actor.userId,
    actorMemberId: input.actor.memberId,
    expectedGivenName: input.expectedGivenName,
    expectedFamilyName: input.expectedFamilyName,
    expectedUpdatedAt: input.expectedUpdatedAt,
    givenName: String(input.givenName).trim().normalize("NFC").replace(/\s+/gu, " "),
    familyName: String(input.familyName).trim().normalize("NFC").replace(/\s+/gu, " "),
  })).digest("hex");
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    guardian_id: guardianId,
    person_id: mocks.state.personId,
    given_name: "Ana",
    family_name: "López",
    updated_at: originalUpdatedAt,
    ...overrides,
  };
}

function makeTransaction() {
  const execute = vi.fn(async (statement: unknown) => {
    const compiled = dialect.sqlToQuery(
      statement as Parameters<PgDialect["sqlToQuery"]>[0]
    );
    const normalizedSql = compiled.sql.toLowerCase();
    mocks.state.queries.push(normalizedSql);
    if (normalizedSql.includes("for update of guardian")) {
      return { rows: [{ person_id: mocks.state.personId }] };
    }
    if (normalizedSql.includes("for update of person")) return { rows: [{ id: mocks.state.personId }] };
    if (normalizedSql.trimStart().startsWith("update zaltyko.people")) {
      return { rows: [mocks.state.updated ?? {
        id: mocks.state.personId,
        given_name: "Ana María",
        family_name: "López Ruiz",
        updated_at: "2026-10-25T09:35:00.654321Z",
      }] };
    }
    return { rows: mocks.state.profile ? [mocks.state.profile] : [] };
  });
  const tx = { execute } as unknown as TransactionClient;
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  return { tx, execute };
}

function priorEvent(input: TestCommand = command()) {
  return {
    aggregateId: guardianId,
    payload: {
      actorUserId: input.actor.userId,
      actorMemberId: input.actor.memberId,
      commandFingerprint: fingerprint(input),
    },
  };
}

beforeEach(() => {
  // Clear queued one-shot results as well as call history. A denied replay can
  // intentionally skip findOutboxEvent, and its queued event must not leak
  // into a later stale-version scenario.
  vi.resetAllMocks();
  mocks.state.profile = profile();
  mocks.state.updated = null;
  mocks.state.queries = [];
  mocks.state.accessIntents = [];
  mocks.assertAccess.mockImplementation(async (_tx, request) => {
    mocks.state.accessIntents.push(request.intent);
    return { locationScopeMode: "all" };
  });
  mocks.lockCommand.mockImplementation(async () => {
    mocks.state.queries.push("lock command");
  });
  mocks.findEvent.mockResolvedValue(null);
  mocks.assertPayload.mockImplementation((actual, expected) => {
    for (const [key, value] of Object.entries(expected)) {
      if (actual[key] !== value) {
        throw new OperationalError("IDEMPOTENCY_CONFLICT", "Clave usada con otro comando", 409);
      }
    }
  });
  mocks.appendAudit.mockResolvedValue(undefined);
  mocks.appendOutbox.mockResolvedValue(undefined);
});

describe("perfil canónico de tutor", () => {
  it("normaliza nombres nuevos a NFC y compacta espacios, conservando snapshots legados exactos", () => {
    expect(normalizeOwnerGuardianProfileName("  Ana   Mari\u0301a  ")).toBe("Ana María");
  });

  it("acepta snapshots de nombres legados exactamente como se almacenaron", async () => {
    mocks.state.profile = profile({ given_name: " Ana ", family_name: "López " });
    makeTransaction();

    await expect(updateOwnerGuardianProfile(command({
      expectedGivenName: " Ana ",
      expectedFamilyName: "López ",
    }))).resolves.toMatchObject({ replayed: false });
    expect(mocks.appendOutbox).toHaveBeenCalledOnce();
  });

  it("lee nombres separados y conserva la versión PostgreSQL a seis microsegundos", async () => {
    makeTransaction();

    await expect(getOwnerGuardianProfile(scope())).resolves.toEqual({
      guardianId,
      givenName: "Ana",
      familyName: "López",
      updatedAt: originalUpdatedAt,
    });
    expect(mocks.assertAccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      organizationId,
      locationId,
      allowedRoles: ["owner", "admin", "manager"],
    }));
    expect(mocks.state.queries.join(" ")).toContain("family_guardian.organization_id = guardian.organization_id");
  });

  it("deniega perfil compartido a una sede parcial antes de leerlo", async () => {
    mocks.assertAccess.mockResolvedValueOnce({ locationScopeMode: "selected" });
    makeTransaction();

    await expect(getOwnerGuardianProfile(scope())).rejects.toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
    });
    expect(mocks.state.queries).toEqual([]);
  });

  it("oculta una ficha sin vínculo familiar y sede activa", async () => {
    mocks.state.profile = null;
    makeTransaction();

    await expect(getOwnerGuardianProfile(scope())).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("aplica el orden organización/comando → tutor → persona y no persiste nombres en el evento", async () => {
    makeTransaction();

    await expect(updateOwnerGuardianProfile(command())).resolves.toMatchObject({
      guardianId,
      givenName: "Ana María",
      familyName: "López Ruiz",
      updatedAt: "2026-10-25T09:35:00.654321Z",
      replayed: false,
    });
    expect(mocks.state.queries.slice(0, 4)).toEqual([
      "lock command",
      expect.stringContaining("for update of guardian"),
      expect.stringContaining("for update of person"),
      expect.stringMatching(/select\s+guardian\.id as guardian_id/u),
    ]);
    const outboxInput = mocks.appendOutbox.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(outboxInput).toMatchObject({ aggregateType: "guardian", aggregateId: guardianId });
    expect(outboxInput.payload).toEqual(expect.objectContaining({ changedFields: ["givenName", "familyName"] }));
    expect(JSON.stringify(outboxInput.payload)).not.toContain("Ana");
    expect(JSON.stringify(mocks.appendAudit.mock.calls[0]?.[1])).not.toContain("López");
  });

  it("recupera el recibo actual tras pasar a solo lectura, sin otra escritura", async () => {
    mocks.state.profile = profile({
      given_name: "Ana María",
      family_name: "López Ruiz",
      updated_at: "2026-10-25T09:35:00.654321Z",
    });
    mocks.findEvent.mockResolvedValueOnce(priorEvent());
    mocks.assertAccess.mockImplementation(async (_tx, request) => {
      mocks.state.accessIntents.push(request.intent);
      if (request.intent === "write") throw new OperationalError("PLAN_OVER_CAPACITY", "Solo lectura", 409);
      return { locationScopeMode: "all" };
    });
    makeTransaction();

    await expect(updateOwnerGuardianProfile(command())).resolves.toEqual({
      guardianId,
      givenName: "Ana María",
      familyName: "López Ruiz",
      updatedAt: "2026-10-25T09:35:00.654321Z",
      replayed: true,
    });
    expect(mocks.state.accessIntents).toEqual([undefined]);
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.state.queries.some((query) => query.startsWith("update zaltyko.people"))).toBe(false);
  });

  it("autoriza el ámbito actual antes de replay y rechaza otro actor o cuerpo con la misma clave", async () => {
    mocks.state.profile = profile({
      given_name: "Ana María",
      family_name: "López Ruiz",
      updated_at: "2026-10-25T09:35:00.654321Z",
    });
    mocks.findEvent.mockResolvedValueOnce(priorEvent());
    mocks.assertAccess.mockResolvedValueOnce({ locationScopeMode: "selected" });
    makeTransaction();

    await expect(updateOwnerGuardianProfile(command())).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    expect(mocks.findEvent).not.toHaveBeenCalled();

    mocks.findEvent.mockResolvedValueOnce(priorEvent());
    await expect(updateOwnerGuardianProfile(command({
      actor: { userId: "10000000-0000-4000-8000-000000000008", memberId: "10000000-0000-4000-8000-000000000009" },
    }))).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(mocks.appendOutbox).not.toHaveBeenCalled();

    mocks.findEvent.mockResolvedValueOnce(priorEvent());
    await expect(updateOwnerGuardianProfile(command({ familyName: "Otra Persona" }))).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });
    expect(mocks.appendAudit).not.toHaveBeenCalled();
  });

  it("rechaza una versión obsoleta antes de cualquier escritura", async () => {
    mocks.state.profile = profile({ updated_at: "2026-10-25T09:30:00.123457Z" });
    makeTransaction();

    await expect(updateOwnerGuardianProfile(command())).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
    });
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.state.queries.some((query) => query.startsWith("update zaltyko.people"))).toBe(false);
  });
});
