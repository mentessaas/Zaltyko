import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático (Fase 3): el libro de cuotas. Emisión con el modo real,
 * registro del pago de Stripe (idempotente, sin mirar saldos) y reparto entre
 * cuotas (lo que quepa; si no cuadra, revisión). Base simulada.
 */

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  findEvent: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
  access: vi.fn(),
  storage: vi.fn(),
  flag: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: vi.fn() } }));
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
  isFamilyAutomaticCollectionFlagEnabled: mocks.flag,
  isFamilyAutomaticSepaCollectionFlagEnabled: () => false,
  resolveConnectEnvironment: () => "test",
  isProductionDatabase: () => false,
}));

import {
  charges,
  invoiceLines,
  invoices,
  paymentAllocations,
  payments,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  allocateProviderCollectionPayment,
  findAutomaticCollectionInProgress,
  issueInvoiceInTransaction,
  recordProviderCollectionPayment,
} from "@/modules/billing/application/ledger-service";
import { loadPlanChangeRevision } from "@/modules/billing/application/plan-state";
import {
  evaluationActorSchema,
  FAMILY_COLLECTION_JOB_KEY,
  systemActorSchema,
} from "@/modules/shared/application/actor";

const dialect = new PgDialect();

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const familyId = "10000000-0000-4000-8000-000000000003";
const familyPayerId = "10000000-0000-4000-8000-000000000010";
const invoiceId = "10000000-0000-4000-8000-000000000008";
const chargeId = "10000000-0000-4000-8000-000000000007";
const chargeId2 = "10000000-0000-4000-8000-000000000017";
const paymentId = "10000000-0000-4000-8000-000000000006";
const attemptId = "10000000-0000-4000-8000-000000000020";
const actor = {
  userId: "10000000-0000-4000-8000-000000000004",
  memberId: "10000000-0000-4000-8000-000000000005",
};
// Referencia opaca sintética del cobro en Stripe.
const paymentIntentId = "pi_SyntheticCollection1";

type Row = Record<string, unknown>;

interface FakeOptions {
  rows?: Map<unknown, Row[]>;
  /** Respuesta a cada tx.execute según su SQL compilado. */
  execute?: (sqlText: string) => Row[];
  insertReturning?: (table: unknown, values: Row) => Row[];
}

function fakeTx(options: FakeOptions = {}) {
  const inserts: Array<{ table: unknown; values: Row; onConflict: boolean }> = [];
  const updates: Array<{ table: unknown; values: Row }> = [];
  const executed: string[] = [];
  const select = vi.fn(() => {
    let table: unknown;
    const query = {
      from: (value: unknown) => {
        table = value;
        return query;
      },
      where: () => query,
      limit: async () => options.rows?.get(table) ?? [],
    };
    return query;
  });
  const insert = vi.fn((table: unknown) => ({
    values: (values: Row) => {
      const entry = { table, values, onConflict: false };
      inserts.push(entry);
      const returning = async () => options.insertReturning?.(table, values) ?? [{ id: "inserted", ...values }];
      const chain = {
        returning,
        onConflictDoNothing: () => {
          entry.onConflict = true;
          return { returning };
        },
        then: (resolve: (value: unknown) => unknown) => resolve(undefined),
      };
      return chain;
    },
  }));
  const update = vi.fn((table: unknown) => ({
    set: (values: Row) => {
      updates.push({ table, values });
      return { where: async () => undefined };
    },
  }));
  const execute = vi.fn(async (statement: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    const text = dialect.sqlToQuery(statement).sql.replace(/\s+/g, " ").trim();
    executed.push(text);
    // lockOrganizationForSaasMutation: la academia existe.
    if (/from zaltyko\.organizations where id = .* for update/.test(text)) {
      return { rows: [{ id: organizationId }] };
    }
    return { rows: options.execute?.(text) ?? [] };
  });
  const tx = { select, insert, update, execute } as unknown as TransactionClient;
  return { tx, inserts, updates, executed };
}

function invoiceRow(): Row {
  return {
    id: invoiceId,
    organizationId,
    locationId,
    familyId,
    familyPayerId,
    currency: "EUR",
    status: "issued",
  };
}

