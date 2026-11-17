import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático de cuotas (Fase 3): proceso diario de cobro con almacén y
 * Stripe simulados. Comprueba cada rama: la puerta corta antes de reclamar,
 * motivos pasajeros frente a finales, Stripe nunca dentro de una transacción,
 * reanudación sin segundo cobro, cancelación antes de dar por fallido un
 * cobro pendiente de autenticación y relectura de los que están en curso.
 * Solo datos sintéticos; nunca llama a Stripe ni a la base.
 */

const env = vi.hoisted(() => ({
  flag: true,
  environment: "test" as "test" | "live" | null,
  production: false,
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/modules/family-collection/application/config", () => ({
  isFamilyAutomaticCollectionFlagEnabled: () => env.flag,
  resolveConnectEnvironment: () => env.environment,
  isProductionDatabase: () => env.production,
}));
vi.mock("@/modules/family-collection/infrastructure/family-collection-store", () => ({
  createFamilyCollectionStore: vi.fn(() => {
    throw new Error("El almacén real no debe usarse en tests");
  }),
}));
vi.mock("@/modules/family-collection/infrastructure/stripe-collection-gateway", () => ({
  createStripeCollectionGateway: vi.fn(() => {
    throw new Error("El adaptador real de Stripe no debe usarse en tests");
  }),
}));
vi.mock("@/modules/payments-connect/application/connect-onboarding-service", () => ({
  refreshConnectAccountForCollection: vi.fn(),
}));

