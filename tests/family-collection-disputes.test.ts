import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático de cuotas (Fase 4, Tarea 7): disputas de tarjeta y
 * devoluciones del banco en domiciliación. La tabla de efectos
 * (disputeEffect), las etiquetas de la cuota nueva, la lectura en Stripe y el
 * manejador de `charge.dispute.*` con el almacén y Stripe simulados. También
 * el pendiente de la Tarea 6: al registrar tarde un cobro se anotan las
 * devoluciones que Stripe ya hizo de él. El libro real (filas, cuota nueva,
 * idempotencia, orden de los eventos) lo prueba
 * tests/family-collection-events-pg.test.ts. Solo datos sintéticos y fechas
 * fijas: nunca llama a Stripe ni a la base ni depende del reloj.
 */

const env = vi.hoisted(() => ({
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
  isFamilyAutomaticCollectionFlagEnabled: () => false,
  isFamilyAutomaticSepaCollectionFlagEnabled: () => false,
  isFamilyCollectionEventsFlagEnabled: () => env.events,
  resolveConnectEnvironment: () => env.environment,
  isProductionDatabase: () => env.production,
}));
vi.mock("@/modules/family-collection/infrastructure/family-collection-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/family-collection/infrastructure/family-collection-store")>()),
  createFamilyCollectionStore: vi.fn(() => {
    throw new Error("El almacén real no debe usarse en tests");
  }),
  createFamilyCollectionRefundStore: vi.fn(() => {
    throw new Error("El almacén real no debe usarse en tests");
  }),
}));
vi.mock("@/modules/family-collection/infrastructure/family-collection-dispute-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/family-collection/infrastructure/family-collection-dispute-store")>()),
  createFamilyCollectionDisputeStore: vi.fn(() => {
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
  DEFAULT_PROVIDER_EVENT_HANDLERS,
  handleDisputeEvent,
  processPaymentIntentEvent,
} from "@/modules/family-collection/application/family-collection-events";
import {
  DISPUTE_EFFECT_TYPE,
  DISPUTE_REVIEW_EFFECT_TYPE,
  processDisputeEvent,
  type DisputeEventInput,
} from "@/modules/family-collection/application/family-collection-disputes";
import type { FamilyCollectionDeps } from "@/modules/family-collection/application/family-collection-service";
import {
  DISPUTE_UNALLOCATED_REASON,
  disputeEffect,
  disputeReversalReason,
  RETURNED_FEE_LINE_TYPE,
  returnedFeeInvoiceKey,
  returnedFeeLabel,
} from "@/modules/family-collection/domain/dispute-effect";
import { feeLabel, feePeriodLabel } from "@/modules/family-collection/domain/family-failure-notice";
import type { PaymentIntentSnapshot } from "@/modules/family-collection/domain/payment-outcome";
import type {
  DisputeApplyInput,
  DisputeApplyResult,
  FamilyCollectionDisputeStore,
} from "@/modules/family-collection/infrastructure/family-collection-dispute-store";
import {
  DUPLICATE_COLLECTION_REASON,
  type ApplyOutcomeResult,
  type AttemptStripeRefs,
  type CollectionAttempt,
  type FamilyCollectionRefundStore,
  type FamilyCollectionStore,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  createStripeDisputeGateway,
  createStripeRefundGateway,
  type ChargeRefundsSnapshot,
  type DisputeSnapshot,
  type FamilyCollectionDisputeGateway,
  type FamilyCollectionGateway,
  type FamilyCollectionRefundGateway,
} from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import type { StoredConnectAccount } from "@/modules/payments-connect/infrastructure/connect-account-store";

const organizationId = "47000000-0000-4000-8000-000000000001";
const locationId = "47000000-0000-4000-8000-000000000002";
const familyId = "47000000-0000-4000-8000-000000000003";
const familyPayerId = "47000000-0000-4000-8000-000000000004";
const accountRowId = "47000000-0000-4000-8000-000000000005";
const otherAccountRowId = "47000000-0000-4000-8000-000000000006";
const invoiceId = "47000000-0000-4000-8000-000000000007";
const attemptId = "47000000-0000-4000-8000-000000000008";
const siblingId = "47000000-0000-4000-8000-000000000009";
const disputeRowId = "47000000-0000-4000-8000-000000000010";
const inboxId = "47000000-0000-4000-8000-000000000011";
const connectedAccount = "acct_SyntheticDisputes1";
const paymentIntentId = "pi_SyntheticDisputed";
const chargeRef = "ch_SyntheticDisputed";
const disputeRef = "dp_SyntheticDispute1";
/** Hora fija del evento: nada depende del reloj. */
const now = new Date("2026-12-10T10:00:00.000Z");
const claimedAt = new Date("2026-12-01T08:00:00.000Z");
const evidenceDueAt = new Date("2026-12-24T22:59:59.000Z");
const openedAt = new Date("2026-12-09T09:00:00.000Z");

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
    id: attemptId,
    organizationId,
    locationId,
    invoiceId,
    familyId,
    familyPayerId,
    authorizationId: null,
    paymentProviderAccountId: accountRowId,
    attemptNumber: 1,
    paymentMethodKind: "card",
    amountCents: 4500,
    currency: "EUR",
    status: "succeeded",
    paymentIntentId,
    resumeCount: 0,
    claimedAt,
    ...overrides,
  };
}

