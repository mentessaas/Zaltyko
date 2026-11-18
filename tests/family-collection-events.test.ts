import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático de cuotas (Fase 4, Tarea 3): eventos de cobro de Stripe
 * (`payment_intent.*`) por el mismo camino que la relectura diaria, con el
 * almacén y Stripe simulados. El evento solo es el aviso: el manejador relee
 * el cobro y aplica lo que diga Stripe con settleOutcome → applyOutcome.
 * Cobro tardío (D10), domiciliación (D11) y Stripe siempre fuera de las
 * transacciones. El almacén simulado sigue el contrato documentado de
 * applyOutcome (late_succeeded incluido); el real lo prueba
 * tests/family-collection-events-pg.test.ts. Solo datos sintéticos y fechas
 * fijas: nunca llama a Stripe ni a la base ni depende del reloj.
 */

const env = vi.hoisted(() => ({
  flag: true,
  sepa: false,
  events: true,
  environment: "test" as "test" | "live" | null,
  production: false,
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/modules/family-collection/application/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/family-collection/application/config")>()),
  isFamilyAutomaticCollectionFlagEnabled: () => env.flag,
  isFamilyAutomaticSepaCollectionFlagEnabled: () => env.sepa,
  isFamilyCollectionEventsFlagEnabled: () => env.events,
  resolveConnectEnvironment: () => env.environment,
  isProductionDatabase: () => env.production,
}));
vi.mock("@/modules/family-collection/infrastructure/family-collection-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/family-collection/infrastructure/family-collection-store")>()),
  createFamilyCollectionStore: vi.fn(() => {
    throw new Error("El almacén real no debe usarse en tests");
  }),
}));
vi.mock("@/modules/family-collection/infrastructure/stripe-collection-gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/family-collection/infrastructure/stripe-collection-gateway")>()),
  createStripeCollectionGateway: vi.fn(() => {
    throw new Error("El adaptador real de Stripe no debe usarse en tests");
  }),
}));
vi.mock("@/modules/payments-connect/application/connect-onboarding-service", () => ({
  refreshConnectAccountForCollection: vi.fn(),
}));

