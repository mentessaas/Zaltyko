import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  assertWritable: vi.fn(),
  assertAccess: vi.fn(),
  lock: vi.fn(),
  findEvent: vi.fn(),
  assertPayload: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/modules/saas-billing/application/organization-usage", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/saas-billing/application/organization-usage")>(),
  assertOrganizationOperationalWritable: mocks.assertWritable,
}));
vi.mock("@/modules/shared/infrastructure/operational-authorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/modules/shared/infrastructure/operational-authorization")>();
  mocks.assertAccess.mockImplementation(actual.assertOperationalAccess);
  return { ...actual, assertOperationalAccess: mocks.assertAccess };
});
vi.mock("@/modules/shared/infrastructure/transactional-records", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/shared/infrastructure/transactional-records")>(),
  appendAuditEntry: mocks.appendAudit,
  appendOutboxEvent: mocks.appendOutbox,
  assertIdempotencyPayload: mocks.assertPayload,
  findOutboxEvent: mocks.findEvent,
  lockCommand: mocks.lock,
}));

import {
  charges,
  financialReconciliationRuns,
  invoices,
  memberLocationScopes,
  organizationMembers,
  paymentAllocations,
  payments,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  allocatePayment,
  issueInvoiceInTransaction,
  reconcileFinancialPeriod,
  recordManualPayment,
  recordManualPaymentForCharge,
} from "@/modules/billing/application/ledger-service";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const familyId = "10000000-0000-4000-8000-000000000003";
const actor = {
  userId: "10000000-0000-4000-8000-000000000004",
  memberId: "10000000-0000-4000-8000-000000000005",
};
const paymentId = "10000000-0000-4000-8000-000000000006";
const chargeId = "10000000-0000-4000-8000-000000000007";
const invoiceId = "10000000-0000-4000-8000-000000000008";
const allocationId = "10000000-0000-4000-8000-000000000009";
const commandKey = "same-command-key-001";
const dialect = new PgDialect();
let member: { id: string; userId: string; organizationId: string; status: string; role: string; locationScopeMode: string };

function transactionWith(rows: Map<unknown, unknown[]> = new Map()) {
  const select = vi.fn(() => {
    let table: unknown;
    let params: unknown[] = [];
    const query = {
      from: (value: unknown) => { table = value; return query; },
      where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => { params = dialect.sqlToQuery(clause).params; return query; },
      limit: async () => {
        if (table === organizationMembers) {
          const authorizedMember = member.id === actor.memberId
            && member.userId === actor.userId
            && member.organizationId === organizationId
            && member.status === "active"
            && [organizationId, actor.userId, actor.memberId, "active"].every(value => params.includes(value));
          return authorizedMember ? [member] : [];
        }
        if (table === memberLocationScopes) {
          return [organizationId, member.id, locationId].every(value => params.includes(value)) ? [{ id: "synthetic-scope" }] : [];
        }
        return rows.get(table) ?? [];
      },
    };
    return query;
  });
  const write = vi.fn(() => { throw new Error("El replay no debe escribir"); });
  const tx = {
    select,
    execute: vi.fn(async () => ({ rows: [] })),
    insert: write,
    update: write,
    delete: write,
  } as unknown as TransactionClient;
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  return { tx, write };
}