function dispute(overrides: Partial<DisputeSnapshot> = {}): DisputeSnapshot {
  return {
    id: disputeRef,
    chargeId: chargeRef,
    paymentIntentId,
    status: "needs_response",
    reasonCode: "fraudulent",
    amountCents: 4500,
    currency: "EUR",
    evidenceDueAt,
    fundsWithdrawn: true,
    paymentMethodKind: "card",
    createdAt: openedAt,
    ...overrides,
  };
}

function input(overrides: Partial<DisputeEventInput> = {}): DisputeEventInput {
  return {
    organizationId,
    account,
    objectId: disputeRef,
    now,
    inboxId,
    eventId: "evt_SyntheticDispute1",
    ...overrides,
  };
}

/** Stripe simulado: la disputa (se puede cambiar entre entregas). */
function fakeDisputeGateway(initial: DisputeSnapshot | null) {
  const state = { dispute: initial };
  const gateway = {
    retrieveDispute: vi.fn<FamilyCollectionDisputeGateway["retrieveDispute"]>(async (request) => {
      if (request.connectedAccount !== connectedAccount || request.disputeId !== disputeRef) {
        throw Object.assign(new Error("CI: disputa inexistente"), { type: "StripeInvalidRequestError", code: "resource_missing" });
      }
      return state.dispute ? { ...state.dispute } : null;
    }),
  };
  return { gateway, state };
}

/** Almacén simulado: el intento (su estado se puede cambiar) y lo que se le pide. */
function fakeDisputeStore(options: { attempt?: CollectionAttempt | null; result?: DisputeApplyResult } = {}) {
  const state = { attempt: options.attempt === undefined ? attempt() : options.attempt };
  const store = {
    isStorageAvailable: vi.fn<FamilyCollectionDisputeStore["isStorageAvailable"]>(async () => true),
    findAttemptByPaymentIntent: vi.fn<FamilyCollectionDisputeStore["findAttemptByPaymentIntent"]>(async (request) =>
      state.attempt && request.paymentIntentId === state.attempt.paymentIntentId && request.organizationId === organizationId
        ? { ...state.attempt }
        : null
    ),
    upsertDisputeAndApply: vi.fn<FamilyCollectionDisputeStore["upsertDisputeAndApply"]>(
      async (): Promise<DisputeApplyResult> =>
        options.result ?? {
          outcome: "applied",
          disputeId: disputeRowId,
          effect: "track",
          reversed: false,
          review: null,
          refundIds: [],
          returnedInvoiceId: null,
        }
    ),
    recordDisputeNotice: vi.fn<FamilyCollectionDisputeStore["recordDisputeNotice"]>(async () => true),
  };
  return { store, state };
}

beforeEach(() => {
  env.events = true;
  env.environment = "test";
  env.production = false;
  vi.mocked(logger.warn).mockClear();
  vi.mocked(logger.error).mockClear();
});