import { logger } from "@/lib/logger";
import {
  ATTEMPT_EFFECT_TYPE,
  processPaymentIntentEvent,
  type ProviderEventHandlerInput,
} from "@/modules/family-collection/application/family-collection-events";
import {
  familyFailureNoticeKind,
  renderFamilyFailureNotice,
} from "@/modules/family-collection/domain/family-failure-notice";
import type { PaymentIntentSnapshot } from "@/modules/family-collection/domain/payment-outcome";
import { providerEventErrorCode } from "@/modules/family-collection/domain/provider-event";
import {
  DUPLICATE_COLLECTION_REASON,
  LATE_SUCCESS_ELSEWHERE_CODE,
  LATE_SUCCESS_PENDING_REASON,
  LATE_SUCCESS_SIBLING_IN_FLIGHT,
  type ApplyOutcomeResult,
  type AttemptOutcome,
  type AttemptStripeRefs,
  type CollectionAttempt,
  type FamilyCollectionStore,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import type { FamilyCollectionGateway } from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import type { StoredConnectAccount } from "@/modules/payments-connect/infrastructure/connect-account-store";

const organizationId = "40000000-0000-4000-8000-000000000001";
const locationId = "40000000-0000-4000-8000-000000000002";
const familyId = "40000000-0000-4000-8000-000000000003";
const familyPayerId = "40000000-0000-4000-8000-000000000004";
const accountRowId = "40000000-0000-4000-8000-000000000005";
const otherAccountRowId = "40000000-0000-4000-8000-000000000006";
const authorizationId = "40000000-0000-4000-8000-000000000007";
const invoiceId = "40000000-0000-4000-8000-000000000008";
const chargeId = "40000000-0000-4000-8000-000000000009";
const firstAttemptId = "40000000-0000-4000-8000-000000000010";
const secondAttemptId = "40000000-0000-4000-8000-000000000011";
const connectedAccount = "acct_SyntheticEvents1";
/** Hora fija del evento: nada depende del reloj. */
const now = new Date("2026-11-20T10:00:00.000Z");
const claimedAt = new Date("2026-11-02T08:00:00.000Z");

/** Lo que Stripe dice haber cobrado cuando la cuota (45 €) salió entera. */
const received = { amountCents: 4500, currency: "EUR" };

const account: StoredConnectAccount = {
  id: accountRowId,
  organizationId,
  environment: "test",
  providerAccountReference: connectedAccount,
  status: "active",
  cardPaymentsCapabilityStatus: "active",
  sepaDebitPaymentsCapabilityStatus: "active",
  requirementsState: "none",
  revision: 1,
  lastSyncedAt: null,
};

function attempt(overrides: Partial<CollectionAttempt> = {}): CollectionAttempt {
  return {
    id: firstAttemptId,
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
    status: "created",
    paymentIntentId: null,
    resumeCount: 0,
    claimedAt,
    ...overrides,
  };
}

/** Cobro tal como lo devuelve la pasarela al releerlo. */
function intent(
  id: string,
  status: string,
  options: { attemptId?: string | null; code?: string | null } = {}
): PaymentIntentSnapshot {
  return {
    id,
    status,
    lastErrorCode: options.code ?? null,
    lastDeclineCode: null,
    amountReceivedCents: status === "succeeded" ? received.amountCents : 0,
    currency: received.currency,
    attemptIdFromMetadata: options.attemptId ?? null,
  };
}

/** Estados en los que el almacén real deja aplicar un resultado normal (lockOpenAttempt). */
const STORE_OPEN = new Set(["claimed", "created", "processing"]);
/** Estados de un hermano que bloquean un cobro tardío (applyOutcome late_succeeded). */
const LATE_BLOCKING = new Set(["claimed", "created", "processing", "requires_action"]);

/**
 * Almacén y Stripe en memoria. El almacén marca cuándo está «dentro de una
 * transacción» y Stripe falla el test si se le llama dentro de una.
 */
function makeWorld() {
  const world = {
    attempts: [] as CollectionAttempt[],
    nextRetryAt: new Map<string, Date | null>(),
    failureCode: new Map<string, string | null>(),
    payments: [] as Array<{ attemptId: string; paymentIntentId: string }>,
    /** Avisos a la academia: `{intento}:{motivo}`. */
    notices: [] as string[],
    applied: [] as Array<{ attemptId: string; outcome: AttemptOutcome }>,
    calls: [] as string[],
    inTransaction: false,
    /** Cada llamada a Stripe y si había una transacción abierta en ese momento. */
    stripeCalls: [] as Array<{ name: string; inTransaction: boolean }>,
    stripe: new Map<string, PaymentIntentSnapshot>(),
    /** Intentos sin referencias legibles (loadAttemptRefs → null). */
    unreadable: new Set<string>(),
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

  const find = (id: string) => world.attempts.find((item) => item.id === id && item.organizationId === organizationId);

  function collect(found: CollectionAttempt, paymentIntentId: string): ApplyOutcomeResult {
    world.payments.push({ attemptId: found.id, paymentIntentId });
    found.status = "succeeded";
    found.paymentIntentId = paymentIntentId;
    world.nextRetryAt.set(found.id, null);
    world.failureCode.set(found.id, null);
    return { applied: true, status: "succeeded", allocationStatus: "allocated", reviewReasons: [] };
  }

  function applyInMemory(attemptId: string, outcome: AttemptOutcome): ApplyOutcomeResult {
    world.applied.push({ attemptId, outcome });
    const found = find(attemptId);
    if (outcome.kind === "late_succeeded") {
      // Contrato de applyOutcome: solo desde failed/canceled y con el mismo pi_.
      if (!found || (found.status !== "failed" && found.status !== "canceled")) return { applied: false };
      if (found.paymentIntentId !== outcome.paymentIntentId) throw new Error("FAMILY_COLLECTION_INTENT_MISMATCH");
      const siblings = world.attempts.filter((item) => item.invoiceId === found.invoiceId && item.id !== found.id);
      if (siblings.some((item) => item.status === "succeeded")) {
        world.notices.push(`${found.id}:${DUPLICATE_COLLECTION_REASON}`);
        return { applied: false, review: DUPLICATE_COLLECTION_REASON };
      }
      if (siblings.some((item) => LATE_BLOCKING.has(item.status))) throw new Error(LATE_SUCCESS_SIBLING_IN_FLIGHT);
      for (const item of world.attempts) {
        if (item.invoiceId === found.invoiceId && item.status === "failed") world.nextRetryAt.set(item.id, null);
      }
      return collect(found, outcome.paymentIntentId);
    }
    if (!found || !STORE_OPEN.has(found.status)) return { applied: false };
    if (outcome.paymentIntentId !== null && found.paymentIntentId !== null && found.paymentIntentId !== outcome.paymentIntentId) {
      throw new Error("FAMILY_COLLECTION_INTENT_MISMATCH");
    }
    if (outcome.kind === "succeeded") return collect(found, outcome.paymentIntentId);
    if (outcome.kind === "processing") {
      found.status = "processing";
      found.paymentIntentId = outcome.paymentIntentId;
      return { applied: true, status: "processing", allocationStatus: null, reviewReasons: [] };
    }
    if (outcome.kind === "failed") {
      found.status = "failed";
      world.nextRetryAt.set(found.id, outcome.nextRetryAt);
      world.failureCode.set(found.id, outcome.code);
      return { applied: true, status: "failed", allocationStatus: null, reviewReasons: [] };
    }
    found.status = "canceled";
    world.failureCode.set(found.id, outcome.reason);
    return { applied: true, status: "canceled", allocationStatus: null, reviewReasons: [] };
  }

  const unused = (name: string) => async () => {
    throw new Error(`Un evento de cobro no usa ${name}`);
  };

  const store: FamilyCollectionStore = {
    isStorageAvailable: vi.fn<FamilyCollectionStore["isStorageAvailable"]>(async () => true),
    listDueInvoices: vi.fn<FamilyCollectionStore["listDueInvoices"]>(unused("listDueInvoices")),
    loadInvoiceContext: vi.fn<FamilyCollectionStore["loadInvoiceContext"]>(unused("loadInvoiceContext")),
    claimOrCancel: vi.fn<FamilyCollectionStore["claimOrCancel"]>(unused("claimOrCancel")),
    claimResumable: vi.fn<FamilyCollectionStore["claimResumable"]>(unused("claimResumable")),
    releaseResume: vi.fn<FamilyCollectionStore["releaseResume"]>(unused("releaseResume")),
    listProcessing: vi.fn<FamilyCollectionStore["listProcessing"]>(unused("listProcessing")),
    listLateSuccessPending: vi.fn<FamilyCollectionStore["listLateSuccessPending"]>(unused("listLateSuccessPending")),
    listExhaustedWithoutNotice: vi.fn<FamilyCollectionStore["listExhaustedWithoutNotice"]>(
      unused("listExhaustedWithoutNotice")
    ),
    markCreated: vi.fn<FamilyCollectionStore["markCreated"]>(async (input) =>
      inTransaction("markCreated", () => {
        const found = find(input.attemptId);
        if (!found || found.status !== "claimed") return false;
        found.status = "created";
        found.paymentIntentId = input.paymentIntentId;
        return true;
      })
    ),
    applyOutcome: vi.fn<FamilyCollectionStore["applyOutcome"]>(async (input) =>
      inTransaction(`apply:${input.outcome.kind}:${input.attemptId}`, () => applyInMemory(input.attemptId, input.outcome))
    ),
    findAttemptByPaymentIntent: vi.fn<FamilyCollectionStore["findAttemptByPaymentIntent"]>(async (input) => {
      const found = world.attempts.find(
        (item) => item.organizationId === input.organizationId && item.paymentIntentId === input.paymentIntentId
      );
      return found ? { ...found } : null;
    }),
    findClaimedAttemptById: vi.fn<FamilyCollectionStore["findClaimedAttemptById"]>(async (input) => {
      const found = world.attempts.find(
        (item) => item.organizationId === input.organizationId && item.id === input.attemptId && item.status === "claimed"
      );
      return found ? { ...found } : null;
    }),
    listInvoiceSiblings: vi.fn<FamilyCollectionStore["listInvoiceSiblings"]>(async (input) =>
      world.attempts
        .filter((item) => item.invoiceId === input.invoiceId && item.id !== input.excludeAttemptId)
        .map((item) => ({ ...item }))
    ),
    loadAttemptRefs: vi.fn<FamilyCollectionStore["loadAttemptRefs"]>(
      async (item): Promise<AttemptStripeRefs | null> => world.unreadable.has(item.id) ? null : ({
        connectedAccount,
        customer: "cus_SyntheticEvents",
        paymentMethod: item.paymentMethodKind === "sepa_debit" ? "pm_SyntheticSepa" : "pm_SyntheticCard",
        mandate: item.paymentMethodKind === "sepa_debit" ? "mandate_SyntheticEvents" : null,
        timezone: "Europe/Madrid",
        servicePeriodStart: "2026-11-01",
        firstAttemptClaimedAt: claimedAt,
        allocations: [{ chargeId, amountCents: 4500 }],
      })
    ),
    recordNotice: vi.fn<FamilyCollectionStore["recordNotice"]>(async (input) => {
      world.notices.push(`${input.attemptId}:${input.reason}`);
      return true;
    }),
  };

  const outside = (name: string) => {
    world.stripeCalls.push({ name, inTransaction: world.inTransaction });
    if (world.inTransaction) throw new Error(`Stripe dentro de una transacción: ${name}`);
    world.calls.push(`stripe:${name}`);
  };
  const missing = () =>
    Object.assign(new Error("Mensaje sintético de Stripe: no existe"), {
      type: "StripeInvalidRequestError",
      rawType: "invalid_request_error",
      code: "resource_missing",
      statusCode: 404,
    });
  const gateway = {
    createPayment: vi.fn<FamilyCollectionGateway["createPayment"]>(async () => {
      outside("create");
      throw new Error("Un evento nunca crea un cobro");
    }),
    confirmPayment: vi.fn<FamilyCollectionGateway["confirmPayment"]>(async () => {
      outside("confirm");
      throw new Error("Un evento nunca confirma un cobro");
    }),
    retrievePayment: vi.fn<FamilyCollectionGateway["retrievePayment"]>(async (input) => {
      outside(`retrieve:${input.paymentIntentId}`);
      const found = world.stripe.get(input.paymentIntentId);
      if (!found || input.connectedAccount !== connectedAccount) throw missing();
      return { ...found };
    }),
    findPaymentByAttempt: vi.fn<FamilyCollectionGateway["findPaymentByAttempt"]>(async () => {
      outside("find");
      return null;
    }),
    cancelPayment: vi.fn<FamilyCollectionGateway["cancelPayment"]>(async (input) => {
      outside(`cancel:${input.paymentIntentId}`);
      const found = world.stripe.get(input.paymentIntentId);
      if (!found) throw missing();
      if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(found.status)) {
        found.status = "canceled";
        return "canceled";
      }
      return "not_cancelable";
    }),
  };

  return { world, store, gateway };
}

function setup() {
  const { world, store, gateway } = makeWorld();
  const event = (paymentIntentId: string, overrides: Partial<ProviderEventHandlerInput> = {}) =>
    processPaymentIntentEvent(
      {
        organizationId,
        account,
        objectId: paymentIntentId,
        now,
        inboxId: "40000000-0000-4000-8000-000000000099",
        eventId: "evt_SyntheticEvents0001",
        ...overrides,
      },
      { store, gateway, refreshAccount: vi.fn() }
    );
  return { world, store, gateway, event };
}

beforeEach(() => {
  env.flag = true;
  env.sepa = false;
  env.events = true;
  env.environment = "test";
  env.production = false;
  vi.mocked(logger.warn).mockClear();
  vi.mocked(logger.error).mockClear();
});

describe("evento de un cobro: el mismo camino que la relectura diaria", () => {
  it("payment_intent.succeeded de un intento created → pago registrado por applyOutcome", async () => {
    const { world, gateway, event } = setup();
    world.attempts.push(attempt({ status: "created", paymentIntentId: "pi_SyntheticPaid" }));
    world.stripe.set("pi_SyntheticPaid", intent("pi_SyntheticPaid", "succeeded"));

    const outcome = await event("pi_SyntheticPaid");

    expect(outcome.effect).toEqual({ effectType: ATTEMPT_EFFECT_TYPE, effectId: firstAttemptId });
    expect(world.applied).toEqual([
      { attemptId: firstAttemptId, outcome: { kind: "succeeded", paymentIntentId: "pi_SyntheticPaid", received } },
    ]);
    expect(world.payments).toEqual([{ attemptId: firstAttemptId, paymentIntentId: "pi_SyntheticPaid" }]);
    expect(outcome.result).toMatchObject({ collected: 1, skipped: {} });
    // Releer y aplicar: nunca crear, confirmar ni cancelar.
    expect(world.calls).toEqual(["stripe:retrieve:pi_SyntheticPaid", `apply:succeeded:${firstAttemptId}`]);
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(gateway.confirmPayment).not.toHaveBeenCalled();
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
  });

  it("succeeded y después un processing tardío → sigue succeeded y nada nuevo", async () => {
    const { world, gateway, event } = setup();
    world.attempts.push(attempt({ status: "created", paymentIntentId: "pi_SyntheticOrder" }));
    world.stripe.set("pi_SyntheticOrder", intent("pi_SyntheticOrder", "succeeded"));
    await event("pi_SyntheticOrder");

    // Llega tarde el `payment_intent.processing` del mismo cobro (el tipo no se mira).
    const late = await event("pi_SyntheticOrder", { eventId: "evt_SyntheticEvents0002" });

    expect(late.effect).toEqual({ effectType: null, effectId: null });
    expect(world.attempts[0]).toMatchObject({ status: "succeeded", paymentIntentId: "pi_SyntheticOrder" });
    expect(world.applied).toHaveLength(1);
    expect(world.payments).toHaveLength(1);
    // Un intento ya cobrado ni siquiera se relee.
    expect(gateway.retrievePayment).toHaveBeenCalledTimes(1);
  });

  it("evento de un pi_ de un intento claimed sin pi_ guardado → markCreated y registro", async () => {
    const { world, store, event } = setup();
    world.attempts.push(attempt({ status: "claimed", paymentIntentId: null }));
    world.stripe.set("pi_SyntheticCrash", intent("pi_SyntheticCrash", "succeeded", { attemptId: firstAttemptId }));

    const outcome = await event("pi_SyntheticCrash");

    expect(store.markCreated).toHaveBeenCalledWith({
      organizationId,
      attemptId: firstAttemptId,
      paymentIntentId: "pi_SyntheticCrash",
      now,
    });
    expect(world.calls).toEqual([
      "stripe:retrieve:pi_SyntheticCrash",
      "markCreated",
      "stripe:retrieve:pi_SyntheticCrash",
      `apply:succeeded:${firstAttemptId}`,
    ]);
    expect(world.attempts[0]).toMatchObject({ status: "succeeded", paymentIntentId: "pi_SyntheticCrash" });
    expect(world.payments).toEqual([{ attemptId: firstAttemptId, paymentIntentId: "pi_SyntheticCrash" }]);
    expect(outcome.effect.effectId).toBe(firstAttemptId);
  });

  it("pi_ que no es de un cobro automático de Zaltyko, de un intento ya no reclamado o que Stripe no encuentra → sin efecto", async () => {
    const { world, store, event } = setup();
    world.attempts.push(attempt({ status: "failed", paymentIntentId: null }));
    // La academia cobra otras cosas en su cuenta: sin metadata del intento.
    world.stripe.set("pi_SyntheticOther", intent("pi_SyntheticOther", "succeeded"));
    // Metadata de un intento que ya no está `claimed`.
    world.stripe.set("pi_SyntheticStale", intent("pi_SyntheticStale", "succeeded", { attemptId: firstAttemptId }));

    for (const paymentIntentId of ["pi_SyntheticOther", "pi_SyntheticStale", "pi_SyntheticUnknown"]) {
      const outcome = await event(paymentIntentId);
      expect(outcome.effect, paymentIntentId).toEqual({ effectType: null, effectId: null });
    }

    expect(store.markCreated).not.toHaveBeenCalled();
    expect(world.applied).toEqual([]);
    expect(world.payments).toEqual([]);
    // Stripe no encuentra el cobro (error permanente): solo ids y código, nunca el mensaje.
    expect(logger.warn).toHaveBeenCalledWith(
      "Cobro automático: Stripe no deja leer el cobro de un evento",
      expect.objectContaining({ paymentIntentId: "pi_SyntheticUnknown", errorCode: "resource_missing" })
    );
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("Mensaje sintético");
  });

  it("Stripe no responde al leer el cobro de un evento → el error sigue (el evento queda failed y Stripe lo reenvía)", async () => {
    const { world, gateway, event } = setup();
    world.attempts.push(attempt({ status: "created", paymentIntentId: "pi_SyntheticDown" }));
    const network = Object.assign(new Error("connection reset"), { type: "StripeConnectionError" });
    gateway.retrievePayment.mockRejectedValueOnce(network);

    await expect(event("pi_SyntheticDown")).rejects.toBe(network);
    expect(world.applied).toEqual([]);
  });

  it("evento con account distinta a la del intento → sin efecto", async () => {
    const { world, store, gateway, event } = setup();
    world.attempts.push(
      attempt({ status: "created", paymentIntentId: "pi_SyntheticForeign", paymentProviderAccountId: otherAccountRowId })
    );
    world.attempts.push(
      attempt({ id: secondAttemptId, invoiceId: chargeId, status: "claimed", paymentProviderAccountId: otherAccountRowId })
    );
    world.stripe.set("pi_SyntheticForeign", intent("pi_SyntheticForeign", "succeeded"));
    world.stripe.set("pi_SyntheticForeignNew", intent("pi_SyntheticForeignNew", "succeeded", { attemptId: secondAttemptId }));

    expect((await event("pi_SyntheticForeign")).effect).toEqual({ effectType: null, effectId: null });
    // Ni se relee el cobro del intento guardado con otra cuenta.
    expect(gateway.retrievePayment).not.toHaveBeenCalled();
    // Tampoco se adopta un intento reclamado de otra cuenta.
    expect((await event("pi_SyntheticForeignNew")).effect).toEqual({ effectType: null, effectId: null });
    expect(store.markCreated).not.toHaveBeenCalled();

    expect(world.applied).toEqual([]);
    expect(world.attempts.map((item) => item.status)).toEqual(["created", "claimed"]);
    expect(logger.warn).toHaveBeenCalledWith(
      "Cobro automático: evento de una cuenta conectada que no es la del intento; no se aplica",
      expect.objectContaining({ organizationId, attemptId: firstAttemptId, paymentIntentId: "pi_SyntheticForeign" })
    );
  });

  it("bandera de eventos apagada, clave Live o base de producción → sin estado, sin tocar el almacén ni Stripe", async () => {
    const closers: Array<() => void> = [
      () => {
        env.events = false;
      },
      () => {
        env.environment = "live";
      },
      () => {
        env.production = true;
      },
    ];
    for (const close of closers) {
      env.events = true;
      env.environment = "test";
      env.production = false;
      close();
      const { world, store, gateway, event } = setup();
      world.attempts.push(attempt({ status: "created", paymentIntentId: "pi_SyntheticLocked" }));
      world.stripe.set("pi_SyntheticLocked", intent("pi_SyntheticLocked", "succeeded"));

      expect(await event("pi_SyntheticLocked")).toEqual({ effect: { effectType: null, effectId: null }, result: null });
      expect(store.isStorageAvailable).not.toHaveBeenCalled();
      expect(store.findAttemptByPaymentIntent).not.toHaveBeenCalled();
      expect(gateway.retrievePayment).not.toHaveBeenCalled();
    }
  });
});

describe("cobro tardío de un intento cerrado (D10: nunca dos cobros)", () => {
  it("éxito tardío de un intento failed sin otro cobro → succeeded y pago registrado", async () => {
    const { world, gateway, event } = setup();
    world.attempts.push(attempt({ status: "failed", paymentIntentId: "pi_SyntheticLate" }));
    world.failureCode.set(firstAttemptId, "card_declined");
    world.stripe.set("pi_SyntheticLate", intent("pi_SyntheticLate", "succeeded"));

    const outcome = await event("pi_SyntheticLate");

    expect(world.applied).toEqual([
      { attemptId: firstAttemptId, outcome: { kind: "late_succeeded", paymentIntentId: "pi_SyntheticLate", received } },
    ]);
    expect(world.attempts[0]).toMatchObject({ status: "succeeded" });
    expect(world.payments).toEqual([{ attemptId: firstAttemptId, paymentIntentId: "pi_SyntheticLate" }]);
    expect(outcome).toMatchObject({
      effect: { effectType: ATTEMPT_EFFECT_TYPE, effectId: firstAttemptId },
      result: { collected: 1 },
    });
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
  });

  it("intento cerrado cuyo cobro sigue sin cobrarse en Stripe → sin efecto", async () => {
    const { world, event } = setup();
    world.attempts.push(attempt({ status: "failed", paymentIntentId: "pi_SyntheticDeclined" }));
    world.attempts.push(attempt({ id: secondAttemptId, status: "canceled", paymentIntentId: "pi_SyntheticCanceled" }));
    world.stripe.set("pi_SyntheticDeclined", intent("pi_SyntheticDeclined", "requires_payment_method", { code: "card_declined" }));
    world.stripe.set("pi_SyntheticCanceled", intent("pi_SyntheticCanceled", "canceled"));

    expect((await event("pi_SyntheticDeclined")).effect).toEqual({ effectType: null, effectId: null });
    expect((await event("pi_SyntheticCanceled")).effect).toEqual({ effectType: null, effectId: null });
    expect(world.applied).toEqual([]);
    expect(world.attempts.map((item) => item.status)).toEqual(["failed", "canceled"]);
  });

  it("éxito tardío con otro intento ya succeeded → aviso duplicate_collection y un solo pago", async () => {
    const { world, gateway, event } = setup();
    world.attempts.push(attempt({ status: "failed", paymentIntentId: "pi_SyntheticOld" }));
    world.attempts.push(
      attempt({ id: secondAttemptId, attemptNumber: 2, status: "succeeded", paymentIntentId: "pi_SyntheticRetry" })
    );
    world.payments.push({ attemptId: secondAttemptId, paymentIntentId: "pi_SyntheticRetry" });
    world.stripe.set("pi_SyntheticOld", intent("pi_SyntheticOld", "succeeded"));

    const outcome = await event("pi_SyntheticOld");

    expect(world.notices).toEqual([`${firstAttemptId}:${DUPLICATE_COLLECTION_REASON}`]);
    expect(world.payments).toEqual([{ attemptId: secondAttemptId, paymentIntentId: "pi_SyntheticRetry" }]);
    expect(world.attempts[0]).toMatchObject({ status: "failed" });
    expect(outcome.effect).toEqual({ effectType: null, effectId: null });
    expect(outcome.result).toMatchObject({ collected: 0, needsReview: 1, skipped: { duplicate_collection: 1 } });
    // Con la cuota ya cobrada no se cancela nada en Stripe.
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
  });

  it("éxito tardío con un reintento created con su pi_ → cancelPayment fuera de transacción, hermano canceled late_success_elsewhere, un solo pago", async () => {
    const { world, gateway, event } = setup();
    world.attempts.push(attempt({ status: "failed", paymentIntentId: "pi_SyntheticFirst" }));
    world.attempts.push(
      attempt({ id: secondAttemptId, attemptNumber: 2, status: "created", paymentIntentId: "pi_SyntheticSecond" })
    );
    world.stripe.set("pi_SyntheticFirst", intent("pi_SyntheticFirst", "succeeded"));
    world.stripe.set("pi_SyntheticSecond", intent("pi_SyntheticSecond", "requires_confirmation"));

    await event("pi_SyntheticFirst");

    expect(gateway.cancelPayment).toHaveBeenCalledWith({ connectedAccount, paymentIntentId: "pi_SyntheticSecond" });
    expect(world.calls).toEqual([
      "stripe:retrieve:pi_SyntheticFirst",
      "stripe:cancel:pi_SyntheticSecond",
      `apply:canceled:${secondAttemptId}`,
      `apply:late_succeeded:${firstAttemptId}`,
    ]);
    expect(world.stripeCalls.every((call) => !call.inTransaction)).toBe(true);
    expect(world.attempts[1]).toMatchObject({ status: "canceled" });
    expect(world.failureCode.get(secondAttemptId)).toBe(LATE_SUCCESS_ELSEWHERE_CODE);
    expect(world.stripe.get("pi_SyntheticSecond")?.status).toBe("canceled");
    expect(world.attempts[0]).toMatchObject({ status: "succeeded" });
    expect(world.payments).toEqual([{ attemptId: firstAttemptId, paymentIntentId: "pi_SyntheticFirst" }]);
  });

  it("éxito tardío y el hermano ya cobrado al intentar cancelarlo → se registra el hermano y el tardío queda duplicate_collection", async () => {
    const { world, event } = setup();
    world.attempts.push(attempt({ status: "failed", paymentIntentId: "pi_SyntheticFirst" }));
    world.attempts.push(
      attempt({ id: secondAttemptId, attemptNumber: 2, status: "created", paymentIntentId: "pi_SyntheticSecond" })
    );
    world.stripe.set("pi_SyntheticFirst", intent("pi_SyntheticFirst", "succeeded"));
    world.stripe.set("pi_SyntheticSecond", intent("pi_SyntheticSecond", "succeeded"));

    const outcome = await event("pi_SyntheticFirst");

    expect(world.calls).toEqual([
      "stripe:retrieve:pi_SyntheticFirst",
      "stripe:cancel:pi_SyntheticSecond",
      // Stripe ya no deja cancelarlo: se relee y se aplica lo que dice (cobrado).
      "stripe:retrieve:pi_SyntheticSecond",
      `apply:succeeded:${secondAttemptId}`,
      `apply:late_succeeded:${firstAttemptId}`,
    ]);
    expect(world.payments).toEqual([{ attemptId: secondAttemptId, paymentIntentId: "pi_SyntheticSecond" }]);
    expect(world.attempts.map((item) => item.status)).toEqual(["failed", "succeeded"]);
    expect(world.notices).toEqual([`${firstAttemptId}:${DUPLICATE_COLLECTION_REASON}`]);
    expect(outcome.result).toMatchObject({ collected: 1, needsReview: 1, skipped: { duplicate_collection: 1 } });
  });

  it("éxito tardío con un hermano claimed sin pi_ → LATE_SUCCESS_SIBLING_IN_FLIGHT, evento failed y nada registrado", async () => {
    const { world, gateway, event } = setup();
    world.attempts.push(attempt({ status: "failed", paymentIntentId: "pi_SyntheticFirst" }));
    world.attempts.push(attempt({ id: secondAttemptId, attemptNumber: 2, status: "claimed", paymentIntentId: null }));
    world.stripe.set("pi_SyntheticFirst", intent("pi_SyntheticFirst", "succeeded"));

    const failure = await event("pi_SyntheticFirst").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(LATE_SUCCESS_SIBLING_IN_FLIGHT);
    // Lo que el buzón guarda como `last_error` (el evento queda failed y Stripe lo reenvía).
    expect(providerEventErrorCode(failure)).toBe(LATE_SUCCESS_SIBLING_IN_FLIGHT);
    expect(world.applied).toEqual([]);
    expect(world.payments).toEqual([]);
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
    expect(world.attempts.map((item) => item.status)).toEqual(["failed", "claimed"]);

    // El reenvío: el proceso diario ya le guardó su pi_ al hermano → se cancela y se registra el tardío.
    Object.assign(world.attempts[1]!, { status: "created", paymentIntentId: "pi_SyntheticSecond" });
    world.stripe.set("pi_SyntheticSecond", intent("pi_SyntheticSecond", "requires_confirmation"));
    await event("pi_SyntheticFirst", { eventId: "evt_SyntheticEvents0002" });

    expect(world.attempts.map((item) => item.status)).toEqual(["succeeded", "canceled"]);
    expect(world.payments).toEqual([{ attemptId: firstAttemptId, paymentIntentId: "pi_SyntheticFirst" }]);
  });

  it("hermano por domiciliación en el banco (Stripe no deja cancelarlo) → aviso late_success_pending, evento procesado y nada registrado", async () => {
    const { world, gateway, event } = setup();
    world.attempts.push(attempt({ status: "failed", paymentIntentId: "pi_SyntheticFirst" }));
    world.attempts.push(
      attempt({
        id: secondAttemptId,
        attemptNumber: 2,
        status: "processing",
        paymentMethodKind: "sepa_debit",
        paymentIntentId: "pi_SyntheticSepaBank",
      })
    );
    world.stripe.set("pi_SyntheticFirst", intent("pi_SyntheticFirst", "succeeded"));
    world.stripe.set("pi_SyntheticSepaBank", intent("pi_SyntheticSepaBank", "processing"));

    // No lanza: el evento termina procesado, con efecto en el intento tardío.
    const outcome = await event("pi_SyntheticFirst");

    expect(outcome.effect).toEqual({ effectType: ATTEMPT_EFFECT_TYPE, effectId: firstAttemptId });
    expect(world.notices).toEqual([`${firstAttemptId}:${LATE_SUCCESS_PENDING_REASON}`]);
    expect(outcome.result).toMatchObject({ collected: 0, needsReview: 1, skipped: { [LATE_SUCCESS_PENDING_REASON]: 1 } });
    expect(gateway.cancelPayment).toHaveBeenCalledWith({ connectedAccount, paymentIntentId: "pi_SyntheticSepaBank" });
    expect(world.calls).toEqual([
      "stripe:retrieve:pi_SyntheticFirst",
      "stripe:cancel:pi_SyntheticSepaBank",
      "stripe:retrieve:pi_SyntheticSepaBank",
    ]);
    expect(world.applied).toEqual([]);
    expect(world.payments).toEqual([]);
    expect(world.attempts.map((item) => item.status)).toEqual(["failed", "processing"]);
  });

  it("hermano abierto sin referencias legibles → también queda en espera (late_success_pending), sin lanzar", async () => {
    const { world, gateway, event } = setup();
    world.attempts.push(attempt({ status: "failed", paymentIntentId: "pi_SyntheticFirst" }));
    world.attempts.push(
      attempt({ id: secondAttemptId, attemptNumber: 2, status: "created", paymentIntentId: "pi_SyntheticSecond" })
    );
    world.unreadable.add(secondAttemptId);
    world.stripe.set("pi_SyntheticFirst", intent("pi_SyntheticFirst", "succeeded"));
    world.stripe.set("pi_SyntheticSecond", intent("pi_SyntheticSecond", "requires_confirmation"));

    const outcome = await event("pi_SyntheticFirst");

    expect(outcome.effect.effectId).toBe(firstAttemptId);
    expect(world.notices).toEqual([`${firstAttemptId}:${LATE_SUCCESS_PENDING_REASON}`]);
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
    expect(world.applied).toEqual([]);
    expect(world.payments).toEqual([]);
  });

  it("error pasajero de Stripe al cancelar el hermano → el evento falla con su propio código, no LATE_SUCCESS_SIBLING_IN_FLIGHT", async () => {
    const { world, gateway, event } = setup();
    world.attempts.push(attempt({ status: "failed", paymentIntentId: "pi_SyntheticFirst" }));
    world.attempts.push(
      attempt({ id: secondAttemptId, attemptNumber: 2, status: "created", paymentIntentId: "pi_SyntheticSecond" })
    );
    world.stripe.set("pi_SyntheticFirst", intent("pi_SyntheticFirst", "succeeded"));
    world.stripe.set("pi_SyntheticSecond", intent("pi_SyntheticSecond", "requires_confirmation"));
    const busy = Object.assign(new Error("Mensaje sintético de Stripe: bloqueo"), {
      type: "StripeAPIError",
      code: "lock_timeout",
    });
    gateway.cancelPayment.mockRejectedValueOnce(busy);

    const failure = await event("pi_SyntheticFirst").catch((error: unknown) => error);

    expect(failure).toBe(busy);
    // Lo que guarda el buzón como `last_error`: el código real, nunca el mensaje.
    expect(providerEventErrorCode(failure)).toBe("lock_timeout");
    expect(world.applied).toEqual([]);
    expect(world.payments).toEqual([]);
    expect(world.notices).toEqual([]);
    expect(world.attempts.map((item) => item.status)).toEqual(["failed", "created"]);
  });

  it("un hermano que se abre entre la lectura y la transacción → el almacén lo para (LATE_SUCCESS_SIBLING_IN_FLIGHT) sin registrar", async () => {
    const { world, store, event } = setup();
    world.attempts.push(attempt({ status: "failed", paymentIntentId: "pi_SyntheticFirst" }));
    world.attempts.push(
      attempt({ id: secondAttemptId, attemptNumber: 2, status: "created", paymentIntentId: "pi_SyntheticSecond" })
    );
    world.stripe.set("pi_SyntheticFirst", intent("pi_SyntheticFirst", "succeeded"));
    // Las lecturas sin transacción todavía no lo veían.
    vi.mocked(store.listInvoiceSiblings).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(event("pi_SyntheticFirst")).rejects.toThrow(LATE_SUCCESS_SIBLING_IN_FLIGHT);
    expect(world.payments).toEqual([]);
    expect(world.attempts.map((item) => item.status)).toEqual(["failed", "created"]);
  });
});

describe("domiciliación por eventos (D11)", () => {
  it("domiciliación: processing → succeeded por eventos, sin esperar al proceso diario", async () => {
    const { world, store, gateway, event } = setup();
    world.attempts.push(
      attempt({ status: "created", paymentMethodKind: "sepa_debit", paymentIntentId: "pi_SyntheticSepa" })
    );
    world.stripe.set("pi_SyntheticSepa", intent("pi_SyntheticSepa", "processing"));

    const processing = await event("pi_SyntheticSepa");
    expect(world.attempts[0]).toMatchObject({ status: "processing" });
    expect(processing.result).toMatchObject({ processing: 1, collected: 0 });

    // Días después el banco la acepta: el evento `succeeded` la registra.
    world.stripe.set("pi_SyntheticSepa", intent("pi_SyntheticSepa", "succeeded"));
    const collected = await event("pi_SyntheticSepa", { eventId: "evt_SyntheticEvents0002" });

    expect(world.applied.map((item) => item.outcome.kind)).toEqual(["processing", "succeeded"]);
    expect(world.payments).toEqual([{ attemptId: firstAttemptId, paymentIntentId: "pi_SyntheticSepa" }]);
    expect(collected.result).toMatchObject({ collected: 1 });
    // Sin la pasada diaria: ni la lista de en curso ni Stripe para nada más.
    expect(store.listProcessing).not.toHaveBeenCalled();
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
  });

  it("domiciliación rechazada por el banco → failed sin reintento ni cancelación; el aviso a la familia es el de tarjeta sin prometer reintento", async () => {
    const { world, gateway, event } = setup();
    world.attempts.push(
      attempt({ status: "processing", paymentMethodKind: "sepa_debit", paymentIntentId: "pi_SyntheticSepaKo" })
    );
    world.stripe.set(
      "pi_SyntheticSepaKo",
      intent("pi_SyntheticSepaKo", "requires_payment_method", { code: "insufficient_funds" })
    );

    await event("pi_SyntheticSepaKo");

    expect(world.applied).toEqual([
      {
        attemptId: firstAttemptId,
        outcome: {
          kind: "failed",
          paymentIntentId: "pi_SyntheticSepaKo",
          code: "insufficient_funds",
          declineCode: null,
          nextRetryAt: null,
        },
      },
    ]);
    expect(gateway.cancelPayment).not.toHaveBeenCalled();

    // D11: el mismo correo que con tarjeta rechazada, sin promesa de otro intento.
    const kind = familyFailureNoticeKind({
      paymentMethodKind: "sepa_debit",
      failureCode: "insufficient_funds",
      declineCode: null,
      retryScheduled: false,
    });
    expect(kind).toBe("sepa_failed");
    const message = renderFamilyFailureNotice({
      kind,
      academyName: "Academia Sintética",
      servicePeriodStart: "2026-11-01",
      retryDateLocal: "2026-11-21",
      feesUrl: "https://zaltyko.test/familia/cuotas",
    });
    expect(message.text).toContain("No hemos podido cobrar por domiciliación la cuota de noviembre de 2026");
    expect(message.text).toContain("Esta cuota ya no se cobrará sola.");
    expect(message.text).not.toMatch(/volveremos|intentarlo|reintent/i);
  });
});

describe("Stripe nunca dentro de una transacción", () => {
  it("ninguna llamada a Stripe dentro de una transacción", async () => {
    const { world, event } = setup();
    // Un cobro creado justo antes de una caída (intento claimed) y, en otra
    // factura, un cobro tardío con un reintento abierto que hay que cancelar.
    world.attempts.push(attempt({ status: "claimed", paymentIntentId: null }));
    world.stripe.set("pi_SyntheticAdopt", intent("pi_SyntheticAdopt", "requires_payment_method", {
      attemptId: firstAttemptId,
      code: "card_declined",
    }));
    const otherInvoice = "40000000-0000-4000-8000-000000000020";
    world.attempts.push(
      attempt({ id: "40000000-0000-4000-8000-000000000021", invoiceId: otherInvoice, status: "failed", paymentIntentId: "pi_SyntheticOldOne" })
    );
    world.attempts.push(
      attempt({
        id: "40000000-0000-4000-8000-000000000022",
        invoiceId: otherInvoice,
        attemptNumber: 2,
        status: "processing",
        paymentIntentId: "pi_SyntheticNewOne",
      })
    );
    world.stripe.set("pi_SyntheticOldOne", intent("pi_SyntheticOldOne", "succeeded"));
    // El reintento está en curso: Stripe no deja cancelarlo y el tardío queda
    // en espera (late_success_pending). Después el banco lo rechaza: ya se
    // puede cancelar, se cierra y el tardío se registra.
    world.stripe.set("pi_SyntheticNewOne", intent("pi_SyntheticNewOne", "processing"));
    const newOne = world.stripe.get("pi_SyntheticNewOne")!;

    await event("pi_SyntheticAdopt");
    const pending = await event("pi_SyntheticOldOne");
    expect(pending.effect.effectId).toBe("40000000-0000-4000-8000-000000000021");
    Object.assign(newOne, { status: "requires_payment_method", lastErrorCode: "card_declined" });
    await event("pi_SyntheticOldOne", { eventId: "evt_SyntheticEvents0003" });

    // Hubo transacciones y llamadas a Stripe intercaladas, y ninguna llamada con una abierta.
    expect(world.calls.filter((call) => !call.startsWith("stripe:")).length).toBeGreaterThanOrEqual(4);
    expect(world.stripeCalls.length).toBeGreaterThanOrEqual(6);
    expect(world.stripeCalls.filter((call) => call.inTransaction)).toEqual([]);
    expect(world.attempts.map((item) => item.status)).toEqual(["failed", "succeeded", "canceled"]);
    expect(world.failureCode.get("40000000-0000-4000-8000-000000000022")).toBe(LATE_SUCCESS_ELSEWHERE_CODE);
    expect(world.payments).toEqual([
      { attemptId: "40000000-0000-4000-8000-000000000021", paymentIntentId: "pi_SyntheticOldOne" },
    ]);
  });
});