import { logger } from "@/lib/logger";
import { runFamilyCollection } from "@/modules/family-collection/application/family-collection-service";
import { collectionDescription } from "@/modules/family-collection/application/family-collection-steps";
import type {
  CollectionError,
  PaymentIntentSnapshot,
} from "@/modules/family-collection/domain/payment-outcome";
import type {
  ApplyOutcomeResult,
  AttemptOutcome,
  AttemptStripeRefs,
  ClaimDecision,
  CollectionAttempt,
  FamilyCollectionStore,
  InvoiceCollectionContext,
  LockedInvoiceSnapshot,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import type { FamilyCollectionGateway } from "@/modules/family-collection/infrastructure/stripe-collection-gateway";

const organizationId = "20000000-0000-4000-8000-000000000001";
const locationId = "20000000-0000-4000-8000-000000000002";
const familyId = "20000000-0000-4000-8000-000000000003";
const familyPayerId = "20000000-0000-4000-8000-000000000004";
const accountRowId = "20000000-0000-4000-8000-000000000005";
const authorizationId = "20000000-0000-4000-8000-000000000006";
const guardianId = "20000000-0000-4000-8000-000000000007";
const invoiceId = "20000000-0000-4000-8000-000000000008";
const chargeId = "20000000-0000-4000-8000-000000000009";
const attemptId = "20000000-0000-4000-8000-000000000010";
const connectedAccount = "acct_SyntheticA1";
const now = new Date("2026-11-17T09:00:00.000Z");
const intentId = "pi_SyntheticCollection1";

/** Lo que Stripe dice haber cobrado cuando la cuota (45 €) salió entera. */
const received = { amountCents: 4500, currency: "EUR" };

function snapshot(
  id: string,
  status: string,
  code: string | null = null,
  declineCode: string | null = null
): PaymentIntentSnapshot {
  return {
    id,
    status,
    lastErrorCode: code,
    lastDeclineCode: declineCode,
    amountReceivedCents: status === "succeeded" ? received.amountCents : 0,
    currency: received.currency,
  };
}

/** Error de petición de Stripe tal como lo lanza stripe-node, sin cobro dentro. */
const requestError = (code: string) =>
  Object.assign(new Error("Mensaje sintético de Stripe"), {
    type: "StripeInvalidRequestError",
    rawType: "invalid_request_error",
    code,
    statusCode: 400,
  });

function baseContext(): InvoiceCollectionContext {
  return {
    invoice: {
      id: invoiceId,
      organizationId,
      locationId,
      familyId,
      familyPayerId,
      status: "issued",
      currency: "EUR",
      isMonthly: true,
      timezone: "Europe/Madrid",
    },
    charges: [
      {
        id: chargeId,
        organizationId,
        invoiceId,
        familyId,
        familyPayerId,
        collectionMode: "automatic",
        status: "due",
        currency: "EUR",
        amountCents: 4500,
        outstandingCents: 4500,
        // 23:59:59.999 del 16 de noviembre en Madrid (ayer: dentro de la ventana de cobro).
        dueAt: new Date("2026-11-16T22:59:59.999Z"),
        servicePeriodStart: "2026-11-01",
      },
    ],
    organization: { id: organizationId, status: "active" },
    plan: {
      entitlement: {
        organizationId,
        planCode: "growth",
        revision: 2,
        source: "contract",
        sourceReference: `contract:${organizationId}`,
        subscriptionId: null,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveUntil: null,
      },
      subscription: null,
    },
    planChangeRevision: 2,
    preference: { requestedMode: "automatic", entitlementRevision: 2 },
    collectionDayOfMonth: null,
    account: {
      id: accountRowId,
      organizationId,
      processor: "stripe",
      environment: "test",
      providerAccountReference: connectedAccount,
      accountsApiGeneration: 2,
      chargeModel: "direct",
      status: "active",
      cardPaymentsCapabilityStatus: "active",
      sepaDebitPaymentsCapabilityStatus: "active",
      lastSyncedAt: new Date(now.getTime() - 10 * 60 * 1000),
    },
    authorization: {
      id: authorizationId,
      organizationId,
      familyId,
      familyPayerId,
      paymentProviderAccountId: accountRowId,
      status: "active",
      consentVersion: "borrador-2026-11-16",
      consentEvidenceReference: "attempt:synthetic",
      consentEvidenceSha256: "a".repeat(64),
      consentedAt: new Date("2026-11-01T10:00:00.000Z"),
      consentedByGuardianId: guardianId,
      validUntil: null,
      revokedAt: null,
      paymentMethodKind: "card",
      paymentMethodReference: "pm_SyntheticCard",
      mandateReference: null,
    },
    customerReference: "cus_SyntheticA",
    payer: {
      id: familyPayerId,
      organizationId,
      familyId,
      startsOn: "2026-01-01",
      endsOn: null,
      guardianActive: true,
      guardianLinkActive: true,
    },
    history: { openExists: false, last: null },
    reminderSent: false,
  };
}

function baseRefs(): AttemptStripeRefs {
  return {
    connectedAccount,
    customer: "cus_SyntheticA",
    paymentMethod: "pm_SyntheticCard",
    mandate: null,
    timezone: "Europe/Madrid",
    servicePeriodStart: "2026-11-01",
    // El intento 1 de la factura se reclama en la ejecución de `now`.
    firstAttemptClaimedAt: now,
    allocations: [{ chargeId, amountCents: 4500 }],
  };
}

function attempt(overrides: Partial<CollectionAttempt> = {}): CollectionAttempt {
  return {
    id: attemptId,
    organizationId,
    locationId,
    invoiceId,
    familyId,
    familyPayerId,
    authorizationId,
    paymentProviderAccountId: accountRowId,
    attemptNumber: 1,
    paymentMethodKind: "card",
    amountCents: 4500,
    currency: "EUR",
    status: "claimed",
    paymentIntentId: null,
    resumeCount: 0,
    claimedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
    ...overrides,
  };
}

/** Almacén en memoria. Marca cuándo está «dentro de una transacción». */
function makeWorld() {
  const world = {
    calls: [] as string[],
    inTransaction: false,
    context: baseContext() as InvoiceCollectionContext | null,
    contexts: [] as InvoiceCollectionContext[],
    refs: baseRefs() as AttemptStripeRefs | null,
    attempts: [] as CollectionAttempt[],
    due: [{ invoiceId, organizationId }],
    resumable: [] as CollectionAttempt[],
    processing: [] as CollectionAttempt[],
    exhausted: [] as CollectionAttempt[],
    locked: undefined as Partial<LockedInvoiceSnapshot> | undefined,
    decisions: [] as ClaimDecision[],
    applied: [] as AttemptOutcome[],
    applyResult: undefined as ApplyOutcomeResult | undefined,
    notices: [] as string[],
    /** Intentos que recuperaron su reanudación (releaseResume). */
    released: [] as string[],
    storage: true,
  };

  async function inTransaction<T>(name: string, work: () => T): Promise<T> {
    world.calls.push(name);
    world.inTransaction = true;
    try {
      return work();
    } finally {
      world.inTransaction = false;
    }
  }

  const store: FamilyCollectionStore = {
    isStorageAvailable: vi.fn<FamilyCollectionStore["isStorageAvailable"]>(async () => world.storage),
    listDueInvoices: vi.fn<FamilyCollectionStore["listDueInvoices"]>(async (input) => (input.after === null ? world.due : [])),
    loadInvoiceContext: vi.fn<FamilyCollectionStore["loadInvoiceContext"]>(async () => {
      world.calls.push("load");
      return world.contexts.shift() ?? world.context;
    }),
    claimOrCancel: vi.fn<FamilyCollectionStore["claimOrCancel"]>(async (input, decide) =>
      inTransaction("claimOrCancel", () => {
        const context = world.context ?? baseContext();
        const authorization = context.authorization;
        const decision = decide({
          invoice: context.invoice,
          charges: context.charges,
          history: context.history,
          reminderSent: context.reminderSent,
          authorization: authorization
            ? {
                id: authorization.id,
                organizationId: authorization.organizationId,
                familyId: authorization.familyId,
                familyPayerId: authorization.familyPayerId,
                paymentProviderAccountId: authorization.paymentProviderAccountId,
                status: authorization.status,
              }
            : null,
          ...world.locked,
        });
        world.decisions.push(decision);
        if (decision.action === "skip") return { outcome: "skipped" as const, reason: decision.reason };
        const created = attempt({
          attemptNumber: decision.attemptNumber,
          amountCents: decision.amountCents,
          status: decision.action,
          authorizationId: input.authorizationId,
          paymentProviderAccountId: input.paymentProviderAccountId,
          paymentMethodKind: input.paymentMethodKind,
          claimedAt: input.now,
        });
        world.attempts.push(created);
        return decision.action === "canceled"
          ? { outcome: "canceled" as const, attempt: created }
          : { outcome: "claimed" as const, attempt: created, allocations: decision.allocations };
      })
    ),
    markCreated: vi.fn<FamilyCollectionStore["markCreated"]>(async (input) =>
      inTransaction("markCreated", () => {
        const found = world.attempts.find((item) => item.id === input.attemptId);
        if (!found || found.status !== "claimed") return false;
        found.status = "created";
        found.paymentIntentId = input.paymentIntentId;
        return true;
      })
    ),
    applyOutcome: vi.fn<FamilyCollectionStore["applyOutcome"]>(async (input) =>
      inTransaction(`apply:${input.outcome.kind}`, (): ApplyOutcomeResult => {
        world.applied.push(input.outcome);
        if (world.applyResult) return world.applyResult;
        return {
          applied: true,
          status: input.outcome.kind,
          allocationStatus: input.outcome.kind === "succeeded" ? "allocated" : null,
          reviewReasons: [],
        };
      })
    ),
    // Cada toma se lleva hasta `limit` intentos (y ya no vuelven a estar disponibles).
    claimResumable: vi.fn<FamilyCollectionStore["claimResumable"]>(async (input) =>
      world.resumable.splice(0, input.limit).map((item) =>
        // El mismo objeto (el resto del almacén lo busca y lo cambia por id).
        Object.assign(item, {
          resumeClaim: { takenAt: input.now, previousUpdatedAt: "2026-11-16 08:00:00.123456+00" },
        })
      )
    ),
    releaseResume: vi.fn<FamilyCollectionStore["releaseResume"]>(async (item) => {
      world.calls.push(`release:${item.id}`);
      world.released.push(item.id);
      return true;
    }),
    listProcessing: vi.fn<FamilyCollectionStore["listProcessing"]>(async (input) => (input.after === null ? world.processing : [])),
    listExhaustedWithoutNotice: vi.fn<FamilyCollectionStore["listExhaustedWithoutNotice"]>(async (input) =>
      input.after === null ? world.exhausted : []
    ),
    loadAttemptRefs: vi.fn<FamilyCollectionStore["loadAttemptRefs"]>(async () => world.refs),
    recordNotice: vi.fn<FamilyCollectionStore["recordNotice"]>(async (input) => {
      world.calls.push(`notice:${input.reason}`);
      world.notices.push(input.reason);
      return true;
    }),
  };
  return { world, store };
}

type World = ReturnType<typeof makeWorld>["world"];

/** Stripe simulado: falla el test si se le llama dentro de una transacción. */
function makeGateway(world: World, behaviour: Partial<FamilyCollectionGateway> = {}) {
  const outside = (name: string) => {
    if (world.inTransaction) throw new Error(`Stripe dentro de una transacción: ${name}`);
    world.calls.push(`stripe:${name}`);
  };
  return {
    createPayment: vi.fn<FamilyCollectionGateway["createPayment"]>(async (input) => {
      outside("create");
      return behaviour.createPayment ? behaviour.createPayment(input) : snapshot(intentId, "requires_confirmation");
    }),
    confirmPayment: vi.fn<FamilyCollectionGateway["confirmPayment"]>(async (input) => {
      outside("confirm");
      return behaviour.confirmPayment ? behaviour.confirmPayment(input) : snapshot(input.paymentIntentId, "succeeded");
    }),
    retrievePayment: vi.fn<FamilyCollectionGateway["retrievePayment"]>(async (input) => {
      outside("retrieve");
      return behaviour.retrievePayment ? behaviour.retrievePayment(input) : snapshot(input.paymentIntentId, "succeeded");
    }),
    findPaymentByAttempt: vi.fn<FamilyCollectionGateway["findPaymentByAttempt"]>(async (input) => {
      outside("find");
      return behaviour.findPaymentByAttempt ? behaviour.findPaymentByAttempt(input) : null;
    }),
    cancelPayment: vi.fn<FamilyCollectionGateway["cancelPayment"]>(async (input) => {
      outside("cancel");
      return behaviour.cancelPayment ? behaviour.cancelPayment(input) : "canceled";
    }),
  };
}

function setup(behaviour: Partial<FamilyCollectionGateway> = {}) {
  const { world, store } = makeWorld();
  const gateway = makeGateway(world, behaviour);
  const refreshAccount = vi.fn<(accountRowId: string) => Promise<void>>(async () => {
    world.calls.push("refresh");
  });
  const run = (options: { now?: Date; deadlineMs?: number } = {}) =>
    runFamilyCollection({ now, ...options }, { store, gateway, refreshAccount });
  return { world, store, gateway, refreshAccount, run };
}

const cardDeclined = (declineCode: string): CollectionError => ({
  type: "card_error",
  code: "card_declined",
  declineCode,
  paymentIntent: snapshot(intentId, "requires_payment_method", "card_declined", declineCode),
});

const networkError = () => Object.assign(new Error("connection reset"), { type: "StripeConnectionError" });

beforeEach(() => {
  env.flag = true;
  env.environment = "test";
  env.production = false;
  vi.mocked(logger.error).mockClear();
});

describe("cerrojos y bandera", () => {
  it("con clave Live o base de producción no toca la base ni Stripe", async () => {
    for (const [environment, production] of [
      ["live", false],
      [null, false],
      ["test", true],
    ] as const) {
      env.environment = environment;
      env.production = production;
      const { store, gateway, run } = setup();
      const result = await run();
      expect(result.enabled).toBe(false);
      expect(store.isStorageAvailable).not.toHaveBeenCalled();
      expect(gateway.createPayment).not.toHaveBeenCalled();
    }
  });

  it("sin las tablas de las Fases 1–3 no hace nada", async () => {
    const { world, store, gateway, run } = setup();
    world.storage = false;
    expect(await run()).toMatchObject({ enabled: false, collected: 0 });
    expect(store.claimResumable).not.toHaveBeenCalled();
    expect(store.listDueInvoices).not.toHaveBeenCalled();
    expect(gateway.retrievePayment).not.toHaveBeenCalled();
  });

  it("con la bandera apagada solo pone al día lo que quedó a medias y nunca cobra nada nuevo", async () => {
    env.flag = false;
    const { world, store, gateway, run } = setup();
    world.processing = [attempt({ status: "processing", paymentIntentId: intentId })];
    const resumed = attempt({ id: "20000000-0000-4000-8000-000000000011", resumeCount: 1 });
    world.attempts.push(resumed);
    world.resumable = [resumed];

    const result = await run();

    expect(result.enabled).toBe(false);
    expect(store.listDueInvoices).not.toHaveBeenCalled();
    // El reclamado sin cobro en Stripe no se crea: la puerta dice flag_off.
    expect(gateway.findPaymentByAttempt).toHaveBeenCalledTimes(1);
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(gateway.confirmPayment).not.toHaveBeenCalled();
    expect(result.skipped.flag_off).toBe(1);
    // El que estaba en curso sí se registra.
    expect(world.applied).toEqual([{ kind: "succeeded", paymentIntentId: intentId, received }]);
    expect(result).toMatchObject({ collected: 1, reconciled: 1, resumed: 1 });
  });

  it("con el plazo agotado no empieza nada y marca la ejecución incompleta", async () => {
    const { store, run } = setup();
    const result = await run({ deadlineMs: -1 });
    expect(result.complete).toBe(false);
    expect(store.claimResumable).not.toHaveBeenCalled();
    expect(store.listDueInvoices).not.toHaveBeenCalled();
  });
});

describe("Fase B: cobrar lo que vence hoy", () => {
  it("tarjeta: reclamar, crear, guardar el pi_, confirmar y registrar, con Stripe siempre fuera de transacción", async () => {
    const { world, gateway, run } = setup();

    const result = await run();

    expect(world.calls).toEqual([
      "load",
      "claimOrCancel",
      "stripe:create",
      "markCreated",
      "stripe:confirm",
      "apply:succeeded",
    ]);
    expect(gateway.createPayment).toHaveBeenCalledWith({
      connectedAccount,
      attempt: { id: attemptId, invoiceId, attemptNumber: 1 },
      amountCents: 4500,
      currency: "EUR",
      customer: "cus_SyntheticA",
      paymentMethod: "pm_SyntheticCard",
      kind: "card",
      organizationId,
      description: "Cuota noviembre 2026",
    });
    expect(gateway.confirmPayment).toHaveBeenCalledWith({
      connectedAccount,
      paymentIntentId: intentId,
      attempt: { invoiceId, attemptNumber: 1 },
      mandate: null,
    });
    expect(world.decisions).toEqual([
      { action: "claimed", attemptNumber: 1, amountCents: 4500, allocations: [{ chargeId, amountCents: 4500 }] },
    ]);
    expect(world.applied).toEqual([{ kind: "succeeded", paymentIntentId: intentId, received }]);
    expect(result).toMatchObject({ enabled: true, complete: true, collected: 1, failed: 0, retried: 0, needsReview: 0 });
  });

  it("domiciliación: confirma con la orden SEPA y queda en curso", async () => {
    const { world, gateway, run } = setup({
      confirmPayment: async (input) => snapshot(input.paymentIntentId, "processing"),
    });
    world.context!.authorization!.paymentMethodKind = "sepa_debit";
    world.context!.authorization!.mandateReference = "mandate_SyntheticA";
    world.refs!.mandate = "mandate_SyntheticA";

    const result = await run();

    expect(gateway.createPayment.mock.calls[0][0]).toMatchObject({ kind: "sepa_debit" });
    expect(gateway.confirmPayment.mock.calls[0][0]).toMatchObject({ mandate: "mandate_SyntheticA" });
    expect(world.applied).toEqual([{ kind: "processing", paymentIntentId: intentId }]);
    expect(result.processing).toBe(1);
  });

  it("un cobro que necesita revisión (cuota ya pagada) cuenta como cobrado y como revisión", async () => {
    const { world, run } = setup();
    world.applyResult = {
      applied: true,
      status: "succeeded",
      allocationStatus: "needs_review",
      reviewReasons: ["charge_settled"],
    };
    expect(await run()).toMatchObject({ collected: 1, needsReview: 1, failed: 0 });
  });

  it("motivo pasajero de la puerta: no escribe nada ni llama a Stripe", async () => {
    const { world, store, gateway, run } = setup();
    world.context!.plan.entitlement!.planCode = "free";
    world.context!.plan.entitlement!.source = "bootstrap";

    const result = await run();

    expect(result.skipped).toEqual({ paid_plan_required: 1 });
    expect(store.claimOrCancel).not.toHaveBeenCalled();
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  it("motivo final de la puerta (autorización revocada): intento canceled con el motivo y sin Stripe", async () => {
    const { world, store, gateway, run } = setup();
    world.context!.authorization = null;
    world.context!.customerReference = null;

    const result = await run();

    expect(store.claimOrCancel).toHaveBeenCalledTimes(1);
    expect(vi.mocked(store.claimOrCancel).mock.calls[0][0]).toMatchObject({
      authorizationId: null,
      paymentProviderAccountId: null,
      paymentMethodKind: null,
    });
    expect(world.decisions).toEqual([
      {
        action: "canceled",
        attemptNumber: 1,
        amountCents: 4500,
        allocations: [{ chargeId, amountCents: 4500 }],
        reason: "authorization_missing",
      },
    ]);
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ canceled: 1, collected: 0 });
  });

  it("pagador que dejó de pagar: canceled por payer_not_current", async () => {
    const { world, run } = setup();
    world.context!.payer!.endsOn = "2026-11-15";
    await run();
    expect(world.decisions[0]).toMatchObject({ action: "canceled", reason: "payer_not_current" });
  });

  it("cuenta sin releer: la relee una vez por academia y, si sigue vieja, no decide nada", async () => {
    const { world, refreshAccount, gateway, run } = setup();
    const stale = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    world.context!.account!.lastSyncedAt = stale;

    const result = await run();

    expect(refreshAccount).toHaveBeenCalledTimes(1);
    expect(refreshAccount).toHaveBeenCalledWith(accountRowId);
    expect(world.calls.slice(0, 3)).toEqual(["load", "refresh", "load"]);
    expect(result.skipped).toEqual({ account_stale: 1 });
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  it("cuenta releída: cobra con los datos nuevos", async () => {
    const { world, refreshAccount, run } = setup();
    const fresh = baseContext();
    world.context!.account!.lastSyncedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    world.contexts = [structuredClone(world.context!), fresh];
    world.context = fresh;
    const result = await run();
    expect(refreshAccount).toHaveBeenCalledTimes(1);
    expect(result.collected).toBe(1);
  });

  it("cuota que aún no toca cobrar (día fijo posterior): no escribe nada", async () => {
    const { world, store, run } = setup();
    world.context!.collectionDayOfMonth = 25;
    const result = await run();
    expect(result.skipped).toEqual({ not_due_yet: 1 });
    expect(store.claimOrCancel).not.toHaveBeenCalled();
  });

  it("pago parcial previo: cobra solo el saldo", async () => {
    const { world, gateway, run } = setup();
    world.context!.charges[0].status = "partially_paid";
    world.context!.charges[0].outstandingCents = 2000;
    world.refs!.allocations = [{ chargeId, amountCents: 2000 }];
    await run();
    expect(world.decisions[0]).toMatchObject({ amountCents: 2000, allocations: [{ chargeId, amountCents: 2000 }] });
    expect(world.attempts[0].amountCents).toBe(2000);
    expect(gateway.createPayment.mock.calls[0][0].amountCents).toBe(2000);
  });

  it("dentro de la transacción: plan cambiado, autorización cambiada u otro intento abierto → no reclama", async () => {
    const cases: Array<[Partial<LockedInvoiceSnapshot>, string]> = [
      [{ charges: [{ ...baseContext().charges[0], outstandingCents: 1000 }] }, "plan_changed"],
      [{ authorization: null }, "authorization_changed"],
      [{ history: { openExists: true, last: { attemptNumber: 1, status: "claimed", nextRetryAt: null } } }, "concurrent"],
    ];
    for (const [locked, reason] of cases) {
      const { world, gateway, run } = setup();
      world.locked = locked;
      const result = await run();
      expect(result.skipped, reason).toEqual({ [reason]: 1 });
      expect(world.attempts, reason).toHaveLength(0);
      expect(gateway.createPayment, reason).not.toHaveBeenCalled();
    }
  });

  it("una cuota con otro pagador dentro de la transacción no se reclama", async () => {
    const { world, run } = setup();
    world.locked = { charges: [{ ...baseContext().charges[0], familyPayerId: "20000000-0000-4000-8000-000000000099" }] };
    expect((await run()).skipped).toEqual({ plan_changed: 1 });
  });

  it("si Stripe no responde al crear, el intento se queda reclamado (la reanudación lo busca)", async () => {
    const { world, store, run } = setup({
      createPayment: async () => {
        throw networkError();
      },
    });
    const result = await run();
    expect(store.markCreated).not.toHaveBeenCalled();
    expect(store.applyOutcome).not.toHaveBeenCalled();
    expect(world.attempts[0].status).toBe("claimed");
    expect(result.skipped).toEqual({ transient: 1 });
  });

  it("conflicto de idempotencia al crear: nunca otro cobro, error con solo ids y aviso a la academia", async () => {
    const { world, gateway, store, run } = setup({
      createPayment: async () => {
        throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters"), {
          type: "StripeIdempotencyError",
          rawType: "idempotency_error",
        });
      },
    });
    const result = await run();
    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
    expect(store.applyOutcome).not.toHaveBeenCalled();
    expect(world.notices).toEqual(["idempotency_conflict"]);
    expect(result.needsReview).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), undefined, {
      organizationId,
      invoiceId,
      attemptId,
    });
  });

  it("tarjeta rechazada por saldo: fallo con reintento a las 00:00 locales del día +1", async () => {
    const { world, run } = setup({ confirmPayment: async () => cardDeclined("insufficient_funds") });
    const result = await run();
    expect(world.applied).toEqual([
      {
        kind: "failed",
        paymentIntentId: intentId,
        code: "card_declined",
        declineCode: "insufficient_funds",
        // 18-11-2026 00:00 en Madrid (el primer intento es del 17).
        nextRetryAt: new Date("2026-11-17T23:00:00.000Z"),
      },
    ]);
    expect(result.failed).toBe(1);
    // Antes de programar el intento 2, el cobro de este se cancela en Stripe.
    expect(world.calls.slice(-2)).toEqual(["stripe:cancel", "apply:failed"]);
  });

  it("si Stripe no deja cancelar el cobro rechazado, el reintento se programa igual (mejor esfuerzo)", async () => {
    const { world, run } = setup({
      confirmPayment: async () => cardDeclined("insufficient_funds"),
      cancelPayment: async () => {
        throw networkError();
      },
    });
    await run();
    expect(world.applied[0]).toMatchObject({ kind: "failed", nextRetryAt: new Date("2026-11-17T23:00:00.000Z") });
  });

  describe("cadena de reintentos de tarjeta (D1: a 1, 3 y 7 días del primer intento)", () => {
    // El intento 1 se reclama hoy (17-11, 10:00 en Madrid): reintentos los días 18, 20 y 24.
    const HOUR = 60 * 60 * 1000;
    const day18 = new Date("2026-11-17T23:00:00.000Z");
    const day20 = new Date("2026-11-19T23:00:00.000Z");
    const day24 = new Date("2026-11-23T23:00:00.000Z");

    /**
     * Ejecución del proceso diario a las 07:00 locales del día `retryAt`, con el
     * intento `previous` fallido y su reintento pendiente para ese día.
     */
    async function retryRun(
      previous: number,
      retryAt: Date,
      behaviour: Partial<FamilyCollectionGateway>,
      at: Date = new Date(retryAt.getTime() + 7 * HOUR)
    ) {
      const harness = setup(behaviour);
      harness.world.context!.history = {
        openExists: false,
        last: { attemptNumber: previous, status: "failed", nextRetryAt: retryAt },
      };
      harness.world.context!.account!.lastSyncedAt = at;
      const result = await harness.run({ now: at });
      return { ...harness, result };
    }

    const declined = { confirmPayment: async () => cardDeclined("insufficient_funds") };

    it("cadena completa 1 → 2 → 3 → 4 con sus fechas; tras el 4.º fallo, cobro a mano", async () => {
      // Intento 1 (hoy): reintento el 18.
      const first = setup(declined);
      await first.run();
      expect(first.world.decisions[0]).toMatchObject({ action: "claimed", attemptNumber: 1 });
      expect(first.world.applied).toEqual([
        { kind: "failed", paymentIntentId: intentId, code: "card_declined", declineCode: "insufficient_funds", nextRetryAt: day18 },
      ]);

      const expected: Array<[number, Date, Date | null]> = [
        [1, day18, day20],
        [2, day20, day24],
        [3, day24, null],
      ];
      for (const [previous, retryAt, next] of expected) {
        const attemptNumber = previous + 1;
        const { world, gateway, result } = await retryRun(previous, retryAt, declined);
        expect(world.decisions[0], `intento ${attemptNumber}`).toMatchObject({ action: "claimed", attemptNumber });
        // Cobro nuevo con su propio número de intento (claves de idempotencia propias).
        expect(gateway.createPayment.mock.calls[0][0].attempt.attemptNumber).toBe(attemptNumber);
        expect(gateway.confirmPayment.mock.calls[0][0].attempt.attemptNumber).toBe(attemptNumber);
        expect(world.applied, `intento ${attemptNumber}`).toEqual([
          { kind: "failed", paymentIntentId: intentId, code: "card_declined", declineCode: "insufficient_funds", nextRetryAt: next },
        ]);
        expect(result).toMatchObject({ retried: 1, failed: 1, collected: 0 });
        if (next) {
          // Habrá otro intento: el cobro de este se cancela antes de registrar el fallo.
          expect(world.calls.slice(-2)).toEqual(["stripe:cancel", "apply:failed"]);
        } else {
          // Último: fallo final sin cancelar nada; la cuota vuelve a manual.
          expect(gateway.cancelPayment).not.toHaveBeenCalled();
        }
      }

      // Después del 4.º no se intenta nada más.
      const after = setup(declined);
      const nextDay = new Date("2026-11-25T06:00:00.000Z");
      after.world.context!.history = { openExists: false, last: { attemptNumber: 4, status: "failed", nextRetryAt: null } };
      after.world.context!.account!.lastSyncedAt = nextDay;
      const result = await after.run({ now: nextDay });
      expect(result.skipped).toEqual({ already_final: 1 });
      expect(after.store.claimOrCancel).not.toHaveBeenCalled();
    });

    it("cada reintento cobra aunque la ventana del primer cobro ya pasara (el 4.º sale el 24)", async () => {
      // La cuota vence el 16: su primera ventana acabó el 19. El intento 4 del 24 sí se cobra.
      const { world, result } = await retryRun(3, day24, {});
      expect(world.decisions[0]).toMatchObject({ action: "claimed", attemptNumber: 4 });
      expect(result).toMatchObject({ retried: 1, collected: 1 });
    });

    it("ventana propia de cada reintento: el último día (+3) aún cobra; el siguiente, canceled", async () => {
      // Reintento del día 20: su ventana llega al 23.
      const lastDay = await retryRun(2, day20, {}, new Date("2026-11-23T06:00:00.000Z"));
      expect(lastDay.world.decisions[0]).toMatchObject({ action: "claimed", attemptNumber: 3 });
      expect(lastDay.result).toMatchObject({ retried: 1, collected: 1 });

      const lapsed = await retryRun(2, day20, {}, new Date("2026-11-24T06:00:00.000Z"));
      expect(lapsed.world.decisions).toEqual([
        {
          action: "canceled",
          attemptNumber: 3,
          amountCents: 4500,
          allocations: [{ chargeId, amountCents: 4500 }],
          reason: "collection_window_expired",
        },
      ]);
      expect(lapsed.gateway.createPayment).not.toHaveBeenCalled();
      expect(lapsed.result).toMatchObject({ canceled: 1, retried: 0 });
    });

    it("un reintento que sale tarde no adelanta el siguiente al mismo día", async () => {
      // El intento 2 sale el 20 (día +3) en lugar del 18: el 3 pasa al 21, no al 20.
      const { world } = await retryRun(1, day18, declined, new Date("2026-11-20T06:00:00.000Z"));
      expect(world.applied[0]).toMatchObject({
        kind: "failed",
        nextRetryAt: new Date("2026-11-20T23:00:00.000Z"),
      });
    });

    it.each(["stolen_card", "lost_card", "fraudulent", "expired_card", "authentication_required"])(
      "fallo no recuperable en el intento 2 (%s): sin más reintentos",
      async (declineCode) => {
        const { world, result } = await retryRun(1, day18, { confirmPayment: async () => cardDeclined(declineCode) });
        expect(world.applied[0]).toMatchObject({ kind: "failed", declineCode, nextRetryAt: null });
        expect(result).toMatchObject({ retried: 1, failed: 1 });
      }
    );

    it("sin la fecha del intento 1 no se programa ningún reintento (la cuota pasa a manual)", async () => {
      const harness = setup(declined);
      const at = new Date(day18.getTime() + 7 * HOUR);
      harness.world.context!.history = { openExists: false, last: { attemptNumber: 1, status: "failed", nextRetryAt: day18 } };
      harness.world.context!.account!.lastSyncedAt = at;
      harness.world.refs!.firstAttemptClaimedAt = null;
      await harness.run({ now: at });
      expect(harness.world.applied[0]).toMatchObject({ kind: "failed", nextRetryAt: null });
      expect(harness.gateway.cancelPayment).not.toHaveBeenCalled();
    });
  });

  it("lo que queda es menos de 0,50 €: canceled amount_below_minimum antes de reclamar, sin Stripe", async () => {
    const { world, gateway, run } = setup();
    world.context!.charges[0].outstandingCents = 20;
    const result = await run();
    expect(world.decisions).toEqual([
      {
        action: "canceled",
        attemptNumber: 1,
        amountCents: 20,
        allocations: [{ chargeId, amountCents: 20 }],
        reason: "amount_below_minimum",
      },
    ]);
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ canceled: 1, collected: 0 });
  });

  it("justo 0,50 €: se cobra", async () => {
    const { world, gateway, run } = setup();
    world.context!.charges[0].outstandingCents = 50;
    await run();
    expect(world.decisions[0]).toMatchObject({ action: "claimed", amountCents: 50 });
    expect(gateway.createPayment.mock.calls[0][0]).toMatchObject({ amountCents: 50 });
  });

  it.each(["amount_too_small", "resource_missing", "account_invalid", "payment_method_unactivated", "capability_not_active"])(
    "Stripe rechaza crear el cobro (%s): canceled con su código, sin confirmar ni reintento",
    async (code) => {
      vi.mocked(logger.warn).mockClear();
      const { world, gateway, run } = setup({
        createPayment: async () => {
          throw requestError(code);
        },
      });
      const result = await run();
      expect(world.applied).toEqual([{ kind: "canceled", paymentIntentId: null, reason: code }]);
      expect(gateway.confirmPayment).not.toHaveBeenCalled();
      expect(result).toMatchObject({ canceled: 1, failed: 0, retried: 0 });
      // Solo ids, nombre y código del error: nunca su mensaje.
      expect(logger.warn).toHaveBeenCalledWith(
        "Cobro automático: Stripe rechazó crear el cobro; la cuota pasa a cobro manual",
        {
          organizationId,
          invoiceId,
          attemptId,
          errorName: "StripeInvalidRequestError",
          errorCode: code,
        }
      );
      expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("Mensaje sintético");
    }
  );

  it.each([
    ["red", () => networkError()],
    ["límite de peticiones", () => Object.assign(new Error("x"), { type: "StripeRateLimitError", rawType: "rate_limit_error", code: "rate_limit", statusCode: 429 })],
    ["bloqueo", () => Object.assign(new Error("x"), { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "lock_timeout", statusCode: 429 })],
    ["error interno de Stripe", () => Object.assign(new Error("x"), { type: "StripeAPIError", rawType: "api_error", statusCode: 500 })],
    [
      "rechazo con el cobro dentro",
      () =>
        Object.assign(requestError("resource_missing"), {
          payment_intent: { id: intentId, status: "requires_payment_method" },
        }),
    ],
  ])("error al crear (%s): pasajero, el intento se queda reclamado", async (_label, makeError) => {
    const { world, gateway, run } = setup({
      createPayment: async () => {
        throw makeError();
      },
    });
    const result = await run();
    expect(world.applied).toEqual([]);
    expect(gateway.confirmPayment).not.toHaveBeenCalled();
    expect(result.skipped).toEqual({ transient: 1 });
  });

  it("Stripe cobró otro importe: se pasa lo cobrado y, si el almacén no lo registra, cuenta como revisión", async () => {
    const { world, run } = setup({
      confirmPayment: async (input) => ({ ...snapshot(input.paymentIntentId, "succeeded"), amountReceivedCents: 4000 }),
    });
    world.applyResult = { applied: false, review: "amount_mismatch" };
    const result = await run();
    expect(world.applied).toEqual([
      { kind: "succeeded", paymentIntentId: intentId, received: { amountCents: 4000, currency: "EUR" } },
    ]);
    expect(result).toMatchObject({ collected: 0, failed: 0, needsReview: 1 });
    expect(result.skipped).toEqual({ amount_mismatch: 1 });
  });

  it("periodo de la cuota no válido: canceled invalid_service_period antes de reclamar, sin Stripe", async () => {
    const { world, gateway, run } = setup();
    world.context!.charges[0].servicePeriodStart = "";
    const result = await run();
    expect(world.decisions[0]).toMatchObject({ action: "canceled", reason: "invalid_service_period" });
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(result.canceled).toBe(1);
  });

  it("sin más números de intento: aviso único de la factura, sin reclamar", async () => {
    const { world, store, run } = setup();
    world.context!.history = {
      openExists: false,
      last: { attemptNumber: 5, status: "failed", nextRetryAt: new Date("2026-11-16T23:00:00.000Z") },
    };
    const result = await run();
    expect(store.claimOrCancel).not.toHaveBeenCalled();
    expect(vi.mocked(store.recordNotice).mock.calls[0][0]).toMatchObject({
      attemptId: null,
      invoiceId,
      reason: "attempts_exhausted",
    });
    expect(result).toMatchObject({ needsReview: 1, skipped: { attempts_exhausted: 1 } });
  });

  it("tarjeta robada: fallo final sin reintento", async () => {
    const { world, gateway, run } = setup({ confirmPayment: async () => cardDeclined("stolen_card") });
    await run();
    expect(world.applied[0]).toMatchObject({ kind: "failed", declineCode: "stolen_card", nextRetryAt: null });
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
  });

  it("autenticación pedida: cancela el cobro en Stripe antes de registrar el fallo", async () => {
    const { world, gateway, run } = setup({
      confirmPayment: async () => ({
        type: "card_error",
        code: "authentication_required",
        declineCode: "authentication_required",
        paymentIntent: snapshot(intentId, "requires_action"),
      }),
    });
    await run();
    expect(gateway.cancelPayment).toHaveBeenCalledWith({ connectedAccount, paymentIntentId: intentId });
    expect(world.calls.slice(-2)).toEqual(["stripe:cancel", "apply:failed"]);
    expect(world.applied[0]).toMatchObject({ kind: "failed", code: "authentication_required", nextRetryAt: null });
  });

  it("autenticación pedida y Stripe no deja cancelar: si sigue esperando no se da por fallido", async () => {
    const { world, store, run } = setup({
      confirmPayment: async () => ({
        type: "card_error",
        code: "authentication_required",
        declineCode: null,
        paymentIntent: snapshot(intentId, "requires_action"),
      }),
      cancelPayment: async () => {
        throw networkError();
      },
    });
    const result = await run();
    expect(store.applyOutcome).not.toHaveBeenCalled();
    expect(world.attempts[0].status).toBe("created");
    expect(result.skipped).toEqual({ transient: 1 });
  });

  it("autenticación pedida pero ya no cancelable: se relee y se aplica lo que diga Stripe", async () => {
    const { world, run } = setup({
      confirmPayment: async () => ({
        type: "card_error",
        code: "authentication_required",
        declineCode: null,
        paymentIntent: snapshot(intentId, "requires_action"),
      }),
      cancelPayment: async () => "not_cancelable",
      retrievePayment: async (input) => snapshot(input.paymentIntentId, "succeeded"),
    });
    await run();
    expect(world.applied).toEqual([{ kind: "succeeded", paymentIntentId: intentId, received }]);
  });

  it("si la confirmación no responde, no se da por fallido", async () => {
    const { world, store, run } = setup({
      confirmPayment: async () => {
        throw networkError();
      },
    });
    const result = await run();
    expect(store.applyOutcome).not.toHaveBeenCalled();
    expect(world.attempts[0]).toMatchObject({ status: "created", paymentIntentId: intentId });
    expect(result.skipped).toEqual({ transient: 1 });
  });

  it("reintento: solo cuando llega su fecha local (Ciudad de México)", async () => {
    const lastFailed = {
      openExists: false,
      last: {
        attemptNumber: 1,
        status: "failed" as const,
        // 20-11-2026 00:00 en Ciudad de México (UTC-6).
        nextRetryAt: new Date("2026-11-20T06:00:00.000Z"),
      },
    };
    const mexico = (context: InvoiceCollectionContext) => {
      context.invoice.timezone = "America/Mexico_City";
      context.history = lastFailed;
      context.account!.lastSyncedAt = null;
    };

    // 19-11 a las 23:30 locales: todavía no.
    const early = setup();
    mexico(early.world.context!);
    const before = await early.run({ now: new Date("2026-11-20T05:30:00.000Z") });
    expect(before.skipped).toMatchObject({ retry_not_due: 1 });
    expect(early.store.claimOrCancel).not.toHaveBeenCalled();

    // 20-11 a las 00:30 locales: se reintenta como intento 2.
    const onTime = setup();
    mexico(onTime.world.context!);
    const later = new Date("2026-11-20T06:30:00.000Z");
    onTime.world.context!.account!.lastSyncedAt = later;
    const result = await onTime.run({ now: later });
    expect(onTime.world.decisions[0]).toMatchObject({ action: "claimed", attemptNumber: 2 });
    expect(result).toMatchObject({ retried: 1, collected: 1 });
  });

  describe("ventana máxima de cobro (la cuota ya volvió a los recordatorios)", () => {
    // 23:59:59.999 del 7 de noviembre en Madrid: el margen acabó el 10.
    const lapsedDueAt = new Date("2026-11-07T22:59:59.999Z");
    const expiredDecision = (attemptNumber: number) => ({
      action: "canceled",
      attemptNumber,
      amountCents: 4500,
      allocations: [{ chargeId, amountCents: 4500 }],
      reason: "collection_window_expired",
    });

    it("vencida hace 10 días con un motivo pasajero: canceled collection_window_expired y sin Stripe", async () => {
      const { world, store, gateway, run } = setup();
      world.context!.charges[0].dueAt = lapsedDueAt;
      world.context!.plan.entitlement!.planCode = "free";
      world.context!.plan.entitlement!.source = "bootstrap";

      const result = await run();

      expect(world.decisions).toEqual([expiredDecision(1)]);
      expect(vi.mocked(store.claimOrCancel).mock.calls[0][0]).toMatchObject({
        authorizationId: null,
        paymentProviderAccountId: null,
        paymentMethodKind: null,
      });
      expect(gateway.createPayment).not.toHaveBeenCalled();
      expect(gateway.confirmPayment).not.toHaveBeenCalled();
      expect(result).toMatchObject({ canceled: 1, collected: 0, skipped: {} });
    });

    it("el motivo pasajero desapareció y la puerta deja pasar: tampoco se cobra", async () => {
      const { world, gateway, run } = setup();
      world.context!.charges[0].dueAt = lapsedDueAt;

      const result = await run();

      expect(world.decisions).toEqual([expiredDecision(1)]);
      expect(world.attempts[0]).toMatchObject({ status: "canceled" });
      expect(gateway.createPayment).not.toHaveBeenCalled();
      expect(result).toMatchObject({ canceled: 1, collected: 0 });
    });

    it("el último día del margen todavía se cobra", async () => {
      const { world, run } = setup();
      // 14 de noviembre + 3 días = hoy (17).
      world.context!.charges[0].dueAt = new Date("2026-11-14T22:59:59.999Z");
      expect(await run()).toMatchObject({ collected: 1, canceled: 0 });
      expect(world.decisions[0]).toMatchObject({ action: "claimed" });
    });

    it("con día fijo, el margen cuenta desde la fecha de cobro, no desde el vencimiento", async () => {
      const { world, run } = setup();
      // Vence el 7, pero la academia cobra el día 15: el margen llega al 18.
      world.context!.charges[0].dueAt = lapsedDueAt;
      world.context!.collectionDayOfMonth = 15;
      expect(await run()).toMatchObject({ collected: 1, canceled: 0 });
    });

    it("reintento cuya fecha pasó hace más del margen: canceled como intento 2, sin Stripe", async () => {
      const { world, gateway, run } = setup();
      world.context!.history = {
        openExists: false,
        // 13-11-2026 00:00 en Madrid: el margen acabó el 16.
        last: { attemptNumber: 1, status: "failed", nextRetryAt: new Date("2026-11-12T23:00:00.000Z") },
      };

      const result = await run();

      expect(world.decisions).toEqual([expiredDecision(2)]);
      expect(gateway.createPayment).not.toHaveBeenCalled();
      expect(result).toMatchObject({ canceled: 1, retried: 0 });
    });

    it("reintento dentro del margen: se cobra", async () => {
      const { world, run } = setup();
      world.context!.history = {
        openExists: false,
        // 14-11-2026 00:00 en Madrid: el margen llega a hoy.
        last: { attemptNumber: 1, status: "failed", nextRetryAt: new Date("2026-11-13T23:00:00.000Z") },
      };
      expect(await run()).toMatchObject({ retried: 1, collected: 1 });
    });

    it("dentro de la transacción la ventana ya pasó: nunca reclama, cancela", async () => {
      const { world, gateway, run } = setup();
      world.locked = { charges: [{ ...baseContext().charges[0], dueAt: lapsedDueAt }] };

      const result = await run();

      expect(world.decisions).toEqual([expiredDecision(1)]);
      expect(world.attempts[0]).toMatchObject({ status: "canceled" });
      expect(gateway.createPayment).not.toHaveBeenCalled();
      expect(result).toMatchObject({ canceled: 1, collected: 0 });
    });

    it("fuera se vio la ventana pasada y dentro no: no escribe nada (los datos cambiaron)", async () => {
      const { world, run } = setup();
      world.context!.charges[0].dueAt = lapsedDueAt;
      world.locked = { charges: [{ ...baseContext().charges[0] }] };

      const result = await run();

      expect(result.skipped).toEqual({ plan_changed: 1 });
      expect(world.attempts).toHaveLength(0);
    });
  });

  it("un intento final anterior (cobrado, cancelado o fallido sin reintento) no se repite", async () => {
    for (const status of ["succeeded", "canceled", "failed"] as const) {
      const { world, store, run } = setup();
      world.context!.history = { openExists: false, last: { attemptNumber: 1, status, nextRetryAt: null } };
      expect((await run()).skipped, status).toEqual({ already_final: 1 });
      expect(store.claimOrCancel).not.toHaveBeenCalled();
    }
  });
});