describe("disputeEffect", () => {
  it("disputeEffect: tabla de estados por tarjeta y domiciliación", () => {
    const table: Array<[string, "card" | "sepa_debit" | null, boolean, "track" | "reverse" | "close"]> = [
      // Tarjeta: abierta → track; perdida → reverse; ganada, cerrada como aviso o evitada → close.
      ["warning_needs_response", "card", false, "track"],
      ["warning_under_review", "card", false, "track"],
      ["needs_response", "card", false, "track"],
      ["under_review", "card", false, "track"],
      ["lost", "card", false, "reverse"],
      ["won", "card", false, "close"],
      ["warning_closed", "card", false, "close"],
      ["prevented", "card", false, "close"],
      // Domiciliación: no se puede recurrir; cualquier estado no ganado → reverse.
      ["needs_response", "sepa_debit", false, "reverse"],
      ["under_review", "sepa_debit", false, "reverse"],
      ["warning_needs_response", "sepa_debit", false, "reverse"],
      ["lost", "sepa_debit", false, "reverse"],
      ["won", "sepa_debit", false, "close"],
      ["warning_closed", "sepa_debit", false, "close"],
      ["prevented", "sepa_debit", false, "close"],
      // Forma de pago desconocida: como tarjeta.
      ["needs_response", null, false, "track"],
      ["lost", null, false, "reverse"],
      // Ya revertida: nunca reverse otra vez.
      ["lost", "card", true, "close"],
      ["lost", "sepa_debit", true, "close"],
      ["needs_response", "sepa_debit", true, "track"],
      ["under_review", "card", true, "track"],
      ["won", "card", true, "close"],
      ["won", "sepa_debit", true, "close"],
    ];
    for (const [status, paymentMethodKind, alreadyReversed, expected] of table) {
      expect(disputeEffect({ status, paymentMethodKind, alreadyReversed }), `${status} ${paymentMethodKind} ${alreadyReversed}`).toBe(
        expected
      );
    }
  });

  it("motivo de las filas: sepa_returned en domiciliación, dispute_lost en tarjeta", () => {
    expect(disputeReversalReason("sepa_debit")).toBe("sepa_returned");
    expect(disputeReversalReason("card")).toBe("dispute_lost");
    expect(disputeReversalReason(null)).toBe("dispute_lost");
  });

  it("C16: etiqueta común del mes y la de la cuota nueva; feeLabel no cambia", () => {
    expect(feePeriodLabel("2026-11-01")).toBe("Cuota de noviembre de 2026");
    expect(feePeriodLabel("2027-02-01")).toBe("Cuota de febrero de 2027");
    expect(feePeriodLabel(null)).toBeNull();
    expect(feePeriodLabel("2026-13-01")).toBeNull();
    expect(feeLabel("2026-11-01")).toBe("la cuota de noviembre de 2026");
    expect(feeLabel(null)).toBe("tu cuota");
    expect(returnedFeeLabel("2026-11-01")).toBe("Cuota de noviembre de 2026 · devuelta por el banco");
    expect(returnedFeeLabel(null)).toBe("Cuota · devuelta por el banco");
    expect(returnedFeeInvoiceKey("du_SyntheticReturn1")).toBe("family-collection-return:du_SyntheticReturn1");
    expect(RETURNED_FEE_LINE_TYPE).toBe("returned_fee");
  });
});

