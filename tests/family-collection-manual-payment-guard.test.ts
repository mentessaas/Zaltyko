import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático (Fase 3): el pago manual y el reparto manual frente a un
 * cobro automático. La comprobación vive en el reparto común
 * (applyPaymentAllocation), así cubre recordManualPaymentForCharge y
 * allocatePayment. Base simulada.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  findEvent: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
  access: vi.fn(),
  storage: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/modules/shared/infrastructure/operational-authorization", () => ({
  assertOperationalAccess: mocks.access,
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/shared/infrastructure/transactional-records")>()),
  appendAuditEntry: mocks.appendAudit,
  appendOutboxEvent: mocks.appendOutbox,
  findOutboxEvent: mocks.findEvent,
  lockCommand: mocks.lock,
}));
vi.mock("@/modules/family-collection/application/storage", () => ({
  isFamilyCollectionStorageAvailable: mocks.storage,
}));
vi.mock("@/modules/family-collection/application/config", () => ({
  isFamilyAutomaticCollectionFlagEnabled: () => false,
  isFamilyAutomaticSepaCollectionFlagEnabled: () => false,
  resolveConnectEnvironment: () => "test",
  isProductionDatabase: () => false,
}));

import { charges, paymentAllocations, payments } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  allocatePayment,
  AUTOMATIC_COLLECTION_IN_PROGRESS_MESSAGE,
  AUTOMATIC_COLLECTION_IN_PROGRESS_STATUSES,
  recordManualPaymentForCharge,
} from "@/modules/billing/application/ledger-service";

const dialect = new PgDialect();

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const familyId = "10000000-0000-4000-8000-000000000003";
const invoiceId = "10000000-0000-4000-8000-000000000008";
const chargeId = "10000000-0000-4000-8000-000000000007";
const paymentId = "10000000-0000-4000-8000-000000000006";
const attemptId = "10000000-0000-4000-8000-000000000020";
const actor = {
  userId: "10000000-0000-4000-8000-000000000004",
  memberId: "10000000-0000-4000-8000-000000000005",
};

type Row = Record<string, unknown>;

const chargeRow: Row = {
  id: chargeId,
  organizationId,
  locationId,
  invoiceId,
  familyId,
  familyPayerId: null,
  status: "due",
  currency: "EUR",
  amountCents: 4500,
};

const paymentRow: Row = {
  id: paymentId,
  organizationId,
  locationId,
  familyId,
  status: "succeeded",
  source: "manual",
  currency: "EUR",
  amountCents: 4500,
};

/**
 * Transacción simulada. `inProgress`: lo que devuelve la consulta del intento
 * en curso; `lastAttempt`: el último intento de la factura.
 */
function fakeTx(options: { inProgress?: Row | null; lastAttempt?: Row | null } = {}) {
  const inserts: Array<{ table: unknown; values: Row }> = [];
  const executed: string[] = [];
  const rows = new Map<unknown, Row[]>([
    [charges, [chargeRow]],
    [payments, [paymentRow]],
    [paymentAllocations, []],
  ]);
  const select = vi.fn(() => {
    let table: unknown;
    const query = {
      from: (value: unknown) => {
        table = value;
        return query;
      },
      where: () => query,
      limit: async () => rows.get(table) ?? [],
    };
    return query;
  });
  const insert = vi.fn((table: unknown) => ({
    values: (values: Row) => {
      inserts.push({ table, values });
      return { returning: async () => [{ id: table === payments ? paymentId : "allocation-1", ...values }] };
    },
  }));
  const update = vi.fn(() => ({ set: () => ({ where: async () => undefined }) }));
  const execute = vi.fn(async (statement: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    const text = dialect.sqlToQuery(statement).sql.replace(/\s+/g, " ").trim();
    executed.push(text);
    if (text.includes("a.status in")) return { rows: options.inProgress ? [options.inProgress] : [] };
    if (text.includes("from zaltyko.family_collection_attempts where") && text.includes("order by attempt_number desc")) {
      return { rows: options.lastAttempt ? [options.lastAttempt] : [] };
    }
    if (text.includes("payment_allocated")) return { rows: [{ payment_allocated: 0, charge_allocated: 0 }] };
    if (text.includes("bool_and")) return { rows: [{ all_paid: true, any_paid: true }] };
    return { rows: [] };
  });
  const tx = { select, insert, update, execute } as unknown as TransactionClient;
  return { tx, inserts, executed };
}