function paymentRow(overrides: Row = {}): Row {
  return {
    id: paymentId,
    organizationId,
    locationId,
    familyId,
    familyPayerId,
    source: "provider",
    status: "succeeded",
    amountCents: 4500,
    currency: "EUR",
    ...overrides,
  };
}

function chargeRow(overrides: Row = {}): Row {
  return {
    id: chargeId,
    organizationId,
    locationId,
    invoiceId,
    familyId,
    familyPayerId,
    status: "due",
    amountCents: 4500,
    currency: "EUR",
    collectionMode: "automatic",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lock.mockResolvedValue(undefined);
  mocks.findEvent.mockResolvedValue(null);
  mocks.access.mockResolvedValue(undefined);
  mocks.storage.mockResolvedValue(false);
  mocks.flag.mockReturnValue(true);
});

describe("actor de sistema del cobro automático", () => {
  it("acepta el trabajo del cobro y conserva el del outbox", () => {
    const correlationId = "10000000-0000-4000-8000-000000000099";
    expect(
      systemActorSchema.parse({ type: "system", jobKey: FAMILY_COLLECTION_JOB_KEY, correlationId }).jobKey
    ).toBe("zaltyko-family-collection");
    expect(systemActorSchema.parse({ type: "system", jobKey: "zaltyko-outbox", correlationId }).jobKey).toBe(
      "zaltyko-outbox"
    );
    expect(systemActorSchema.safeParse({ type: "system", jobKey: "otro", correlationId }).success).toBe(false);
  });

  it("el proceso del cobro no puede lanzar evaluaciones; el outbox y las personas sí", () => {
    const correlationId = "10000000-0000-4000-8000-000000000099";
    expect(
      evaluationActorSchema.safeParse({ type: "system", jobKey: FAMILY_COLLECTION_JOB_KEY, correlationId }).success
    ).toBe(false);
    expect(
      evaluationActorSchema.safeParse({ type: "system", jobKey: "zaltyko-outbox", correlationId }).success
    ).toBe(true);
    expect(evaluationActorSchema.safeParse(actor).success).toBe(true);
  });
});

describe("issueInvoiceInTransaction y el modo de cobro", () => {
  const issueCommand = {
    organizationId,
    locationId,
    familyId,
    familyPayerId,
    reference: "QA-FACTURA-AUTO",
    currency: "EUR",
    dueAt: "2026-12-05T22:59:59.999Z",
    lines: [
      {
        lineType: "manual_fee",
        quantity: 1,
        unitAmountCents: 4500,
        servicePeriodStart: "2026-12-01",
        servicePeriodEnd: "2026-12-31",
      },
    ],
    idempotencyKey: "issue-command-key-01",
    actor,
  };

  it("una factura que no es mensual no puede nacer en automático (409, sin escribir)", async () => {
    const { tx, inserts } = fakeTx();
    await expect(
      issueInvoiceInTransaction(tx, issueCommand, { collectionMode: "automatic" } as never)
    ).rejects.toMatchObject({ code: "FAMILY_AUTOMATIC_COLLECTION_DISABLED", status: 409 });
    expect(inserts).toEqual([]);
  });

  it("una factura mensual en automático crea sus cuotas en automático", async () => {
    const { tx, inserts } = fakeTx({
      insertReturning: (table, values) =>
        table === invoices
          ? [{ id: invoiceId, ...values }]
          : [{ id: chargeId, ...values }],
    });
    await issueInvoiceInTransaction(tx, issueCommand, {
      collectionMode: "automatic",
      monthlyInvoice: true,
    });
    const charge = inserts.find((entry) => entry.table === charges);
    expect(charge?.values).toMatchObject({ collectionMode: "automatic", status: "due" });
    expect(inserts.some((entry) => entry.table === invoiceLines)).toBe(true);
  });

  it("sin indicar el modo, una factura nace manual aunque la bandera esté encendida", async () => {
    const { tx, inserts, executed } = fakeTx({
      insertReturning: (table, values) =>
        table === invoices
          ? [{ id: invoiceId, ...values }]
          : [{ id: chargeId, ...values }],
    });
    await issueInvoiceInTransaction(tx, issueCommand);
    const charge = inserts.find((entry) => entry.table === charges);
    expect(charge?.values).toMatchObject({ collectionMode: "manual" });
    expect(executed.some((text) => text.includes("family_collection_preferences"))).toBe(false);
  });

  it("con el cobro automático cerrado, el libro rechaza una factura mensual en automático (409)", async () => {
    mocks.flag.mockReturnValue(false);
    const { tx, inserts } = fakeTx();
    await expect(
      issueInvoiceInTransaction(tx, issueCommand, {
        collectionMode: "automatic",
        monthlyInvoice: true,
      })
    ).rejects.toMatchObject({ code: "FAMILY_AUTOMATIC_COLLECTION_DISABLED", status: 409 });
    expect(inserts).toEqual([]);
  });
});