describe("manejador de charge.dispute.*", () => {
  it("es el manejador por defecto de la ruta", () => {
    expect(DEFAULT_PROVIDER_EVENT_HANDLERS.dispute).toBe(handleDisputeEvent);
  });

  it("disputa de tarjeta abierta → se relee en la cuenta y se guarda con la forma de pago, el buzón y la hora del evento", async () => {
    const { gateway } = fakeDisputeGateway(dispute());
    const { store } = fakeDisputeStore();

    const effect = await processDisputeEvent(input(), { store, gateway });

    expect(effect).toEqual({ effectType: DISPUTE_EFFECT_TYPE, effectId: disputeRowId });
    expect(gateway.retrieveDispute).toHaveBeenCalledWith({ connectedAccount, disputeId: disputeRef });
    expect(store.upsertDisputeAndApply).toHaveBeenCalledTimes(1);
    expect(store.upsertDisputeAndApply).toHaveBeenCalledWith({
      organizationId,
      attemptId,
      paymentIntentId,
      dispute: dispute(),
      paymentMethodKind: "card",
      providerEventInboxId: inboxId,
      environment: "test",
      now,
    } satisfies DisputeApplyInput);
    expect(store.recordDisputeNotice).not.toHaveBeenCalled();
  });

  it("forma de pago: la del cargo según Stripe; si no la da, la del intento", async () => {
    const { gateway } = fakeDisputeGateway(dispute({ paymentMethodKind: null, chargeId: "py_SyntheticDisputed" }));
    const { store } = fakeDisputeStore({ attempt: attempt({ paymentMethodKind: "sepa_debit" }) });

    await processDisputeEvent(input(), { store, gateway });

    expect(store.upsertDisputeAndApply.mock.calls[0]?.[0]).toMatchObject({ paymentMethodKind: "sepa_debit" });
  });

  it("cobro que el libro todavía no tiene → se registra antes por el camino de los cobros y después se guarda la disputa", async () => {
    const { gateway } = fakeDisputeGateway(dispute({ status: "lost" }));
    const { store, state } = fakeDisputeStore({ attempt: attempt({ status: "failed" }) });
    const recordCollection = vi.fn(async (request: DisputeEventInput) => {
      // El camino de los cobros registra el tardío.
      expect(request).toEqual(input({ objectId: paymentIntentId }));
      state.attempt = attempt({ status: "succeeded" });
    });

    const effect = await processDisputeEvent(input(), { store, gateway, recordCollection });

    expect(recordCollection).toHaveBeenCalledTimes(1);
    expect(store.upsertDisputeAndApply).toHaveBeenCalledTimes(1);
    expect(effect).toEqual({ effectType: DISPUTE_EFFECT_TYPE, effectId: disputeRowId });
  });

  it("cobro que sigue sin estar en el libro (p. ej. el cobro doble de D10) → aviso dispute_unallocated, nada guardado, evento procesado", async () => {
    const { gateway } = fakeDisputeGateway(dispute({ status: "lost" }));
    const { store } = fakeDisputeStore({ attempt: attempt({ status: "failed" }) });
    const recordCollection = vi.fn(async () => undefined);

    const effect = await processDisputeEvent(input(), { store, gateway, recordCollection });

    expect(effect).toEqual({ effectType: DISPUTE_REVIEW_EFFECT_TYPE, effectId: attemptId });
    expect(store.upsertDisputeAndApply).not.toHaveBeenCalled();
    expect(store.recordDisputeNotice).toHaveBeenCalledWith({
      attempt: attempt({ status: "failed" }),
      reason: DISPUTE_UNALLOCATED_REASON,
      disputeId: disputeRef,
      amountCents: 4500,
      currency: "EUR",
      now,
    });
  });

  it("moneda distinta a la del pago o intento ya no cobrado al bloquear → aviso dispute_unallocated sin fila", async () => {
    for (const outcome of ["currency_mismatch", "not_collected"] as const) {
      const { gateway } = fakeDisputeGateway(dispute());
      const { store } = fakeDisputeStore({ result: { outcome } });
      const effect = await processDisputeEvent(input(), { store, gateway });
      expect(effect, outcome).toEqual({ effectType: DISPUTE_REVIEW_EFFECT_TYPE, effectId: attemptId });
      expect(store.recordDisputeNotice, outcome).toHaveBeenCalledTimes(1);
    }
  });

  it("sin intento, de otra cuenta, sin pi_, con un estado desconocido o con otra referencia → sin efecto y sin escribir", async () => {
    const cases: Array<[string, DisputeSnapshot | null, CollectionAttempt | null]> = [
      ["sin intento", dispute(), null],
      ["otra cuenta", dispute(), attempt({ paymentProviderAccountId: otherAccountRowId })],
      ["sin pi_", dispute({ paymentIntentId: null }), attempt()],
      ["estado desconocido", dispute({ status: "charge_refunded" }), attempt()],
      ["cargo con otro formato", dispute({ chargeId: "pi_NotACharge" }), attempt()],
      ["otra disputa", dispute({ id: "dp_SyntheticOther" }), attempt()],
      ["sin forma", null, attempt()],
    ];
    for (const [name, snapshot, found] of cases) {
      const { gateway } = fakeDisputeGateway(snapshot);
      const { store } = fakeDisputeStore({ attempt: found });
      expect(await processDisputeEvent(input(), { store, gateway }), name).toEqual({ effectType: null, effectId: null });
      expect(store.upsertDisputeAndApply, name).not.toHaveBeenCalled();
      expect(store.recordDisputeNotice, name).not.toHaveBeenCalled();
    }
  });

  it("Stripe: error permanente → sin efecto y solo ids en el registro; pasajero → sube (Stripe reenvía)", async () => {
    const { store } = fakeDisputeStore();
    const permanent = {
      retrieveDispute: vi.fn(async () => {
        throw Object.assign(new Error("Mensaje sintético con Ana Prueba"), {
          type: "StripeInvalidRequestError",
          code: "resource_missing",
        });
      }),
    };
    expect(await processDisputeEvent(input(), { store, gateway: permanent })).toEqual({ effectType: null, effectId: null });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("Ana Prueba");

    const transient = {
      retrieveDispute: vi.fn(async () => {
        throw Object.assign(new Error("red"), { type: "StripeConnectionError" });
      }),
    };
    await expect(processDisputeEvent(input(), { store, gateway: transient })).rejects.toThrow("red");
    expect(store.upsertDisputeAndApply).not.toHaveBeenCalled();
  });

  it("cerrojos: bandera de eventos apagada, clave Live o base de producción → sin leer Stripe ni tocar el almacén", async () => {
    for (const close of [
      () => (env.events = false),
      () => (env.environment = "live"),
      () => (env.production = true),
    ]) {
      env.events = true;
      env.environment = "test";
      env.production = false;
      close();
      const { gateway } = fakeDisputeGateway(dispute());
      const { store } = fakeDisputeStore();
      expect(await processDisputeEvent(input(), { store, gateway })).toEqual({ effectType: null, effectId: null });
      expect(gateway.retrieveDispute).not.toHaveBeenCalled();
      expect(store.isStorageAvailable).not.toHaveBeenCalled();
    }
  });

  it("funds_withdrawn y funds_reinstated releen la disputa y no escriben de más", async () => {
    // Los dos eventos solo son avisos: se relee y se guarda lo que diga Stripe, una vez por entrega.
    const { gateway, state } = fakeDisputeGateway(dispute({ fundsWithdrawn: true }));
    const { store } = fakeDisputeStore();

    await processDisputeEvent(input({ eventId: "evt_SyntheticWithdrawn" }), { store, gateway });
    state.dispute = dispute({ status: "won", fundsWithdrawn: false, evidenceDueAt: null });
    await processDisputeEvent(input({ eventId: "evt_SyntheticReinstated" }), { store, gateway });

    expect(gateway.retrieveDispute).toHaveBeenCalledTimes(2);
    expect(store.upsertDisputeAndApply).toHaveBeenCalledTimes(2);
    expect(store.upsertDisputeAndApply.mock.calls.map(([call]) => [call.dispute.status, call.dispute.fundsWithdrawn])).toEqual([
      ["needs_response", true],
      ["won", false],
    ]);
    expect(store.recordDisputeNotice).not.toHaveBeenCalled();
  });
});

