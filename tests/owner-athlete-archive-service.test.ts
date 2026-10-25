import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  assertAccess: vi.fn(),
  lockCommand: vi.fn(),
  findEvent: vi.fn(),
  assertPayload: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
  state: {
    active: true,
    locationActive: true,
    locationScopeMode: "all",
    memberRole: "owner",
    auditExists: false,
    queries: [] as string[],
  },
}));

vi.mock("@/db", () => ({ db: { transaction: vi.fn() } }));
vi.mock("@/modules/shared/infrastructure/operational-authorization", () => ({
  assertOperationalAccess: mocks.assertAccess,
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({
  appendAuditEntry: mocks.appendAudit,
  appendOutboxEvent: mocks.appendOutbox,
  assertIdempotencyPayload: mocks.assertPayload,
  findOutboxEvent: mocks.findEvent,
  lockCommand: mocks.lockCommand,
}));

import { auditLog, locations } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { archiveOwnerAthleteInTransaction } from "@/modules/athletes/application/owner-athlete-archive";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const athleteId = "10000000-0000-4000-8000-000000000003";
const personId = "10000000-0000-4000-8000-000000000004";
const actor = {
  userId: "10000000-0000-4000-8000-000000000005",
  memberId: "10000000-0000-4000-8000-000000000006",
};
const idempotencyKey = "owner-athlete-archive-001";
const dialect = new PgDialect();

function command(overrides: Record<string, unknown> = {}) {
  return {
    userId: actor.userId,
    organizationId,
    locationId,
    athleteId,
    idempotencyKey,
    actor,
    ...overrides,
  };
}

function fingerprint(value = command()) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: value.organizationId,
        locationId: value.locationId,
        athleteId: value.athleteId,
        personId,
        actor: value.actor,
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
      where: () => query,
      limit: async () => {
        if (table === locations) {
          return mocks.state.locationActive ? [{ id: locationId }] : [];
        }
        if (table === auditLog) {
          return mocks.state.auditExists ? [{ id: "audit-row" }] : [];
        }
        return [];
      },
    };
    return query;
  });
  const execute = vi.fn(async (statement: unknown) => {
    const compiled = dialect.sqlToQuery(
      statement as Parameters<PgDialect["sqlToQuery"]>[0]
    );
    mocks.state.queries.push(compiled.sql);
    if (/select athlete\.id as athlete_id/i.test(compiled.sql)) {
      return {
        rows: [
          {
            athlete_id: athleteId,
            person_id: personId,
            is_active: mocks.state.active,
          },
        ],
      };
    }
    if (/update zaltyko\.athletes/i.test(compiled.sql)) {
      return { rows: [{ id: athleteId }] };
    }
    return { rows: [] };
  });
  const tx = { select, execute } as unknown as TransactionClient;
  return { tx, execute };
}

function receipt(value = command()) {
  return {
    aggregateId: athleteId,
    aggregateType: "athletes",
    payload: {
      resource: "athletes",
      resourceId: athleteId,
      athleteId,
      commandFingerprint: fingerprint(value),
      isActive: false,
      changed: true,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.active = true;
  mocks.state.locationActive = true;
  mocks.state.locationScopeMode = "all";
  mocks.state.memberRole = "owner";
  mocks.state.auditExists = false;
  mocks.state.queries = [];
  mocks.assertAccess.mockImplementation(async () => {
    return {
      id: actor.memberId,
      role: mocks.state.memberRole,
      locationScopeMode: mocks.state.locationScopeMode,
    };
  });
  mocks.lockCommand.mockResolvedValue(undefined);
  mocks.findEvent.mockResolvedValue(null);
  mocks.assertPayload.mockImplementation((actual, expected) => {
    for (const [key, value] of Object.entries(expected)) {
      if (actual[key] !== value) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave ya se utilizó con otros parámetros",
          409
        );
      }
    }
  });
  mocks.appendAudit.mockResolvedValue(undefined);
  mocks.appendOutbox.mockResolvedValue(undefined);
});