describe("recordProviderCollectionPayment", () => {
  const input = {
    organizationId,
    attemptId,
    invoiceId,
    paymentIntentId,
    amountCents: 4500,
    environment: "test" as const,
    receivedAt: new Date("2026-12-05T07:00:00.000Z"),
  };

  it("registra un pago provider en sandbox con el pagador de la factura, sin mirar cuotas", async () => {
    const { tx, inserts, updates } = fakeTx({
      rows: new Map<unknown, Row[]>([[invoices, [invoiceRow()]]]),
      insertReturning: (_table, values) => [{ id: paymentId, ...values }],
    });

    const result = await recordProviderCollectionPayment(tx, input);

    expect(result.created).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      table: payments,
      onConflict: true,
      values: {
        organizationId,
        locationId,
        familyId,
        familyPayerId,
        source: "provider",
        status: "succeeded",
        amountCents: 4500,
        currency: "EUR",
        processor: "stripe",
        environment: "sandbox",
        providerPaymentId: paymentIntentId,
        manualMethod: null,
        recordedByUserId: null,
        idempotencyKey: `family-collection:${attemptId}:${paymentIntentId}`,
      },
    });
    // Nunca toca cuotas ni facturas: no puede fallar por saldos.
    expect(updates).toEqual([]);
    expect(mocks.appendAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: null,
        action: "payment.provider_recorded",
        metadata: expect.objectContaining({ job_key: "zaltyko-family-collection" }),
      })
    );
    const outbox = mocks.appendOutbox.mock.calls[0]?.[1] as { payload: Row };
    expect(Object.keys(outbox.payload).sort()).toEqual(
      ["amountCents", "attemptId", "currency", "invoiceId", "paymentId", "source"].sort()
    );
  });

  it("es idempotente por el cobro de Stripe: repetirlo devuelve el mismo pago sin escribir", async () => {
    const existing = paymentRow({ providerPaymentId: paymentIntentId, environment: "sandbox" });
    const { tx, inserts } = fakeTx({ rows: new Map<unknown, Row[]>([[payments, [existing]]]) });

    const result = await recordProviderCollectionPayment(tx, input);

    expect(result).toEqual({ payment: existing, created: false });
    expect(inserts).toEqual([]);
    expect(mocks.appendAudit).not.toHaveBeenCalled();
  });

  it("si otro registro ganó la carrera devuelve ese pago", async () => {
    let paymentReads = 0;
    const existing = paymentRow();
    const { tx } = fakeTx({
      rows: new Map<unknown, Row[]>([[invoices, [invoiceRow()]]]),
      insertReturning: () => [],
    });
    const select = tx.select as unknown as ReturnType<typeof vi.fn>;
    const original = select.getMockImplementation()!;
    select.mockImplementation(() => {
      const query = original() as { from: (table: unknown) => unknown; limit: () => Promise<Row[]> };
      const from = query.from;
      query.from = (table: unknown) => {
        from(table);
        if (table === payments) {
          paymentReads += 1;
          query.limit = async () => (paymentReads === 1 ? [] : [existing]);
        }
        return query;
      };
      return query;
    });

    await expect(recordProviderCollectionPayment(tx, input)).resolves.toEqual({
      payment: existing,
      created: false,
    });
  });

  it("rechaza un registro repetido con otro importe", async () => {
    const { tx } = fakeTx({ rows: new Map<unknown, Row[]>([[payments, [paymentRow({ amountCents: 3000 })]]]) });
    await expect(recordProviderCollectionPayment(tx, input)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });
});

