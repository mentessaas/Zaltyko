import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  assertAccess: vi.fn(),
  assertWritable: vi.fn(),
  lock: vi.fn(),
  findEvent: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/modules/saas-billing/application/organization-usage", () => ({
  assertOrganizationOperationalWritable: mocks.assertWritable,
}));
vi.mock("@/modules/shared/infrastructure/operational-authorization", () => ({
  assertOperationalAccess: mocks.assertAccess,
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules/shared/infrastructure/transactional-records")>();
  return {
    ...actual,
    appendAuditEntry: mocks.appendAudit,
    appendOutboxEvent: mocks.appendOutbox,
    findOutboxEvent: mocks.findEvent,
    lockCommand: mocks.lock,
  };
});

import { attendanceRecords, auditLog, enrollments, sessions } from "@/db/zaltyko-schema";
import { recordOfflineAttendance } from "@/modules/attendance/application/attendance-service";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const sessionId = "10000000-0000-4000-8000-000000000003";
const enrollmentId = "10000000-0000-4000-8000-000000000004";
const attendanceId = "10000000-0000-4000-8000-000000000005";
const memberId = "10000000-0000-4000-8000-000000000006";
const userId = "10000000-0000-4000-8000-000000000007";
const athleteId = "10000000-0000-4000-8000-000000000008";
const opId = "10000000-0000-4000-8000-000000000009";
const classTemplateId = "10000000-0000-4000-8000-00000000000a";

const stored = new Date("2026-11-14T17:00:00.000Z");
const earlier = new Date("2026-11-14T16:00:00.000Z");
const later = new Date("2026-11-14T18:00:00.000Z");

let existing: Record<string, unknown> | null;
const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
const updated: Array<Record<string, unknown>> = [];
let conflictIgnored = 0;

function makeTx() {
  const rowsFor = (table: unknown): unknown[] => {
    if (table === sessions) {
      return [{ id: sessionId, organizationId, locationId, classTemplateId, status: "scheduled" }];
    }
    if (table === enrollments) {
      return [
        {
          id: enrollmentId,
          organizationId,
          locationId,
          classTemplateId,
          athleteId,
          status: "active",
          startsOn: "2026-09-01",
          endsOn: null,
        },
      ];
    }
    if (table === attendanceRecords) return existing ? [existing] : [];
    return [];
  };
  const select = () => {
    let table: unknown;
    const query = {
      from: (value: unknown) => {
        table = value;
        return query;
      },
      where: () => query,
      limit: async () => rowsFor(table),
    };
    return query;
  };
  return {
    select,
    execute: vi.fn(async () => ({ rows: [{ local_date: "2026-11-14" }] })),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserted.push({ table, values });
        return {
          returning: async () => [{ id: attendanceId, ...values }],
          onConflictDoNothing: async () => {
            conflictIgnored += 1;
          },
        };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updated.push(values);
        return {
          where: () => ({
            returning: async () => [{ ...existing, ...values }],
          }),
        };
      },
    }),
  };
}

function send(input: {
  status?: "present" | "absent" | "late" | "excused";
  markedAt?: Date;
  seenRecordedAt?: Date | null;
}) {
  return recordOfflineAttendance({
    organizationId,
    expectedLocationId: locationId,
    sessionId,
    enrollmentId,
    status: input.status ?? "present",
    idempotencyKey: `offline:${opId}`,
    actor: { userId, memberId },
    offline: {
      opId,
      markedAt: input.markedAt ?? later,
      seenRecordedAt: input.seenRecordedAt,
    },
  });
}

function storedMark(status: string, recordedAt: Date) {
  return { id: attendanceId, organizationId, locationId, sessionId, enrollmentId, athleteId, status, recordedAt };
}

const conflictAudits = () =>
  inserted.filter((item) => item.table === auditLog && item.values.action === "attendance.offline_conflict");

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  inserted.length = 0;
  updated.length = 0;
  conflictIgnored = 0;
  existing = null;
  mocks.findEvent.mockResolvedValue(null);
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(makeTx())
  );
});