function expectReadOnlyReplay(tx: TransactionClient, write: ReturnType<typeof vi.fn>) {
  expect(mocks.assertAccess).toHaveBeenCalledOnce();
  expect(mocks.assertWritable).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(mocks.appendAudit).not.toHaveBeenCalled();
  expect(mocks.appendOutbox).not.toHaveBeenCalled();
  const executeCalls = (tx.execute as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  for (const [statement] of executeCalls) {
    const query = statement as Parameters<PgDialect["sqlToQuery"]>[0];
    expect(dialect.sqlToQuery(query).sql.trim()).toMatch(/^select\b/i);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  member = { id: actor.memberId, userId: actor.userId, organizationId, status: "active", role: "owner", locationScopeMode: "selected" };
  mocks.lock.mockResolvedValue(undefined);
  mocks.findEvent.mockResolvedValue(null);
  mocks.assertPayload.mockImplementation(() => undefined);
});

describe("replay financiero con academia en solo lectura", () => {
  it("recupera la factura ya emitida sin abrir una escritura", async () => {
    const invoice = { id: invoiceId, organizationId, locationId };
    const { tx, write } = transactionWith(new Map([[invoices, [invoice]]]));
    mocks.findEvent.mockResolvedValue({ payload: { invoiceId } });

    await expect(issueInvoiceInTransaction(tx, {
      organizationId, locationId, familyId, reference: "QA-FACTURA",
      currency: "EUR", dueAt: "2026-10-30T12:00:00.000Z",
      lines: [{ lineType: "manual_fee", quantity: 1, unitAmountCents: 500, servicePeriodStart: "2026-10-01", servicePeriodEnd: "2026-10-31" }],
      idempotencyKey: commandKey, actor,
    })).resolves.toEqual(invoice);

    expectReadOnlyReplay(tx, write);
  });

  it("recupera un pago manual ya registrado sin duplicar el pago", async () => {
    const payment = { id: paymentId, organizationId, locationId, status: "succeeded" };
    const { tx, write } = transactionWith(new Map([[payments, [payment]]]));
    mocks.findEvent.mockResolvedValue({ payload: { paymentId } });

    await expect(recordManualPayment({
      organizationId, locationId, familyId, amountCents: 500, currency: "EUR",
      method: "cash", receivedAt: "2026-10-22T10:00:00.000Z",
      idempotencyKey: commandKey, actor,
    })).resolves.toEqual(payment);

    expectReadOnlyReplay(tx, write);
  });

  it("recupera el pago y su asignación existentes sin volver a asignar", async () => {
    const payment = { id: paymentId, organizationId, locationId, status: "succeeded" };
    const allocation = { id: allocationId, organizationId, chargeId, paymentId, amountCents: 500 };
    const { tx, write } = transactionWith(new Map([
      [payments, [payment]],
      [paymentAllocations, [allocation]],
    ]));
    mocks.findEvent.mockResolvedValue({ payload: { paymentId, allocationId } });

    await expect(recordManualPaymentForCharge({
      organizationId, chargeId, amountCents: 500, method: "bank_transfer",
      receivedAt: "2026-10-22T10:00:00.000Z",
      idempotencyKey: commandKey, actor,
    })).resolves.toEqual({ payment, allocation });

    expectReadOnlyReplay(tx, write);
  });

  it("recupera una asignación de pago existente sin repetirla", async () => {
    const payment = { id: paymentId, organizationId, locationId, status: "succeeded", currency: "EUR" };
    const charge = { id: chargeId, organizationId, locationId, status: "due", currency: "EUR" };
    const allocation = { id: allocationId, organizationId, chargeId, paymentId, amountCents: 500 };
    const { tx, write } = transactionWith(new Map([
      [payments, [payment]],
      [charges, [charge]],
      [paymentAllocations, [allocation]],
    ]));

    await expect(allocatePayment({
      organizationId, paymentId, chargeId, amountCents: 500,
      allocatedAt: "2026-10-22T10:00:00.000Z",
      idempotencyKey: commandKey, actor,
    })).resolves.toEqual(allocation);

    expectReadOnlyReplay(tx, write);
  });

  it("recupera una conciliación ya guardada sin recalcular ni escribir", async () => {
    const run = { id: "run-1", organizationId, currency: "EUR", periodStart: "2026-10-01", periodEnd: "2026-10-31" };
    const { tx, write } = transactionWith(new Map([[financialReconciliationRuns, [run]]]));

    await expect(reconcileFinancialPeriod({
      organizationId, authorizationLocationId: locationId, currency: "EUR",
      periodStart: "2026-10-01", periodEnd: "2026-10-31",
      sourceWatermark: "2026-10-23T12:00:00.000Z",
      idempotencyKey: commandKey, actor,
    })).resolves.toEqual(run);

    expectReadOnlyReplay(tx, write);
  });

  it("no permite recuperar el resultado a un miembro inactivo", async () => {
    member.status = "inactive";
    const invoice = { id: invoiceId, organizationId, locationId };
    const { tx, write } = transactionWith(new Map([[invoices, [invoice]]]));
    mocks.findEvent.mockResolvedValue({ payload: { invoiceId } });

    await expect(issueInvoiceInTransaction(tx, {
      organizationId, locationId, familyId, reference: "QA-FACTURA",
      currency: "EUR", dueAt: "2026-10-30T12:00:00.000Z",
      lines: [{ lineType: "manual_fee", quantity: 1, unitAmountCents: 500, servicePeriodStart: "2026-10-01", servicePeriodEnd: "2026-10-31" }],
      idempotencyKey: commandKey, actor,
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("no permite recuperar una factura desde una sede sin alcance", async () => {
    const invoice = { id: invoiceId, organizationId, locationId: "10000000-0000-4000-8000-000000000099" };
    const { tx, write } = transactionWith(new Map([[invoices, [invoice]]]));
    mocks.findEvent.mockResolvedValue({ payload: { invoiceId } });

    await expect(issueInvoiceInTransaction(tx, {
      organizationId, locationId, familyId, reference: "QA-FACTURA",
      currency: "EUR", dueAt: "2026-10-30T12:00:00.000Z",
      lines: [{ lineType: "manual_fee", quantity: 1, unitAmountCents: 500, servicePeriodStart: "2026-10-01", servicePeriodEnd: "2026-10-31" }],
      idempotencyKey: commandKey, actor,
    })).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("no permite recuperar el resultado a un rol no autorizado", async () => {
    member.role = "coach";
    const invoice = { id: invoiceId, organizationId, locationId };
    const { tx, write } = transactionWith(new Map([[invoices, [invoice]]]));
    mocks.findEvent.mockResolvedValue({ payload: { invoiceId } });

    await expect(issueInvoiceInTransaction(tx, {
      organizationId, locationId, familyId, reference: "QA-FACTURA",
      currency: "EUR", dueAt: "2026-10-30T12:00:00.000Z",
      lines: [{ lineType: "manual_fee", quantity: 1, unitAmountCents: 500, servicePeriodStart: "2026-10-01", servicePeriodEnd: "2026-10-31" }],
      idempotencyKey: commandKey, actor,
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });
});