describe("allocateProviderCollectionPayment", () => {
  function allocationTx(options: {
    charge: Row | null;
    paymentAllocatedBefore?: number;
    chargeAllocatedBefore?: number;
  }) {
    let allocatedTotal = options.paymentAllocatedBefore ?? 0;
    const harness = fakeTx({
      rows: new Map<unknown, Row[]>([
        [payments, [paymentRow()]],
        [charges, options.charge ? [options.charge] : []],
        [paymentAllocations, []],
      ]),
      insertReturning: (_table, values) => {
        allocatedTotal += Number(values.amountCents);
        return [{ id: "allocation-1", ...values }];
      },
      execute: (text) => {
        if (text.includes("payment_allocated") && text.includes("charge_allocated")) {
          return [
            {
              payment_allocated: options.paymentAllocatedBefore ?? 0,
              charge_allocated: options.chargeAllocatedBefore ?? 0,
            },
          ];
        }
        if (text.includes("bool_and")) return [{ all_paid: true, any_paid: true }];
        if (text.includes("charge_id =")) return [{ allocated: options.chargeAllocatedBefore ?? 0 }];
        if (text.includes("as allocated")) return [{ allocated: allocatedTotal }];
        return [];
      },
    });
    return harness;
  }

  const input = {
    organizationId,
    attemptId,
    invoiceId,
    paymentId,
    allocations: [{ chargeId, amountCents: 4500 }],
    allocatedAt: new Date("2026-12-05T07:00:00.000Z"),
  };

  it("reparte el cobro entre las cuotas y queda allocated", async () => {
    const { tx, inserts, executed } = allocationTx({ charge: chargeRow() });

    const result = await allocateProviderCollectionPayment(tx, input);

    expect(result).toEqual({
      status: "allocated",
      allocatedCents: 4500,
      unallocatedCents: 0,
      reviewReasons: [],
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.values).toMatchObject({
      paymentId,
      chargeId,
      amountCents: 4500,
      idempotencyKey: `family-collection:${paymentId}:${chargeId}`,
    });
    // Orden de bloqueo: organización, cargos y después el pago.
    const organizationLock = executed.findIndex((text) => text.includes("from zaltyko.organizations") && text.includes("for update"));
    const chargeLock = executed.findIndex((text) => text.includes("from zaltyko.charges") && text.includes("for update"));
    const paymentLock = executed.findIndex((text) => text.includes("from zaltyko.payments") && text.includes("for update"));
    expect(organizationLock).toBeGreaterThanOrEqual(0);
    expect(organizationLock).toBeLessThan(chargeLock);
    expect(chargeLock).toBeLessThan(paymentLock);
    expect(mocks.appendAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "payment.allocated", actorUserId: null })
    );
  });

  it.each([
    ["pagada a mano", chargeRow({ status: "paid" }), "charge_settled"],
    ["anulada", chargeRow({ status: "void" }), "charge_void"],
    ["de otra factura", chargeRow({ invoiceId: "10000000-0000-4000-8000-000000000098" }), "charge_mismatch"],
  ])("con la cuota %s deja el pago sin repartir y pide revisión", async (_label, charge, reason) => {
    const { tx, inserts } = allocationTx({ charge });

    const result = await allocateProviderCollectionPayment(tx, input);

    expect(result.status).toBe("needs_review");
    expect(result.reviewReasons).toContain(reason);
    expect(result.reviewReasons).toContain("unallocated_remainder");
    expect(result.unallocatedCents).toBe(4500);
    expect(inserts).toEqual([]);
  });

  it("con un pago parcial a mano reparte solo el saldo y pide revisión del resto", async () => {
    const { tx, inserts } = allocationTx({
      charge: chargeRow({ status: "partially_paid" }),
      chargeAllocatedBefore: 1500,
    });

    const result = await allocateProviderCollectionPayment(tx, input);

    expect(inserts[0]?.values).toMatchObject({ amountCents: 3000 });
    expect(result.status).toBe("needs_review");
    expect(result.reviewReasons).toEqual(["charge_settled", "unallocated_remainder"]);
    expect(result.unallocatedCents).toBe(1500);
  });

  it("si el importe planificado no cuadra con el pago pide revisión", async () => {
    const { tx } = allocationTx({ charge: chargeRow() });

    const result = await allocateProviderCollectionPayment(tx, {
      ...input,
      allocations: [
        { chargeId, amountCents: 4500 },
        { chargeId: chargeId2, amountCents: 1000 },
      ],
    });

    expect(result.status).toBe("needs_review");
    expect(result.reviewReasons).toContain("amount_mismatch");
  });

  it("mismo intento, segundo cobro de Stripe: los dos se registran y el segundo pide revisión", async () => {
    const secondIntent = "pi_SyntheticCollection2";
    const record = (intent: string, id: string) => {
      const harness = fakeTx({
        rows: new Map<unknown, Row[]>([[invoices, [invoiceRow()]]]),
        insertReturning: (_table, values) => [{ id, ...values }],
      });
      return recordProviderCollectionPayment(harness.tx, {
        organizationId,
        attemptId,
        invoiceId,
        paymentIntentId: intent,
        amountCents: 4500,
        environment: "test",
      }).then((result) => ({ result, inserts: harness.inserts }));
    };

    const first = await record(paymentIntentId, "10000000-0000-4000-8000-000000000031");
    const second = await record(secondIntent, "10000000-0000-4000-8000-000000000032");

    expect(first.result.created).toBe(true);
    expect(second.result.created).toBe(true);
    expect(first.inserts[0]?.values.idempotencyKey).toBe(`family-collection:${attemptId}:${paymentIntentId}`);
    expect(second.inserts[0]?.values.idempotencyKey).toBe(`family-collection:${attemptId}:${secondIntent}`);

    // La cuota ya quedó pagada con el primer cobro: el segundo no cabe.
    const { tx, inserts } = allocationTx({ charge: chargeRow({ status: "paid" }) });
    const allocation = await allocateProviderCollectionPayment(tx, input);
    expect(allocation).toEqual({
      status: "needs_review",
      allocatedCents: 0,
      unallocatedCents: 4500,
      reviewReasons: ["charge_settled", "unallocated_remainder"],
    });
    expect(inserts).toEqual([]);
  });

  it.each(["refunded", "failed", "partially_refunded", "pending"])(
    "con el pago %s no reparte y pide revisión sin lanzar",
    async (status) => {
      const harness = fakeTx({
        rows: new Map<unknown, Row[]>([
          [payments, [paymentRow({ status })]],
          [charges, [chargeRow()]],
        ]),
        execute: (text) => (text.includes("as allocated") ? [{ allocated: 0 }] : []),
      });

      await expect(allocateProviderCollectionPayment(harness.tx, input)).resolves.toEqual({
        status: "needs_review",
        allocatedCents: 0,
        unallocatedCents: 4500,
        reviewReasons: ["payment_not_available"],
      });
      expect(harness.inserts).toEqual([]);
      expect(harness.updates).toEqual([]);
    }
  );

  it("un reparto anterior que no coincide es una revisión, no una excepción", async () => {
    const harness = allocationTx({ charge: chargeRow(), paymentAllocatedBefore: 3000 });
    const prior = {
      id: "allocation-1",
      organizationId,
      paymentId,
      chargeId,
      amountCents: 5000,
      idempotencyKey: `family-collection:${paymentId}:${chargeId}`,
    };
    const select = harness.tx.select as unknown as ReturnType<typeof vi.fn>;
    const original = select.getMockImplementation()!;
    select.mockImplementation(() => {
      const query = original() as { from: (table: unknown) => unknown; limit: () => Promise<Row[]> };
      const from = query.from;
      query.from = (table: unknown) => {
        from(table);
        if (table === paymentAllocations) query.limit = async () => [prior];
        return query;
      };
      return query;
    });

    const result = await allocateProviderCollectionPayment(harness.tx, input);

    expect(result.status).toBe("needs_review");
    expect(result.reviewReasons).toContain("allocation_conflict");
    expect(harness.inserts).toEqual([]);
  });

  it("un reparto ya hecho cuenta como hecho (idempotente)", async () => {
    const harness = allocationTx({ charge: chargeRow(), paymentAllocatedBefore: 4500 });
    const prior = {
      id: "allocation-1",
      organizationId,
      paymentId,
      chargeId,
      amountCents: 4500,
      idempotencyKey: `family-collection:${paymentId}:${chargeId}`,
    };
    const select = harness.tx.select as unknown as ReturnType<typeof vi.fn>;
    const original = select.getMockImplementation()!;
    select.mockImplementation(() => {
      const query = original() as { from: (table: unknown) => unknown; limit: () => Promise<Row[]> };
      const from = query.from;
      query.from = (table: unknown) => {
        from(table);
        if (table === paymentAllocations) query.limit = async () => [prior];
        return query;
      };
      return query;
    });

    const result = await allocateProviderCollectionPayment(harness.tx, input);

    expect(result.status).toBe("allocated");
    expect(harness.inserts).toEqual([]);
  });
});