function useTx(harness: ReturnType<typeof fakeTx>) {
  mocks.transaction.mockImplementation(async (callback: (tx: TransactionClient) => unknown) => callback(harness.tx));
  return harness;
}

const manualCommand = {
  organizationId,
  chargeId,
  amountCents: 4500,
  method: "cash" as const,
  receivedAt: "2026-11-17T09:00:00.000Z",
  idempotencyKey: "manual-payment-key-1",
  actor,
};

const allocationCommand = {
  organizationId,
  paymentId,
  chargeId,
  amountCents: 4500,
  allocatedAt: "2026-11-17T09:00:00.000Z",
  idempotencyKey: "manual-allocation-key-1",
  actor,
};

const allocationInserted = (harness: ReturnType<typeof fakeTx>) =>
  harness.inserts.some((insert) => insert.table === paymentAllocations);

beforeEach(() => {
  // Reloj fijo: el registro rechaza un pago «en el futuro» (receivedAt >
  // ahora + 60 s). Sin esto, el test falla si la CI corre antes de las 09:00
  // UTC del 17-11-2026. Solo se finge Date; las promesas siguen siendo reales.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T12:00:00.000Z"));
  vi.clearAllMocks();
  mocks.findEvent.mockResolvedValue(null);
  mocks.storage.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pago manual con un cobro automático en curso", () => {
  it.each(["claimed", "created", "processing", "requires_action"])("con un intento %s responde 409 y no reparte nada", async (status) => {
    const harness = useTx(fakeTx({ inProgress: { attemptId, invoiceId, status } }));

    await expect(recordManualPaymentForCharge(manualCommand)).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_IN_PROGRESS",
      status: 409,
      message: "Esta cuota se está cobrando automáticamente. Espera al resultado.",
    });
    expect(AUTOMATIC_COLLECTION_IN_PROGRESS_MESSAGE).toBe(
      "Esta cuota se está cobrando automáticamente. Espera al resultado."
    );
    expect(allocationInserted(harness)).toBe(false);
    expect(harness.executed.some((text) => text.includes("update zaltyko.family_collection_attempts"))).toBe(false);
  });

  it("pago a mano con un intento requires_action (la familia tiene que confirmar el pago) → 409: la consulta pide los cuatro estados abiertos", async () => {
    const harness = useTx(fakeTx({ inProgress: { attemptId, invoiceId, status: "requires_action" } }));

    await expect(recordManualPaymentForCharge(manualCommand)).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_IN_PROGRESS",
      status: 409,
    });
    const execute = harness.tx.execute as unknown as { mock: { calls: Array<[Parameters<PgDialect["sqlToQuery"]>[0]]> } };
    const guard = execute.mock.calls
      .map(([statement]) => dialect.sqlToQuery(statement))
      .find((query) => query.sql.includes("a.status in"));
    expect(guard?.params).toEqual(expect.arrayContaining(["claimed", "created", "processing", "requires_action"]));
    expect(AUTOMATIC_COLLECTION_IN_PROGRESS_STATUSES).toEqual(["claimed", "created", "processing", "requires_action"]);
    expect(allocationInserted(harness)).toBe(false);
  });

  it("el reparto de un pago ya registrado (allocatePayment) pasa por la misma comprobación", async () => {
    const harness = useTx(fakeTx({ inProgress: { attemptId, invoiceId, status: "processing" } }));

    await expect(allocatePayment(allocationCommand)).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_IN_PROGRESS",
      status: 409,
    });
    expect(allocationInserted(harness)).toBe(false);
  });

  it("el bloqueo de la academia (lockCommand) va antes de mirar el cobro automático", async () => {
    const order: string[] = [];
    mocks.lock.mockImplementation(async () => {
      order.push("organization");
    });
    const harness = useTx(fakeTx({ inProgress: { attemptId, invoiceId, status: "claimed" } }));
    (harness.tx.execute as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      order.push("charge");
      return { rows: [] };
    });

    await expect(recordManualPaymentForCharge(manualCommand)).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_IN_PROGRESS",
    });
    expect(order).toEqual(["organization", "charge"]);
  });
});