describe("recordOfflineAttendance (cola sin conexión de /owner)", () => {
  it("una marca nueva se guarda con la hora real de la marca, no la del envío", async () => {
    const result = await send({ markedAt: earlier, seenRecordedAt: null });
    expect(result.outcome).toBe("applied");
    const insert = inserted.find((item) => item.table === attendanceRecords);
    expect(insert?.values.recordedAt).toEqual(earlier);
    expect(insert?.values.recordedByMemberId).toBe(memberId);
    expect(mocks.appendOutbox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: `offline:${opId}`, eventName: "attendance.recorded" })
    );
    expect(conflictAudits()).toHaveLength(0);
  });

  it("reenviar la misma operación es idempotente: «ya estaba» y no escribe nada", async () => {
    mocks.findEvent.mockResolvedValue({
      aggregateType: "attendance",
      aggregateId: attendanceId,
      payload: { attendanceId, sessionId, enrollmentId, status: "present" },
    });
    // Otra marca más reciente sustituyó a la primera: el reenvío no da 409.
    existing = storedMark("absent", later);
    const result = await send({ status: "present", markedAt: earlier });
    expect(result.outcome).toBe("duplicate");
    expect(result.attendance.status).toBe("absent");
    expect(inserted).toHaveLength(0);
    expect(updated).toHaveLength(0);
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("rechaza con 409 una clave usada antes para otra sesión o inscripción", async () => {
    existing = storedMark("present", stored);
    for (const payload of [
      { attendanceId, sessionId: "10000000-0000-4000-8000-0000000000aa", enrollmentId, status: "present" },
      { attendanceId, sessionId, enrollmentId: "10000000-0000-4000-8000-0000000000bb", status: "present" },
    ]) {
      mocks.findEvent.mockResolvedValue({ aggregateType: "attendance", aggregateId: attendanceId, payload });
      await expect(send({ status: "present", markedAt: later })).rejects.toMatchObject({
        code: "IDEMPOTENCY_CONFLICT",
        status: 409,
      });
    }
    expect(inserted).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });

  it("si el guardado es más reciente y distinto, gana el guardado y queda anotado el conflicto", async () => {
    existing = storedMark("absent", stored);
    const result = await send({ status: "present", markedAt: earlier, seenRecordedAt: null });
    expect(result.outcome).toBe("superseded");
    expect(result.attendance.status).toBe("absent");
    expect(updated).toHaveLength(0);
    const [audit] = conflictAudits();
    expect(audit.values).toMatchObject({
      organizationId,
      locationId,
      idempotencyKey: `offline-conflict:${opId}`,
      before: { status: "absent" },
      after: { status: "present" },
    });
    // La anotación no se duplica si el mismo reenvío vuelve a llegar.
    expect(conflictIgnored).toBe(1);
  });

  it("corregir lo que la entrenadora vio (mismo recordedAt) no es conflicto", async () => {
    existing = storedMark("absent", stored);
    const result = await send({ status: "present", markedAt: later, seenRecordedAt: stored });
    expect(result.outcome).toBe("applied");
    expect(updated[0]).toMatchObject({ status: "present", recordedAt: later, recordedByMemberId: memberId });
    expect(conflictAudits()).toHaveLength(0);
  });

  it("si alguien cambió la marca mientras tanto y la nueva es más reciente, gana la nueva y queda el conflicto", async () => {
    existing = storedMark("absent", stored);
    const result = await send({ status: "present", markedAt: later, seenRecordedAt: earlier });
    expect(result.outcome).toBe("applied");
    expect(updated[0]).toMatchObject({ status: "present", recordedAt: later });
    expect(conflictAudits()).toHaveLength(1);
  });

  it("la misma marca más antigua que el guardado se descarta como reenvío, sin conflicto", async () => {
    existing = storedMark("present", stored);
    const result = await send({ status: "present", markedAt: earlier, seenRecordedAt: null });
    expect(result.outcome).toBe("duplicate");
    expect(updated).toHaveLength(0);
    expect(conflictAudits()).toHaveLength(0);
  });

  it("no salta las comprobaciones de siempre: acceso, plan y sesión", async () => {
    await send({});
    expect(mocks.assertAccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId, locationId, allowedRoles: ["owner", "manager", "admin", "coach"] })
    );
    expect(mocks.assertWritable).toHaveBeenCalledWith(expect.anything(), organizationId);
  });
});