describe("createStripeDisputeGateway", () => {
  function fakeStripe(dispute: Record<string, unknown>) {
    const retrieve = vi.fn(async () => dispute);
    return { client: { disputes: { retrieve } } as unknown as Stripe, retrieve };
  }

  const stripeDispute = (overrides: Record<string, unknown> = {}) => ({
    id: disputeRef,
    object: "dispute",
    amount: 4500,
    currency: "eur",
    status: "needs_response",
    reason: "fraudulent",
    created: 1_796_806_800,
    evidence_details: { due_by: 1_798_153_199 },
    payment_intent: paymentIntentId,
    // Stripe retira el importe y la comisión de la disputa (dos movimientos negativos).
    balance_transactions: [{ amount: -4500 }, { amount: -1500 }],
    charge: { id: chargeRef, object: "charge", payment_intent: paymentIntentId, payment_method_details: { type: "card" } },
    ...overrides,
  });

  it("relee la disputa con su cargo en la cuenta conectada; solo ids, estado, importes, fechas y códigos", async () => {
    const { client, retrieve } = fakeStripe(stripeDispute());

    const snapshot = await createStripeDisputeGateway(client).retrieveDispute({ connectedAccount, disputeId: disputeRef });

    expect(retrieve).toHaveBeenCalledWith(disputeRef, { expand: ["charge"] }, { stripeAccount: connectedAccount });
    expect(snapshot).toEqual({
      id: disputeRef,
      chargeId: chargeRef,
      paymentIntentId,
      status: "needs_response",
      reasonCode: "fraudulent",
      amountCents: 4500,
      currency: "EUR",
      evidenceDueAt: new Date(1_798_153_199 * 1000),
      fundsWithdrawn: true,
      paymentMethodKind: "card",
      createdAt: new Date(1_796_806_800 * 1000),
    });
  });

  it("domiciliación con el dinero devuelto a la academia: py_, sepa_debit y fundsWithdrawn false", async () => {
    const { client } = fakeStripe(
      stripeDispute({
        id: "du_SyntheticReturn1",
        status: "won",
        payment_intent: null,
        evidence_details: { due_by: null },
        balance_transactions: [{ amount: -4500 }, { amount: 4500 }],
        charge: { id: "py_SyntheticReturn1", object: "charge", payment_intent: { id: paymentIntentId }, payment_method_details: { type: "sepa_debit" } },
      })
    );

    const snapshot = await createStripeDisputeGateway(client).retrieveDispute({
      connectedAccount,
      disputeId: "du_SyntheticReturn1",
    });

    expect(snapshot).toMatchObject({
      id: "du_SyntheticReturn1",
      chargeId: "py_SyntheticReturn1",
      paymentIntentId,
      evidenceDueAt: null,
      fundsWithdrawn: false,
      paymentMethodKind: "sepa_debit",
    });
  });

  it("sin cargo, sin importe, con otro id o con un motivo que no es un código → null o motivo null", async () => {
    for (const broken of [{ charge: null }, { amount: 0 }, { created: null }]) {
      const { client } = fakeStripe(stripeDispute(broken));
      expect(
        await createStripeDisputeGateway(client).retrieveDispute({ connectedAccount, disputeId: disputeRef }),
        JSON.stringify(broken)
      ).toBeNull();
    }
    const other = fakeStripe(stripeDispute({ id: "dp_SyntheticOther" }));
    expect(await createStripeDisputeGateway(other.client).retrieveDispute({ connectedAccount, disputeId: disputeRef })).toBeNull();
    const text = fakeStripe(stripeDispute({ reason: "Texto libre del banco", charge: chargeRef }));
    expect(
      await createStripeDisputeGateway(text.client).retrieveDispute({ connectedAccount, disputeId: disputeRef })
    ).toMatchObject({ reasonCode: null, paymentMethodKind: null, chargeId: chargeRef });
  });
});