describe("pago manual con un reintento automático pendiente", () => {
  const retrying = {
    attemptId,
    locationId,
    attemptNumber: 1,
    status: "failed",
    failureCode: "card_declined",
    declineCode: "insufficient_funds",
    retryPending: true,
  };

  it("cancela el reintento en la misma transacción, con aviso y auditoría de la persona", async () => {
    const harness = useTx(fakeTx({ lastAttempt: retrying }));

    await expect(recordManualPaymentForCharge(manualCommand)).resolves.toMatchObject({
      payment: { id: paymentId },
    });

    const invoiceLock = harness.executed.findIndex(
      (text) => text.includes("from zaltyko.invoices") && text.includes("for update")
    );
    const attemptLock = harness.executed.findIndex(
      (text) => text.includes("from zaltyko.family_collection_attempts where") && text.includes("for update")
    );
    const cancel = harness.executed.findIndex((text) =>
      text.includes("update zaltyko.family_collection_attempts set status = 'canceled'")
    );
    // Orden único: (academia y cuota ya bloqueadas) → factura → intento.
    expect(invoiceLock).toBeGreaterThanOrEqual(0);
    expect(attemptLock).toBeGreaterThan(invoiceLock);
    expect(cancel).toBeGreaterThan(attemptLock);
    expect(harness.executed[cancel]).toContain("next_retry_at = null");
    expect(allocationInserted(harness)).toBe(true);

    expect(mocks.appendOutbox).toHaveBeenCalledWith(
      harness.tx,
      expect.objectContaining({
        eventName: "family_collection.attempt_canceled",
        aggregateId: attemptId,
        idempotencyKey: `family-collection:${attemptId}:attempt_canceled`,
        payload: expect.objectContaining({ reason: "manual_payment", invoiceId, chargeId }),
      })
    );
    expect(mocks.appendAudit).toHaveBeenCalledWith(
      harness.tx,
      expect.objectContaining({
        action: "family_collection.attempt_canceled",
        actorUserId: actor.userId,
        before: expect.objectContaining({ status: "failed", retryPending: true, declineCode: "insufficient_funds" }),
        after: expect.objectContaining({ status: "canceled", reason: "manual_payment" }),
      })
    );
  });

  it("si el aviso de cancelación ya existe, no lo duplica (mira el outbox antes de escribir)", async () => {
    mocks.findEvent.mockImplementation(async (_tx: unknown, input: { eventName: string; idempotencyKey: string }) =>
      input.eventName === "family_collection.attempt_canceled" &&
      input.idempotencyKey === `family-collection:${attemptId}:attempt_canceled`
        ? { payload: {} }
        : null
    );
    const harness = useTx(fakeTx({ lastAttempt: retrying }));

    await expect(recordManualPaymentForCharge(manualCommand)).resolves.toBeDefined();

    expect(harness.executed.some((text) => text.includes("update zaltyko.family_collection_attempts"))).toBe(true);
    expect(mocks.appendOutbox).not.toHaveBeenCalledWith(
      harness.tx,
      expect.objectContaining({ eventName: "family_collection.attempt_canceled" })
    );
    expect(mocks.appendAudit).toHaveBeenCalledWith(
      harness.tx,
      expect.objectContaining({ action: "family_collection.attempt_canceled" })
    );
  });

  it.each([
    ["un fallo final", { ...retrying, retryPending: false }],
    ["un intento cancelado", { ...retrying, status: "canceled", retryPending: false }],
    ["un intento cobrado", { ...retrying, status: "succeeded", retryPending: false }],
  ])("con %s no toca el intento", async (_label, lastAttempt) => {
    const harness = useTx(fakeTx({ lastAttempt }));

    await expect(recordManualPaymentForCharge(manualCommand)).resolves.toBeDefined();

    expect(harness.executed.some((text) => text.includes("update zaltyko.family_collection_attempts"))).toBe(false);
    expect(mocks.appendOutbox).not.toHaveBeenCalledWith(
      harness.tx,
      expect.objectContaining({ eventName: "family_collection.attempt_canceled" })
    );
  });

  it("sin las tablas de la Fase 3 no consulta ningún intento", async () => {
    mocks.storage.mockResolvedValue(false);
    const harness = useTx(fakeTx({ inProgress: { attemptId, invoiceId, status: "claimed" }, lastAttempt: retrying }));

    await expect(recordManualPaymentForCharge(manualCommand)).resolves.toBeDefined();
    expect(harness.executed.some((text) => text.includes("family_collection_attempts"))).toBe(false);
  });
});