describe("findAutomaticCollectionInProgress", () => {
  it("sin las tablas de la Fase 3 responde null sin consultarlas", async () => {
    const { tx, executed } = fakeTx();
    await expect(
      findAutomaticCollectionInProgress(tx, { organizationId, chargeIds: [chargeId] })
    ).resolves.toBeNull();
    expect(executed).toEqual([]);
  });

  it("devuelve el intento abierto de la factura de esas cuotas, excluyendo el propio", async () => {
    mocks.storage.mockResolvedValue(true);
    const { tx, executed } = fakeTx({
      execute: () => [{ attemptId, invoiceId, status: "processing" }],
    });

    await expect(
      findAutomaticCollectionInProgress(tx, {
        organizationId,
        chargeIds: [chargeId],
        excludeAttemptId: "10000000-0000-4000-8000-000000000021",
      })
    ).resolves.toEqual({ attemptId, invoiceId, status: "processing" });
    expect(executed[0]).toContain("from zaltyko.family_collection_attempts");
    expect(executed[0]).toContain("a.id <>");
  });
});

describe("loadPlanChangeRevision (lectura del historial del plan)", () => {
  function executorWith(rows: Row[]) {
    return fakeTx({ execute: () => rows });
  }

  it("lee el historial append-only y devuelve el inicio de la racha con el plan vigente", async () => {
    const { tx, executed } = executorWith([{ currentRevision: 6, runStart: 4, runRows: "3" }]);
    await expect(loadPlanChangeRevision(tx, organizationId)).resolves.toBe(4);
    expect(executed[0]).toContain("from zaltyko.organization_entitlements e");
    expect(executed[0]).toContain("zaltyko.organization_entitlement_changes");
    // Solo fuera de Stripe cuenta la referencia (contrato); en Stripe, la suscripción.
    expect(executed[0]).toContain("case when h.source = 'stripe_subscription' then null else h.source_reference end");
  });

  it("sin derecho de plan devuelve null", async () => {
    const { tx } = executorWith([]);
    await expect(loadPlanChangeRevision(tx, organizationId)).resolves.toBeNull();
  });

  it.each([
    ["falta una revisión de la racha", { currentRevision: 6, runStart: 4, runRows: 2 }],
    ["el historial está vacío", { currentRevision: 6, runStart: null, runRows: 0 }],
    ["el inicio va después de la vigente", { currentRevision: 6, runStart: 7, runRows: 0 }],
  ])("si %s exige la revisión vigente", async (_label, row) => {
    const { tx } = executorWith([row]);
    await expect(loadPlanChangeRevision(tx, organizationId)).resolves.toBe(6);
  });
});