describe("createStripeRefundGateway.retrievePaymentIntentRefunds", () => {
  it("relee el último cargo del cobro y sus devoluciones; sin cargo, null", async () => {
    const autoPagingToArray = vi.fn(async () => [
      { id: "re_SyntheticLate1", status: "succeeded", amount: 2000, currency: "eur", reason: null, created: 1_796_806_800, charge: chargeRef },
    ]);
    const paymentIntentsRetrieve = vi.fn(async () => ({ id: paymentIntentId, latest_charge: chargeRef }));
    const client = {
      paymentIntents: { retrieve: paymentIntentsRetrieve },
      charges: { retrieve: vi.fn(async () => ({ id: chargeRef, payment_intent: paymentIntentId })) },
      refunds: { list: vi.fn(() => ({ autoPagingToArray })) },
    } as unknown as Stripe;

    const snapshot = await createStripeRefundGateway(client).retrievePaymentIntentRefunds({ connectedAccount, paymentIntentId });

    expect(paymentIntentsRetrieve).toHaveBeenCalledWith(paymentIntentId, {}, { stripeAccount: connectedAccount });
    expect(snapshot).toEqual({
      chargeId: chargeRef,
      paymentIntentId,
      refunds: [
        {
          id: "re_SyntheticLate1",
          status: "succeeded",
          amountCents: 2000,
          currency: "EUR",
          reasonCode: null,
          createdAt: new Date(1_796_806_800 * 1000),
        },
      ],
    });

    const noCharge = {
      paymentIntents: { retrieve: vi.fn(async () => ({ id: paymentIntentId, latest_charge: null })) },
    } as unknown as Stripe;
    expect(await createStripeRefundGateway(noCharge).retrievePaymentIntentRefunds({ connectedAccount, paymentIntentId })).toBeNull();
  });
});