describe("archivo ordinario de ficha Owner", () => {
  it("serializa, cierra relaciones con historial y archiva sin borrar datos", async () => {
    const { tx } = makeTransaction();

    await expect(archiveOwnerAthleteInTransaction(tx, command())).resolves.toEqual({
      athleteId,
      isActive: false,
      replayed: false,
    });

    expect(mocks.lockCommand).toHaveBeenCalledWith(tx, organizationId, idempotencyKey);
    expect(mocks.assertAccess).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId,
        locationId,
        actor,
        allowedRoles: ["owner", "admin"],
      })
    );
    expect(mocks.assertAccess.mock.calls[0][1]).not.toHaveProperty("intent");
    expect(mocks.state.queries.map((query) => query.toLowerCase())).toEqual(
      expect.arrayContaining([
        expect.stringContaining("for update of athlete, person"),
        expect.stringContaining("insert into zaltyko.group_membership_history"),
        expect.stringContaining("insert into zaltyko.enrollment_status_history"),
        expect.stringContaining("update zaltyko.athletes"),
      ])
    );
    const loweredQueries = mocks.state.queries.map((query) => query.toLowerCase());
    const groupArchive = loweredQueries.find((query) =>
      query.includes("insert into zaltyko.group_membership_history")
    );
    const enrollmentArchive = loweredQueries.find((query) =>
      query.includes("insert into zaltyko.enrollment_status_history")
    );
    expect(groupArchive).toContain("least(");
    expect(groupArchive).toContain("coalesce(");
    expect(enrollmentArchive).toContain("least(");
    expect(enrollmentArchive).toContain("coalesce(");
    expect(mocks.appendOutbox).toHaveBeenCalledOnce();
    expect(mocks.appendAudit).toHaveBeenCalledOnce();
    const recorded = JSON.stringify([
      mocks.appendOutbox.mock.calls,
      mocks.appendAudit.mock.calls,
    ]);
    expect(recorded).not.toContain("givenName");
    expect(recorded).not.toContain("familyName");
    expect(recorded).not.toContain("email");
    expect(recorded).not.toContain("phone");
  });

  it("reproduce el recibo solo con mismo actor, ficha e identidad actual", async () => {
    mocks.state.active = false;
    mocks.findEvent.mockResolvedValue(receipt());
    const { tx, execute } = makeTransaction();

    await expect(archiveOwnerAthleteInTransaction(tx, command())).resolves.toEqual({
      athleteId,
      isActive: false,
      replayed: true,
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("rechaza el replay si cambia el miembro que lo solicita", async () => {
    mocks.state.active = false;
    mocks.findEvent.mockResolvedValue(receipt());
    const { tx } = makeTransaction();
    const otherActor = {
      userId: "10000000-0000-4000-8000-000000000007",
      memberId: "10000000-0000-4000-8000-000000000008",
    };

    await expect(
      archiveOwnerAthleteInTransaction(
        tx,
        command({ userId: otherActor.userId, actor: otherActor })
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("emite un recibo no mutante si una nueva clave apunta a una ficha ya archivada", async () => {
    mocks.state.active = false;
    const { tx, execute } = makeTransaction();

    await expect(archiveOwnerAthleteInTransaction(tx, command())).resolves.toEqual({
      athleteId,
      isActive: false,
      replayed: false,
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.appendOutbox).toHaveBeenCalledOnce();
    expect(mocks.appendOutbox.mock.calls[0][1].payload).toMatchObject({
      changed: false,
      isActive: false,
    });
  });

  it("impide archivar desde un miembro con alcance parcial", async () => {
    mocks.state.locationScopeMode = "selected";
    const { tx, execute } = makeTransaction();

    await expect(archiveOwnerAthleteInTransaction(tx, command())).rejects.toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
    });

    expect(execute).not.toHaveBeenCalled();
    expect(mocks.findEvent).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("rechaza roles distintos de Owner y Admin", async () => {
    const { tx, execute } = makeTransaction();
    mocks.assertAccess.mockRejectedValue(
      new OperationalError("FORBIDDEN", "Rol no autorizado", 403)
    );

    await expect(archiveOwnerAthleteInTransaction(tx, command())).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });

    expect(execute).not.toHaveBeenCalled();
    expect(mocks.findEvent).not.toHaveBeenCalled();
  });

  it("no permite convertir la cuenta de otra persona en el actor autenticado", async () => {
    const { tx } = makeTransaction();

    await expect(
      archiveOwnerAthleteInTransaction(
        tx,
        command({ userId: "10000000-0000-4000-8000-000000000099" })
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(mocks.lockCommand).not.toHaveBeenCalled();
    expect(mocks.assertAccess).not.toHaveBeenCalled();
  });

  it("rechaza las colisiones de clave de auditoría antes de escribir", async () => {
    mocks.state.auditExists = true;
    const { tx, execute } = makeTransaction();

    await expect(archiveOwnerAthleteInTransaction(tx, command())).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });
});