describe("recordatorio de pago ya enviado: nunca un cobro automático (reminder_sent)", () => {
  const reminderDecision = (attemptNumber: number) => ({
    action: "canceled",
    attemptNumber,
    amountCents: 4500,
    allocations: [{ chargeId, amountCents: 4500 }],
    reason: "reminder_sent",
  });
  // 17-11-2026 00:00 en Madrid: el reintento pendiente toca hoy.
  const retryDueToday = { attemptNumber: 1, status: "failed" as const, nextRetryAt: new Date("2026-11-16T23:00:00.000Z") };

  it("primer intento: canceled reminder_sent antes de reclamar, sin Stripe", async () => {
    const { world, store, gateway, run } = setup();
    world.context!.reminderSent = true;

    const result = await run();

    expect(world.decisions).toEqual([reminderDecision(1)]);
    expect(vi.mocked(store.claimOrCancel).mock.calls[0][0]).toMatchObject({
      authorizationId: null,
      paymentProviderAccountId: null,
      paymentMethodKind: null,
    });
    expect(world.attempts[0]).toMatchObject({ status: "canceled", attemptNumber: 1 });
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(gateway.confirmPayment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ canceled: 1, collected: 0, retried: 0, skipped: {} });
  });

  it("reintento pendiente que toca hoy: canceled reminder_sent como intento 2, sin Stripe", async () => {
    const { world, gateway, run } = setup();
    world.context!.history = { openExists: false, last: retryDueToday };
    world.context!.reminderSent = true;

    const result = await run();

    expect(world.decisions).toEqual([reminderDecision(2)]);
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ canceled: 1, retried: 0, collected: 0 });
  });

  it("manda sobre un motivo pasajero de la puerta (plan): se cierra igual", async () => {
    const { world, gateway, run } = setup();
    world.context!.plan.entitlement!.planCode = "free";
    world.context!.plan.entitlement!.source = "bootstrap";
    world.context!.reminderSent = true;

    const result = await run();

    expect(world.decisions).toEqual([reminderDecision(1)]);
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ canceled: 1, skipped: {} });
  });

  it("el recordatorio salió entre la lectura y el bloqueo: dentro de la transacción no reclama, cancela", async () => {
    const { world, store, gateway, run } = setup();
    world.locked = { reminderSent: true };

    const result = await run();

    // Fuera la puerta dejó pasar (se pidió reclamar con la autorización)…
    expect(vi.mocked(store.claimOrCancel).mock.calls[0][0]).toMatchObject({ authorizationId, paymentMethodKind: "card" });
    // …pero con los datos bloqueados se cancela y nunca se llama a Stripe.
    expect(world.decisions).toEqual([reminderDecision(1)]);
    expect(world.attempts[0]).toMatchObject({ status: "canceled" });
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(gateway.confirmPayment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ canceled: 1, collected: 0 });
  });

  it("también en un reintento: el recordatorio salió entre la lectura y el bloqueo", async () => {
    const { world, gateway, run } = setup();
    world.context!.history = { openExists: false, last: retryDueToday };
    world.locked = { reminderSent: true };

    await run();

    expect(world.decisions).toEqual([reminderDecision(2)]);
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  it("fuera se vio un recordatorio y dentro no (el envío falló): no escribe nada", async () => {
    const { world, gateway, run } = setup();
    world.context!.reminderSent = true;
    world.locked = { reminderSent: false };

    const result = await run();

    expect(result.skipped).toEqual({ plan_changed: 1 });
    expect(world.attempts).toHaveLength(0);
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  it("otro motivo final de la puerta y un recordatorio: se cancela con el motivo de la puerta", async () => {
    const { world, gateway, run } = setup();
    world.context!.authorization = null;
    world.context!.customerReference = null;
    world.locked = { reminderSent: true };

    await run();

    expect(world.decisions).toEqual([{ ...reminderDecision(1), reason: "authorization_missing" }]);
    expect(gateway.createPayment).not.toHaveBeenCalled();
  });

  it("la ventana máxima pasada va primero: canceled collection_window_expired", async () => {
    const { world, run } = setup();
    // 23:59:59.999 del 7 de noviembre en Madrid: el margen acabó el 10.
    world.context!.charges[0].dueAt = new Date("2026-11-07T22:59:59.999Z");
    world.context!.reminderSent = true;

    await run();

    expect(world.decisions).toEqual([{ ...reminderDecision(1), reason: "collection_window_expired" }]);
  });

  it("bandera apagada con un reintento pendiente y recordatorio enviado: al reencenderla el reintento no cobra", async () => {
    // Punto 2: con la bandera apagada el reintento no retiene los recordatorios;
    // sale uno y la familia paga por fuera. Al reencender la bandera dentro de
    // la ventana del reintento, la puerta lo cierra sin llamar a Stripe.
    const { world, store, gateway, run } = setup();
    world.context!.history = { openExists: false, last: retryDueToday };
    world.context!.reminderSent = true;

    env.flag = false;
    const off = await run();
    expect(off.enabled).toBe(false);
    expect(store.listDueInvoices).not.toHaveBeenCalled();
    expect(store.claimOrCancel).not.toHaveBeenCalled();

    env.flag = true;
    const on = await run();

    expect(world.decisions).toEqual([reminderDecision(2)]);
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(gateway.confirmPayment).not.toHaveBeenCalled();
    expect(on).toMatchObject({ enabled: true, canceled: 1, retried: 0, collected: 0 });
  });
});

describe("Fase A: reanudar lo que quedó a medias", () => {
  function resumeSetup(item: CollectionAttempt, behaviour: Partial<FamilyCollectionGateway> = {}) {
    const harness = setup(behaviour);
    harness.world.due = [];
    harness.world.attempts.push(item);
    harness.world.resumable = [item];
    return harness;
  }

  it("created confirmado en Stripe antes de la caída: lo registra sin crear ni confirmar", async () => {
    const item = attempt({ status: "created", paymentIntentId: intentId, resumeCount: 1 });
    const { world, gateway, run } = resumeSetup(item);
    const result = await run();
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(gateway.confirmPayment).not.toHaveBeenCalled();
    expect(gateway.findPaymentByAttempt).not.toHaveBeenCalled();
    expect(world.applied).toEqual([{ kind: "succeeded", paymentIntentId: intentId, received }]);
    expect(result).toMatchObject({ resumed: 1, reconciled: 1, collected: 1 });
  });

  it("claimed con cobro ya creado en Stripe: lo guarda, repite la puerta y confirma ese mismo", async () => {
    const item = attempt({ resumeCount: 1 });
    const { world, gateway, run } = resumeSetup(item, {
      findPaymentByAttempt: async () => snapshot(intentId, "requires_confirmation"),
    });
    await run();
    expect(gateway.findPaymentByAttempt).toHaveBeenCalledWith({ connectedAccount, attemptId });
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(world.calls).toEqual(["stripe:find", "markCreated", "load", "stripe:confirm", "apply:succeeded"]);
  });

  it("claimed sin cobro en Stripe: repite la puerta y lo crea", async () => {
    const item = attempt({ resumeCount: 2 });
    const { world, gateway, run } = resumeSetup(item);
    await run();
    expect(world.calls).toEqual([
      "stripe:find",
      "load",
      "stripe:create",
      "markCreated",
      "stripe:confirm",
      "apply:succeeded",
    ]);
    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
  });

  it("claimed sin cobro y la familia revocó el método: canceled sin Stripe", async () => {
    const item = attempt({ resumeCount: 1 });
    const { world, gateway, run } = resumeSetup(item);
    world.context!.authorization = null;
    const result = await run();
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(world.applied).toEqual([{ kind: "canceled", paymentIntentId: null, reason: "authorization_missing" }]);
    expect(result.canceled).toBe(1);
  });

  it("claimed sin cobro en Stripe y la familia ya recibió un recordatorio: canceled reminder_sent sin crear", async () => {
    const item = attempt({ resumeCount: 1 });
    const { world, gateway, run } = resumeSetup(item);
    world.context!.reminderSent = true;
    const result = await run();
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(world.calls).toEqual(["stripe:find", "load", "apply:canceled"]);
    expect(world.applied).toEqual([{ kind: "canceled", paymentIntentId: null, reason: "reminder_sent" }]);
    expect(result.canceled).toBe(1);
  });

  it("created sin confirmar y la familia ya recibió un recordatorio: cancela en Stripe y cierra sin confirmar", async () => {
    const item = attempt({ status: "created", paymentIntentId: intentId, resumeCount: 1 });
    const { world, gateway, run } = resumeSetup(item, {
      retrievePayment: async (input) => snapshot(input.paymentIntentId, "requires_confirmation"),
    });
    world.context!.reminderSent = true;
    await run();
    expect(gateway.confirmPayment).not.toHaveBeenCalled();
    expect(gateway.cancelPayment).toHaveBeenCalledTimes(1);
    expect(world.applied).toEqual([{ kind: "canceled", paymentIntentId: intentId, reason: "reminder_sent" }]);
  });

  it("created sin confirmar y la familia cambió de método: cancela en Stripe y cierra el intento", async () => {
    const item = attempt({ status: "created", paymentIntentId: intentId, resumeCount: 1 });
    const { world, gateway, run } = resumeSetup(item, {
      retrievePayment: async (input) => snapshot(input.paymentIntentId, "requires_confirmation"),
    });
    world.context!.authorization!.id = "20000000-0000-4000-8000-000000000098";
    await run();
    expect(gateway.confirmPayment).not.toHaveBeenCalled();
    expect(gateway.cancelPayment).toHaveBeenCalledTimes(1);
    expect(world.applied).toEqual([{ kind: "canceled", paymentIntentId: intentId, reason: "authorization_inactive" }]);
  });

  it("tercera reanudación sin cobro en Stripe: failed transient_exhausted sin crear", async () => {
    const item = attempt({ resumeCount: 3 });
    const { world, gateway, run } = resumeSetup(item);
    await run();
    expect(gateway.findPaymentByAttempt).toHaveBeenCalledTimes(1);
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(world.applied).toEqual([
      { kind: "failed", paymentIntentId: null, code: "transient_exhausted", declineCode: null, nextRetryAt: null },
    ]);
  });

  it("tercera reanudación con cobro sin resultado: lo cancela en Stripe antes de cerrarlo", async () => {
    const item = attempt({ status: "created", paymentIntentId: intentId, resumeCount: 3 });
    const { world, run } = resumeSetup(item, {
      retrievePayment: async () => {
        throw networkError();
      },
    });
    await run();
    expect(world.calls).toEqual(["stripe:retrieve", "stripe:cancel", "apply:failed"]);
    expect(world.applied[0]).toMatchObject({ paymentIntentId: intentId, code: "transient_exhausted" });
  });

  it("tercera reanudación: si Stripe ya no deja cancelar, se aplica lo que diga (nunca fallido si cobró)", async () => {
    const item = attempt({ status: "created", paymentIntentId: intentId, resumeCount: 3 });
    let reads = 0;
    const { world, run } = resumeSetup(item, {
      retrievePayment: async (input) => {
        reads += 1;
        if (reads === 1) throw networkError();
        return snapshot(input.paymentIntentId, "succeeded");
      },
      cancelPayment: async () => "not_cancelable",
    });
    await run();
    expect(world.applied).toEqual([{ kind: "succeeded", paymentIntentId: intentId, received }]);
  });

  it("varios cobros en Stripe para un intento: aviso de revisión, nunca failed ni otro cobro", async () => {
    const item = attempt({ resumeCount: 3 });
    const { world, gateway, store, run } = resumeSetup(item, {
      findPaymentByAttempt: async () => {
        throw new Error("FAMILY_COLLECTION_MULTIPLE_PAYMENTS_FOR_ATTEMPT");
      },
    });
    const result = await run();
    expect(store.applyOutcome).not.toHaveBeenCalled();
    expect(gateway.createPayment).not.toHaveBeenCalled();
    // En su última reanudación, además, el aviso de intento agotado.
    expect(world.notices).toEqual(["multiple_payments", "resume_exhausted"]);
    expect(result).toMatchObject({ needsReview: 2, failed: 0 });
  });

  it("última reanudación y la búsqueda en Stripe no responde: aviso resume_exhausted, sin crear ni cerrar", async () => {
    const item = attempt({ resumeCount: 3 });
    const { world, gateway, store, run } = resumeSetup(item, {
      findPaymentByAttempt: async () => {
        throw networkError();
      },
    });
    const result = await run();
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(store.applyOutcome).not.toHaveBeenCalled();
    expect(world.notices).toEqual(["resume_exhausted"]);
    expect(result).toMatchObject({ needsReview: 1, failed: 0 });
  });

  it("última reanudación y el almacén falla: aviso resume_exhausted igualmente", async () => {
    const item = attempt({ status: "created", paymentIntentId: intentId, resumeCount: 3 });
    const { world, store, run } = resumeSetup(item);
    vi.mocked(store.applyOutcome).mockRejectedValueOnce(new Error("caída"));
    const result = await run();
    expect(world.notices).toEqual(["resume_exhausted"]);
    expect(result.skipped).toMatchObject({ error: 1 });
  });

  it("al reanudar, si la cuota ya se pagó a mano antes de crear el cobro, se cierra sin cobrar", async () => {
    const item = attempt({ resumeCount: 1 });
    const { world, gateway, run } = resumeSetup(item);
    world.context!.charges[0].status = "paid";
    world.context!.charges[0].outstandingCents = 0;
    const result = await run();
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(world.applied).toEqual([{ kind: "canceled", paymentIntentId: null, reason: "charge_settled" }]);
    expect(result.canceled).toBe(1);
  });

  it("al reanudar un cobro sin confirmar, si la cuota se anuló, se cancela en Stripe y se cierra", async () => {
    const item = attempt({ status: "created", paymentIntentId: intentId, resumeCount: 1 });
    const { world, gateway, run } = resumeSetup(item, {
      retrievePayment: async (input) => snapshot(input.paymentIntentId, "requires_confirmation"),
    });
    world.context!.charges[0].status = "void";
    await run();
    expect(gateway.confirmPayment).not.toHaveBeenCalled();
    expect(world.calls).toEqual(["stripe:retrieve", "load", "stripe:cancel", "apply:canceled"]);
    expect(world.applied).toEqual([{ kind: "canceled", paymentIntentId: intentId, reason: "charge_void" }]);
  });

  it("al reanudar, una factura ya pagada o un saldo distinto tampoco se cobran", async () => {
    for (const [change, reason] of [
      [(context: InvoiceCollectionContext) => (context.invoice.status = "paid"), "invoice_closed"],
      [(context: InvoiceCollectionContext) => (context.charges[0].outstandingCents = 6000), "plan_changed"],
    ] as const) {
      const { world, gateway, run } = resumeSetup(attempt({ resumeCount: 1 }));
      change(world.context!);
      await run();
      expect(gateway.createPayment, reason).not.toHaveBeenCalled();
      expect(world.applied, reason).toEqual([{ kind: "canceled", paymentIntentId: null, reason }]);
    }
  });

  it("al reanudar con menos de 0,50 €: canceled amount_below_minimum, sin Stripe", async () => {
    const { world, gateway, run } = resumeSetup(attempt({ resumeCount: 1, amountCents: 20 }));
    world.context!.charges[0].outstandingCents = 20;
    world.refs!.allocations = [{ chargeId, amountCents: 20 }];
    await run();
    expect(gateway.findPaymentByAttempt).toHaveBeenCalledTimes(1);
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(world.applied).toEqual([{ kind: "canceled", paymentIntentId: null, reason: "amount_below_minimum" }]);
  });

  it("al reanudar, Stripe rechaza crear el cobro (cliente inexistente): canceled resource_missing", async () => {
    const { world, gateway, run } = resumeSetup(attempt({ resumeCount: 1 }), {
      createPayment: async () => {
        throw requestError("resource_missing");
      },
    });
    await run();
    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
    expect(gateway.confirmPayment).not.toHaveBeenCalled();
    expect(world.applied).toEqual([{ kind: "canceled", paymentIntentId: null, reason: "resource_missing" }]);
  });

  it("al reanudar sin periodo válido: canceled invalid_service_period, sin Stripe", async () => {
    const { world, gateway, run } = resumeSetup(attempt({ resumeCount: 1 }));
    world.refs!.servicePeriodStart = null;
    await run();
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(world.applied).toEqual([{ kind: "canceled", paymentIntentId: null, reason: "invalid_service_period" }]);
  });

  it("red de seguridad: un intento abierto con las reanudaciones agotadas recibe el aviso", async () => {
    const { world, run } = setup();
    world.due = [];
    world.exhausted = [attempt({ status: "created", paymentIntentId: intentId, resumeCount: 3 })];
    const result = await run();
    expect(world.notices).toEqual(["resume_exhausted"]);
    expect(result.needsReview).toBe(1);
  });

  it("el cobro ya estaba registrado para otro intento: revisión, ni cobrado ni fallido", async () => {
    const item = attempt({ status: "created", paymentIntentId: intentId, resumeCount: 1 });
    const { world, run } = resumeSetup(item);
    world.applyResult = { applied: false, review: "payment_recorded_for_other_attempt" };
    const result = await run();
    expect(result).toMatchObject({ collected: 0, failed: 0, needsReview: 1, reconciled: 0 });
    expect(result.skipped).toEqual({ payment_recorded_for_other_attempt: 1 });
  });

  it("un error del almacén no frena a los demás intentos", async () => {
    const first = attempt({ status: "created", paymentIntentId: intentId, resumeCount: 1 });
    const second = attempt({
      id: "20000000-0000-4000-8000-000000000012",
      status: "created",
      paymentIntentId: "pi_SyntheticCollection2",
      resumeCount: 1,
    });
    const { world, store, run } = resumeSetup(first);
    world.resumable = [first, second];
    vi.mocked(store.applyOutcome).mockRejectedValueOnce(new Error("FAMILY_COLLECTION_INTENT_MISMATCH"));
    const result = await run();
    expect(result.skipped).toMatchObject({ error: 1 });
    expect(world.notices).toEqual(["intent_mismatch"]);
    expect(result.collected).toBe(1);
  });

  /** Intentos creados distintos, listos para reanudar. */
  function createdAttempts(count: number): CollectionAttempt[] {
    return Array.from({ length: count }, (_, index) =>
      attempt({
        id: `20000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
        status: "created",
        paymentIntentId: `pi_SyntheticResume${index}`,
        resumeCount: 1,
      })
    );
  }

  it("toma los intentos de 10 en 10 aunque la página general sea de 100", async () => {
    const { world, store, run } = setup();
    world.due = [];
    world.resumable = createdAttempts(12);

    const result = await run();

    expect(vi.mocked(store.claimResumable).mock.calls.map(([input]) => input.limit)).toEqual([10, 10]);
    expect(result).toMatchObject({ complete: true, resumed: 12, collected: 12 });
    expect(store.releaseResume).not.toHaveBeenCalled();
  });

  describe("plazo agotado a mitad de una toma", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("los intentos tomados que no se llegan a procesar recuperan su reanudación", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      const items = createdAttempts(3);
      const { world, store, gateway, run } = setup({
        retrievePayment: async (input) => {
          // El primero tarda más que todo el plazo de la ejecución (240 s).
          vi.setSystemTime(new Date(now.getTime() + 241_000));
          return snapshot(input.paymentIntentId, "succeeded");
        },
      });
      world.due = [];
      world.resumable = [...items];

      const result = await run();

      expect(result).toMatchObject({ complete: false, resumed: 1, collected: 1 });
      expect(world.applied).toEqual([{ kind: "succeeded", paymentIntentId: "pi_SyntheticResume0", received }]);
      expect(gateway.retrievePayment).toHaveBeenCalledTimes(1);
      // El segundo y el tercero no se tocaron: se devuelve lo que se les contó.
      expect(world.released).toEqual([items[1].id, items[2].id]);
      expect(vi.mocked(store.releaseResume).mock.calls[0][0]).toMatchObject({
        id: items[1].id,
        resumeCount: 1,
        resumeClaim: { takenAt: now, previousUpdatedAt: "2026-11-16 08:00:00.123456+00" },
      });
      expect(result.skipped).toMatchObject({ resume_released: 2 });
      // Nada más empieza: ni la relectura ni los cobros nuevos.
      expect(store.listProcessing).not.toHaveBeenCalled();
      expect(store.listDueInvoices).not.toHaveBeenCalled();
    });

    it("si el plazo se acaba justo al tomar, ninguno se procesa y todos recuperan su reanudación", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      const items = createdAttempts(2);
      const { world, store, gateway, run } = setup();
      world.due = [];
      world.resumable = [...items];
      const claim = store.claimResumable;
      store.claimResumable = vi.fn<FamilyCollectionStore["claimResumable"]>(async (input) => {
        const batch = await claim(input);
        vi.setSystemTime(new Date(now.getTime() + 241_000));
        return batch;
      });

      const result = await run();

      expect(result).toMatchObject({ complete: false, resumed: 0 });
      expect(gateway.retrievePayment).not.toHaveBeenCalled();
      expect(world.released).toEqual([items[0].id, items[1].id]);
    });

    it("si devolver una reanudación falla, se registra y se sigue con las demás", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      const items = createdAttempts(3);
      const { world, store, run } = setup({
        retrievePayment: async (input) => {
          vi.setSystemTime(new Date(now.getTime() + 241_000));
          return snapshot(input.paymentIntentId, "succeeded");
        },
      });
      world.due = [];
      world.resumable = [...items];
      vi.mocked(store.releaseResume).mockRejectedValueOnce(new Error("caída"));

      const result = await run();

      expect(store.releaseResume).toHaveBeenCalledTimes(2);
      expect(world.released).toEqual([items[2].id]);
      expect(result.skipped).toMatchObject({ error: 1, resume_released: 1 });
      expect(logger.error).toHaveBeenCalledWith(
        "Cobro automático: no se pudo devolver la reanudación de un intento",
        undefined,
        expect.objectContaining({ attemptId: items[1].id, errorName: "Error" })
      );
    });
  });
});

describe("Fase A: releer lo que está en curso", () => {
  function processingSetup(behaviour: Partial<FamilyCollectionGateway>) {
    const harness = setup(behaviour);
    harness.world.due = [];
    harness.world.processing = [
      attempt({ status: "processing", paymentIntentId: intentId, paymentMethodKind: "sepa_debit" }),
    ];
    return harness;
  }

  it("SEPA cobrada: se registra", async () => {
    const { world, run } = processingSetup({});
    const result = await run();
    expect(world.applied).toEqual([{ kind: "succeeded", paymentIntentId: intentId, received }]);
    expect(result).toMatchObject({ reconciled: 1, collected: 1 });
  });

  it("SEPA todavía en curso: no escribe nada", async () => {
    const { store, run } = processingSetup({
      retrievePayment: async (input) => snapshot(input.paymentIntentId, "processing"),
    });
    const result = await run();
    expect(store.applyOutcome).not.toHaveBeenCalled();
    expect(result).toMatchObject({ processing: 1, reconciled: 0 });
  });

  it("SEPA devuelta por el banco: fallo final, sin reintento", async () => {
    const { world, run } = processingSetup({
      retrievePayment: async (input) =>
        snapshot(input.paymentIntentId, "requires_payment_method", "payment_method_not_available", null),
    });
    await run();
    expect(world.applied).toEqual([
      {
        kind: "failed",
        paymentIntentId: intentId,
        code: "payment_method_not_available",
        declineCode: null,
        nextRetryAt: null,
      },
    ]);
  });

  it("Stripe no responde: se queda en curso", async () => {
    const { store, run } = processingSetup({
      retrievePayment: async () => {
        throw networkError();
      },
    });
    const result = await run();
    expect(store.applyOutcome).not.toHaveBeenCalled();
    expect(result.skipped).toEqual({ transient: 1 });
  });

  const DAY = 24 * 60 * 60 * 1000;
  // Errores tal como los lanza stripe-node 22 (`type` = clase, `code` = código de la API).
  const accountInvalid = () =>
    Object.assign(new Error("mensaje de Stripe que nunca se registra"), {
      type: "StripePermissionError",
      rawType: "invalid_request_error",
      code: "account_invalid",
      statusCode: 403,
    });
  const resourceMissing = () =>
    Object.assign(new Error("mensaje de Stripe que nunca se registra"), {
      type: "StripeInvalidRequestError",
      rawType: "invalid_request_error",
      code: "resource_missing",
      statusCode: 404,
    });

  /** Intentos en curso reclamados hace `daysAgo` días. */
  function processingAt(daysAgo: number, id = attemptId, paymentIntentId = intentId): CollectionAttempt {
    return attempt({
      id,
      status: "processing",
      paymentIntentId,
      paymentMethodKind: "sepa_debit",
      claimedAt: new Date(now.getTime() - daysAgo * DAY),
    });
  }

  it("error permanente con más de 15 días en curso: aviso processing_unreadable, registro del error y sigue en curso", async () => {
    const { world, store, run } = processingSetup({
      retrievePayment: async () => {
        throw accountInvalid();
      },
    });
    world.processing = [processingAt(16)];

    const result = await run();

    expect(store.applyOutcome).not.toHaveBeenCalled();
    expect(world.notices).toEqual(["processing_unreadable"]);
    expect(vi.mocked(store.recordNotice).mock.calls[0][0]).toMatchObject({
      attemptId,
      invoiceId,
      reason: "processing_unreadable",
      now,
    });
    expect(result).toMatchObject({ needsReview: 1, reconciled: 0 });
    expect(result.skipped).toEqual({ stripe_unreadable: 1 });
    expect(logger.error).toHaveBeenCalledWith("Cobro automático: Stripe no deja releer un cobro en curso", undefined, {
      organizationId,
      invoiceId,
      attemptId,
      errorName: "StripePermissionError",
      errorCode: "account_invalid",
      permanent: true,
    });
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain("mensaje de Stripe");
  });

  it("error permanente y el aviso processing_unreadable ya registrado: advertencia, no error", async () => {
    vi.mocked(logger.warn).mockClear();
    const { world, store, run } = processingSetup({
      retrievePayment: async () => {
        throw accountInvalid();
      },
    });
    world.processing = [processingAt(20)];
    // El aviso ya lo dejó una ejecución anterior: recordNotice no escribe nada.
    vi.mocked(store.recordNotice).mockResolvedValueOnce(false);

    const result = await run();

    expect(store.recordNotice).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ needsReview: 0, reconciled: 0 });
    expect(result.skipped).toEqual({ stripe_unreadable: 1 });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "Cobro automático: Stripe sigue sin dejar releer un cobro en curso; la academia ya tiene el aviso",
      {
        organizationId,
        invoiceId,
        attemptId,
        errorName: "StripePermissionError",
        errorCode: "account_invalid",
        permanent: true,
      }
    );
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("mensaje de Stripe");
  });

  it("error pasajero con más de 15 días en curso: también avisa, y lo registra como pasajero", async () => {
    vi.mocked(logger.warn).mockClear();
    const { world, run } = processingSetup({
      retrievePayment: async () => {
        throw networkError();
      },
    });
    world.processing = [processingAt(16)];

    const result = await run();

    expect(world.notices).toEqual(["processing_unreadable"]);
    expect(result.skipped).toEqual({ transient: 1 });
    expect(logger.warn).toHaveBeenCalledWith(
      "Cobro automático: no se pudo releer un cobro en curso; se vuelve a mirar otro día",
      expect.objectContaining({ attemptId, errorName: "StripeConnectionError", errorCode: null, permanent: false })
    );
  });

  it("error permanente con menos de 15 días en curso: lo registra, sin aviso todavía", async () => {
    const { world, run } = processingSetup({
      retrievePayment: async () => {
        throw resourceMissing();
      },
    });
    world.processing = [processingAt(14)];

    const result = await run();

    expect(world.notices).toEqual([]);
    expect(result.skipped).toEqual({ stripe_unreadable: 1 });
    expect(logger.error).toHaveBeenCalledWith(
      "Cobro automático: Stripe no deja releer un cobro en curso",
      undefined,
      expect.objectContaining({ errorName: "StripeInvalidRequestError", errorCode: "resource_missing", permanent: true })
    );
  });

  it("un intento ilegible no frena la relectura de los demás, aunque falle su aviso", async () => {
    const other = "20000000-0000-4000-8000-000000000013";
    const { world, store, run } = processingSetup({
      retrievePayment: async (input) => {
        if (input.paymentIntentId === intentId) throw accountInvalid();
        return snapshot(input.paymentIntentId, "succeeded");
      },
    });
    world.processing = [processingAt(16), processingAt(2, other, "pi_SyntheticCollection3")];
    vi.mocked(store.recordNotice).mockRejectedValueOnce(new Error("caída"));

    const result = await run();

    expect(world.applied).toEqual([{ kind: "succeeded", paymentIntentId: "pi_SyntheticCollection3", received }]);
    expect(result).toMatchObject({ collected: 1, reconciled: 1 });
    expect(result.skipped).toMatchObject({ stripe_unreadable: 1, error: 1 });
  });
});

describe("descripción del cobro", () => {
  it("«Cuota {mes} {año}» en español, sin referencia interna", () => {
    expect(collectionDescription("2026-11-01")).toBe("Cuota noviembre 2026");
    expect(collectionDescription("2027-01-01")).toBe("Cuota enero 2027");
    expect(() => collectionDescription("2026-13-01")).toThrow(RangeError);
  });
});