describe("Tarea 6, pendiente 1: devoluciones de un cobro registrado tarde", () => {
  const lateRefund = {
    id: "re_SyntheticWhileWaiting",
    status: "succeeded",
    amountCents: 2000,
    currency: "EUR",
    reasonCode: "requested_by_customer",
    createdAt: new Date("2026-12-05T09:00:00.000Z"),
  };

  function intent(id: string, status: string): PaymentIntentSnapshot {
    return {
      id,
      status,
      lastErrorCode: null,
      lastDeclineCode: null,
      amountReceivedCents: status === "succeeded" ? 4500 : 0,
      currency: "EUR",
      attemptIdFromMetadata: null,
    };
  }

  /**
   * Un intento cerrado (`failed`) cuyo cobro Stripe completó tarde y, si se
   * pide, un hermano `created` que Stripe ya cobró (el cobro doble de D10).
   * El almacén sigue el contrato de applyOutcome (late_succeeded incluido).
   */
  function world(options: { sibling?: boolean; refundReadFails?: boolean } = {}) {
    const attempts: CollectionAttempt[] = [attempt({ status: "failed", paymentIntentId: "pi_SyntheticLate" })];
    if (options.sibling) {
      attempts.push(attempt({ id: siblingId, attemptNumber: 2, status: "created", paymentIntentId: "pi_SyntheticSibling" }));
    }
    const stripe = new Map<string, PaymentIntentSnapshot>([
      ["pi_SyntheticLate", intent("pi_SyntheticLate", "succeeded")],
      ["pi_SyntheticSibling", intent("pi_SyntheticSibling", "succeeded")],
    ]);
    const find = (id: string) => attempts.find((item) => item.id === id);
    const refs: AttemptStripeRefs = {
      connectedAccount,
      customer: "cus_SyntheticDisputes",
      paymentMethod: "pm_SyntheticCard",
      mandate: null,
      timezone: "Europe/Madrid",
      servicePeriodStart: "2026-12-01",
      firstAttemptClaimedAt: claimedAt,
      allocations: [],
      windowAnchorLocalDate: null,
    };
    const store = {
      isStorageAvailable: vi.fn(async () => true),
      isEventsStorageAvailable: vi.fn(async () => true),
      findAttemptByPaymentIntent: vi.fn(async (request: { paymentIntentId: string }) => {
        const found = attempts.find((item) => item.paymentIntentId === request.paymentIntentId);
        return found ? { ...found } : null;
      }),
      findClaimedAttemptById: vi.fn(async () => null),
      listInvoiceSiblings: vi.fn(async (request: { excludeAttemptId: string | null }) =>
        attempts.filter((item) => item.id !== request.excludeAttemptId).map((item) => ({ ...item }))
      ),
      loadAttemptRefs: vi.fn(async () => refs),
      recordNotice: vi.fn(async () => true),
      applyOutcome: vi.fn(async (request: { attemptId: string; outcome: { kind: string } }): Promise<ApplyOutcomeResult> => {
        const found = find(request.attemptId);
        if (!found) return { applied: false };
        if (request.outcome.kind === "late_succeeded") {
          if (attempts.some((item) => item.id !== found.id && item.status === "succeeded")) {
            return { applied: false, review: DUPLICATE_COLLECTION_REASON };
          }
          found.status = "succeeded";
          return { applied: true, status: "succeeded", allocationStatus: "allocated", reviewReasons: [] };
        }
        if (request.outcome.kind === "succeeded" && found.status === "created") {
          found.status = "succeeded";
          return { applied: true, status: "succeeded", allocationStatus: "allocated", reviewReasons: [] };
        }
        return { applied: false };
      }),
    } as unknown as FamilyCollectionStore;
    const gateway = {
      retrievePayment: vi.fn<FamilyCollectionGateway["retrievePayment"]>(async (request) => {
        const found = stripe.get(request.paymentIntentId);
        if (!found) throw Object.assign(new Error("CI"), { code: "resource_missing" });
        return { ...found };
      }),
      cancelPayment: vi.fn<FamilyCollectionGateway["cancelPayment"]>(async () => "not_cancelable"),
      createPayment: vi.fn<FamilyCollectionGateway["createPayment"]>(async () => {
        throw new Error("Un evento nunca crea un cobro");
      }),
      confirmPayment: vi.fn<FamilyCollectionGateway["confirmPayment"]>(async () => {
        throw new Error("Un evento nunca confirma un cobro");
      }),
      findPaymentByAttempt: vi.fn<FamilyCollectionGateway["findPaymentByAttempt"]>(async () => null),
    };
    const refundGateway = {
      retrieveChargeRefunds: vi.fn<FamilyCollectionRefundGateway["retrieveChargeRefunds"]>(async () => {
        throw new Error("No se usa");
      }),
      retrieveRefundCharge: vi.fn<FamilyCollectionRefundGateway["retrieveRefundCharge"]>(async () => null),
      retrievePaymentIntentRefunds: vi.fn<FamilyCollectionRefundGateway["retrievePaymentIntentRefunds"]>(
        async (request): Promise<ChargeRefundsSnapshot | null> => {
          if (options.refundReadFails) throw Object.assign(new Error("red"), { type: "StripeConnectionError" });
          return { chargeId: `ch_${request.paymentIntentId.slice(3)}`, paymentIntentId: request.paymentIntentId, refunds: [lateRefund] };
        }
      ),
    };
    const recorded: string[] = [];
    const refundStore = {
      isStorageAvailable: vi.fn<FamilyCollectionRefundStore["isStorageAvailable"]>(async () => true),
      findAttemptByPaymentIntent: vi.fn<FamilyCollectionRefundStore["findAttemptByPaymentIntent"]>(async (request) => {
        const found = attempts.find((item) => item.paymentIntentId === request.paymentIntentId);
        return found ? { ...found } : null;
      }),
      isRefundRecorded: vi.fn<FamilyCollectionRefundStore["isRefundRecorded"]>(async () => false),
      recordAttemptRefunds: vi.fn<FamilyCollectionRefundStore["recordAttemptRefunds"]>(async (request) => {
        recorded.push(`${request.attemptId}:${request.refund.id}`);
        return { outcome: "recorded", refundIds: ["47000000-0000-4000-8000-000000000099"], paymentStatus: "partially_refunded" };
      }),
      recordRefundNotice: vi.fn<FamilyCollectionRefundStore["recordRefundNotice"]>(async () => true),
    };
    const event = (deps: Pick<FamilyCollectionDeps, "refundStore" | "refundGateway">) =>
      processPaymentIntentEvent(
        {
          organizationId,
          account,
          objectId: "pi_SyntheticLate",
          now,
          inboxId,
          eventId: "evt_SyntheticLate1",
        },
        { store, gateway, refreshAccount: vi.fn(), ...deps }
      );
    return { attempts, refundGateway, refundStore, recorded, event };
  }

  it("cobro tardío en espera que la academia devolvió → al registrarse se relee y se anota la devolución (sin evento propio)", async () => {
    const { refundGateway, refundStore, recorded, event, attempts } = world();

    const outcome = await event({ refundGateway, refundStore });

    expect(attempts[0]?.status).toBe("succeeded");
    expect(outcome.result).toMatchObject({ collected: 1 });
    expect(refundGateway.retrievePaymentIntentRefunds).toHaveBeenCalledWith({
      connectedAccount,
      paymentIntentId: "pi_SyntheticLate",
    });
    expect(refundStore.recordAttemptRefunds).toHaveBeenCalledWith({
      organizationId,
      attemptId,
      paymentIntentId: "pi_SyntheticLate",
      refund: {
        id: lateRefund.id,
        amountCents: 2000,
        currency: "EUR",
        reasonCode: "requested_by_customer",
        refundedAt: lateRefund.createdAt,
      },
      providerEventId: null,
      environment: "test",
      now,
    });
    expect(recorded).toEqual([`${attemptId}:${lateRefund.id}`]);
  });

  it("cobro doble de D10: el hermano que Stripe ya cobró se registra con sus devoluciones; el tardío queda duplicate_collection sin leer nada más", async () => {
    const { refundGateway, refundStore, recorded, event, attempts } = world({ sibling: true });

    await event({ refundGateway, refundStore });

    expect(attempts.map((item) => [item.id, item.status])).toEqual([
      [attemptId, "failed"],
      [siblingId, "succeeded"],
    ]);
    expect(refundGateway.retrievePaymentIntentRefunds.mock.calls.map(([call]) => call.paymentIntentId)).toEqual([
      "pi_SyntheticSibling",
    ]);
    expect(recorded).toEqual([`${siblingId}:${lateRefund.id}`]);
  });

  it("Stripe no deja leer las devoluciones → el cobro queda registrado, el evento no falla y queda en el registro (solo ids)", async () => {
    const { refundGateway, refundStore, event, attempts } = world({ refundReadFails: true });

    const outcome = await event({ refundGateway, refundStore });

    expect(attempts[0]?.status).toBe("succeeded");
    expect(outcome.result?.skipped).toMatchObject({ late_refunds_unread: 1 });
    expect(refundStore.recordAttemptRefunds).not.toHaveBeenCalled();
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      "Cobro automático: no se pudieron anotar las devoluciones de un cobro registrado tarde",
      undefined,
      expect.objectContaining({ attemptId, errorName: "StripeConnectionError" })
    );
  });

  it("con una pasarela simulada y sin devoluciones simuladas no se lee nada (nunca se mezcla con el Stripe real)", async () => {
    const { refundGateway, event, attempts } = world();

    await event({});

    expect(attempts[0]?.status).toBe("succeeded");
    expect(refundGateway.retrievePaymentIntentRefunds).not.toHaveBeenCalled();
  });
});
