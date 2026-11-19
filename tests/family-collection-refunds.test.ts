import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático de cuotas (Fase 4, Tarea 6): devoluciones hechas desde el
 * panel de Stripe de la academia (D5). El reparto (splitRefund), las claves de
 * cada fila, el manejador de `charge.refunded` y `refund.*` con el almacén y
 * Stripe simulados, y la lectura en Stripe. La cuota sigue pagada (D1): aquí
 * nunca se toca una cuota ni un pago; el libro real lo prueban
 * tests/family-collection-events-pg.test.ts y tests/family-collection-ledger.test.ts.
 * Solo datos sintéticos y fechas fijas: nunca llama a Stripe ni a la base ni
 * depende del reloj.
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
vi.mock("@/modules/payments-connect/application/connect-onboarding-service", () => ({
  refreshConnectAccountForCollection: vi.fn(),
}));

import { logger } from "@/lib/logger";
import {
  DEFAULT_PROVIDER_EVENT_HANDLERS,
  handleChargeRefundEvent,
  handleRefundEvent,
} from "@/modules/family-collection/application/family-collection-events";
import {
  processChargeRefundEvent,
  processRefundEvent,
  REFUND_BEFORE_COLLECTION_RECORDED,
  REFUND_EFFECT_TYPE,
  REFUND_REVIEW_EFFECT_TYPE,
  type RefundEventInput,
} from "@/modules/family-collection/application/family-collection-refunds";
import {
  providerRefundIdempotencyKey,
  providerRefundReference,
  REFUND_DOES_NOT_FIT,
  REFUND_REVERSED_REASON,
  REFUND_UNALLOCATED_REASON,
  RefundDoesNotFitError,
  refundReasonCode,
  splitRefund,
} from "@/modules/family-collection/domain/refund-split";
import {
  needsReviewKey,
  type CollectionAttempt,
  type FamilyCollectionRefundStore,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  createStripeRefundGateway,
  TOO_MANY_REFUNDS_FOR_CHARGE_ERROR,
  type ChargeRefundSnapshot,
  type ChargeRefundsSnapshot,
  type FamilyCollectionRefundGateway,
} from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import type { StoredConnectAccount } from "@/modules/payments-connect/infrastructure/connect-account-store";

const organizationId = "60000000-0000-4000-8000-000000000001";
const locationId = "60000000-0000-4000-8000-000000000002";
const accountRowId = "60000000-0000-4000-8000-000000000003";
const otherAccountRowId = "60000000-0000-4000-8000-000000000004";
const invoiceId = "60000000-0000-4000-8000-000000000005";
const attemptId = "60000000-0000-4000-8000-000000000006";
const inboxId = "60000000-0000-4000-8000-000000000007";
const refundRowId = "60000000-0000-4000-8000-000000000008";
const olderAllocation = "60000000-0000-4000-8000-000000000011";
const newerAllocation = "60000000-0000-4000-8000-000000000012";
const olderCharge = "60000000-0000-4000-8000-000000000021";
const newerCharge = "60000000-0000-4000-8000-000000000022";
const connectedAccount = "acct_SyntheticRefunds1";
const chargeRef = "ch_SyntheticRefunds1";
const paymentIntentId = "pi_SyntheticRefunds1";
const refundRef = "re_SyntheticRefunds1";
/** Hora fija del evento y de las devoluciones: nada depende del reloj. */
const now = new Date("2026-12-06T10:00:00.000Z");
const refundedAt = new Date("2026-12-06T09:30:00.000Z");

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
    familyId: "60000000-0000-4000-8000-000000000031",
    familyPayerId: null,
    authorizationId: null,
    paymentProviderAccountId: accountRowId,
    attemptNumber: 1,
    paymentMethodKind: "card",
    amountCents: 7000,
    currency: "EUR",
    status: "succeeded",
    paymentIntentId,
    resumeCount: 0,
    claimedAt: new Date("2026-12-01T08:00:00.000Z"),
    ...overrides,
  };
}

function refund(overrides: Partial<ChargeRefundSnapshot> = {}): ChargeRefundSnapshot {
  return {
    id: refundRef,
    status: "succeeded",
    amountCents: 7000,
    currency: "EUR",
    reasonCode: null,
    createdAt: refundedAt,
    ...overrides,
  };
}

function input(objectId: string, overrides: Partial<RefundEventInput> = {}): RefundEventInput {
  return {
    organizationId,
    account,
    objectId,
    now,
    inboxId,
    eventId: "evt_SyntheticRefunds1",
    ...overrides,
  };
}

/** Stripe simulado: un cargo con sus devoluciones (se pueden cambiar entre entregas). */
function fakeGateway(charge: ChargeRefundsSnapshot) {
  // `metadataAttemptId`: el intento que dice la metadata del `pi_…` (null: no es de Zaltyko).
  const state = { charge, metadataAttemptId: null as string | null };
  const gateway = {
    retrieveChargeRefunds: vi.fn<FamilyCollectionRefundGateway["retrieveChargeRefunds"]>(async (request) => {
      if (request.connectedAccount !== connectedAccount || request.chargeId !== state.charge.chargeId) {
        throw Object.assign(new Error("CI: cargo inexistente"), { type: "StripeInvalidRequestError", code: "resource_missing" });
      }
      return { ...state.charge, refunds: state.charge.refunds.map((entry) => ({ ...entry })) };
    }),
    retrieveRefundCharge: vi.fn<FamilyCollectionRefundGateway["retrieveRefundCharge"]>(async (request) => {
      if (request.connectedAccount !== connectedAccount) return null;
      return state.charge.refunds.some((entry) => entry.id === request.refundId) ? state.charge.chargeId : null;
    }),
    // Tarea 7: solo lo usa el cobro tardío al registrarse; los eventos de devolución nunca.
    retrievePaymentIntentRefunds: vi.fn<FamilyCollectionRefundGateway["retrievePaymentIntentRefunds"]>(async () => {
      throw new Error("Un evento de devolución no relee por el cobro");
    }),
    // Minor 1: solo cuando ningún intento tiene el `pi_…` ni después del camino de los cobros.
    retrievePaymentIntentAttemptId: vi.fn(async (request: { connectedAccount: string; paymentIntentId: string }) =>
      request.connectedAccount === connectedAccount && request.paymentIntentId === state.charge.paymentIntentId
        ? state.metadataAttemptId
        : null
    ),
  };
  return { gateway, state };
}

/** Almacén simulado: recuerda qué `re_…` quedaron anotados y qué avisos se escribieron (una vez por clave). */
function fakeStore(options: { attempt?: CollectionAttempt | null; storage?: boolean } = {}) {
  const recorded = new Set<string>();
  const notices = new Set<string>();
  const store = {
    isStorageAvailable: vi.fn<FamilyCollectionRefundStore["isStorageAvailable"]>(async () => options.storage ?? true),
    findAttemptByPaymentIntent: vi.fn<FamilyCollectionRefundStore["findAttemptByPaymentIntent"]>(async (request) => {
      const found = options.attempt === undefined ? attempt() : options.attempt;
      return found && request.paymentIntentId === found.paymentIntentId && request.organizationId === found.organizationId
        ? found
        : null;
    }),
    // Revisión de d5274ff: el mismo criterio que la adopción (sigue `claimed` en esa academia).
    findClaimedAttemptById: vi.fn<FamilyCollectionRefundStore["findClaimedAttemptById"]>(async (request) => {
      const found = options.attempt === undefined ? attempt() : options.attempt;
      return found &&
        found.status === "claimed" &&
        request.attemptId === found.id &&
        request.organizationId === found.organizationId
        ? found
        : null;
    }),
    isRefundRecorded: vi.fn<FamilyCollectionRefundStore["isRefundRecorded"]>(async (request) => recorded.has(request.refundId)),
    recordAttemptRefunds: vi.fn<FamilyCollectionRefundStore["recordAttemptRefunds"]>(async (request) => {
      if (recorded.has(request.refund.id)) return { outcome: "already_recorded" };
      recorded.add(request.refund.id);
      return { outcome: "recorded", refundIds: [refundRowId], paymentStatus: "refunded" };
    }),
    recordRefundNotice: vi.fn<FamilyCollectionRefundStore["recordRefundNotice"]>(async (request) => {
      const key = needsReviewKey({
        attemptId: request.attempt.id,
        invoiceId: request.attempt.invoiceId,
        reason: request.reason,
        reference: request.refundId,
      });
      if (notices.has(key)) return false;
      notices.add(key);
      return true;
    }),
  };
  return { store, recorded, notices };
}

const charge = (refunds: ChargeRefundSnapshot[], overrides: Partial<ChargeRefundsSnapshot> = {}): ChargeRefundsSnapshot => ({
  chargeId: chargeRef,
  paymentIntentId,
  refunds,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  env.events = true;
  env.environment = "test";
  env.production = false;
});

describe("splitRefund y las claves de cada fila", () => {
  const allocations = [
    // Llegan en cualquier orden: manda el periodo de la cuota.
    { allocationId: newerAllocation, servicePeriodStart: "2026-12-01", chargeId: newerCharge, allocatedCents: 3500, refundedCents: 0 },
    { allocationId: olderAllocation, servicePeriodStart: "2026-11-01", chargeId: olderCharge, allocatedCents: 3500, refundedCents: 0 },
  ];

  it("splitRefund: 35 € de un cobro de 70 € con dos cuotas → toda la devolución en la más antigua", () => {
    expect(splitRefund({ allocations, amountCents: 3500 })).toEqual([{ allocationId: olderAllocation, amountCents: 3500 }]);
  });

  it("splitRefund: más que lo repartido → null", () => {
    expect(splitRefund({ allocations, amountCents: 7001 })).toBeNull();
    // Con devoluciones anteriores, lo que queda es menos.
    expect(
      splitRefund({ allocations: allocations.map((entry) => ({ ...entry, refundedCents: 3000 })), amountCents: 1001 })
    ).toBeNull();
    // Sin repartos (pago sin repartir), nada cabe.
    expect(splitRefund({ allocations: [], amountCents: 100 })).toBeNull();
  });

  it("splitRefund: sigue en la siguiente cuota cuando la más antigua se agota y respeta lo ya devuelto", () => {
    expect(splitRefund({ allocations, amountCents: 5000 })).toEqual([
      { allocationId: olderAllocation, amountCents: 3500 },
      { allocationId: newerAllocation, amountCents: 1500 },
    ]);
    expect(
      splitRefund({
        allocations: [{ ...allocations[1], refundedCents: 3500 }, allocations[0]],
        amountCents: 3500,
      })
    ).toEqual([{ allocationId: newerAllocation, amountCents: 3500 }]);
    // Mismo periodo: por id de la cuota.
    expect(
      splitRefund({
        allocations: allocations.map((entry) => ({ ...entry, servicePeriodStart: "2026-11-01" })),
        amountCents: 100,
      })
    ).toEqual([{ allocationId: olderAllocation, amountCents: 100 }]);
  });

  it("splitRefund: un importe que no es un entero positivo → null", () => {
    for (const amountCents of [0, -100, 10.5, Number.NaN]) {
      expect(splitRefund({ allocations, amountCents }), String(amountCents)).toBeNull();
    }
  });

  it("referencia y clave por fila: un re_ en dos cuotas da dos claves distintas", () => {
    expect(providerRefundReference(refundRef, olderAllocation)).toBe(`${refundRef}:${olderAllocation}`);
    expect(providerRefundIdempotencyKey(refundRef, olderAllocation)).toBe(`refund:${refundRef}:${olderAllocation}`);
    expect(providerRefundIdempotencyKey(refundRef, olderAllocation)).not.toBe(
      providerRefundIdempotencyKey(refundRef, newerAllocation)
    );
  });

  it("RefundDoesNotFitError lleva su código y el motivo por defecto es el de la academia", () => {
    const error = new RefundDoesNotFitError();
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(REFUND_DOES_NOT_FIT);
    expect(error.message).toBe("REFUND_DOES_NOT_FIT");
    expect(refundReasonCode(null)).toBe("requested_by_academy");
    expect(refundReasonCode("requested_by_customer")).toBe("requested_by_customer");
    expect(refundReasonCode("Texto libre")).toBe("requested_by_academy");
  });

  it("C13: el aviso de una devolución lleva su re_ en la clave; los de siempre no cambian", () => {
    expect(needsReviewKey({ attemptId, invoiceId, reason: "refunded", reference: refundRef })).toBe(
      `family-collection:${attemptId}:needs_review:refunded:${refundRef}`
    );
    expect(needsReviewKey({ attemptId, invoiceId, reason: "allocation" })).toBe(
      `family-collection:${attemptId}:needs_review:allocation`
    );
    expect(needsReviewKey({ attemptId: null, invoiceId, reason: "attempts_exhausted" })).toBe(
      `family-collection:invoice:${invoiceId}:needs_review:attempts_exhausted`
    );
  });
});

describe("manejadores de charge.refunded y refund.*", () => {
  it("son los manejadores por defecto de la ruta", () => {
    expect(DEFAULT_PROVIDER_EVENT_HANDLERS.charge).toBe(handleChargeRefundEvent);
    expect(DEFAULT_PROVIDER_EVENT_HANDLERS.refund).toBe(handleRefundEvent);
  });

  it("devolución succeeded → se relee en la cuenta y se anota entera con el motivo de la academia", async () => {
    const { gateway } = fakeGateway(charge([refund()]));
    const { store } = fakeStore();

    const effect = await processChargeRefundEvent(input(chargeRef), { store, gateway });

    expect(effect).toEqual({ effectType: REFUND_EFFECT_TYPE, effectId: refundRowId });
    expect(gateway.retrieveChargeRefunds).toHaveBeenCalledWith({ connectedAccount, chargeId: chargeRef });
    expect(store.recordAttemptRefunds).toHaveBeenCalledTimes(1);
    expect(store.recordAttemptRefunds).toHaveBeenCalledWith({
      organizationId,
      attemptId,
      paymentIntentId,
      refund: { id: refundRef, amountCents: 7000, currency: "EUR", reasonCode: "requested_by_academy", refundedAt },
      providerEventId: inboxId,
      environment: "test",
      now,
    });
    expect(store.recordRefundNotice).not.toHaveBeenCalled();
  });

  it("mismo evento o charge.refunded repetido → ninguna fila nueva", async () => {
    const { gateway } = fakeGateway(charge([refund()]));
    const { store } = fakeStore();

    await processChargeRefundEvent(input(chargeRef), { store, gateway });
    const again = await processChargeRefundEvent(input(chargeRef, { eventId: "evt_SyntheticRefunds2" }), { store, gateway });
    const viaRefund = await processRefundEvent(input(refundRef, { eventId: "evt_SyntheticRefunds3" }), { store, gateway });

    expect(again).toEqual({ effectType: null, effectId: null });
    expect(viaRefund).toEqual({ effectType: null, effectId: null });
    expect(store.recordAttemptRefunds).toHaveBeenCalledTimes(1);
  });

  it("devolución pending → nada; luego refund.updated succeeded → filas", async () => {
    const { gateway, state } = fakeGateway(charge([refund({ status: "pending" })]));
    const { store } = fakeStore();

    expect(await processRefundEvent(input(refundRef), { store, gateway })).toEqual({ effectType: null, effectId: null });
    expect(store.recordAttemptRefunds).not.toHaveBeenCalled();

    state.charge = charge([refund({ status: "succeeded" })]);
    expect(await processRefundEvent(input(refundRef), { store, gateway })).toEqual({
      effectType: REFUND_EFFECT_TYPE,
      effectId: refundRowId,
    });
    expect(gateway.retrieveRefundCharge).toHaveBeenCalledWith({ connectedAccount, refundId: refundRef });
    expect(store.recordAttemptRefunds).toHaveBeenCalledTimes(1);
  });

  it("devolución que no cabe → aviso refund_unallocated una vez por re_, ninguna fila y el evento termina (sin lanzar)", async () => {
    const { gateway } = fakeGateway(charge([refund()]));
    const { store, notices } = fakeStore();
    store.recordAttemptRefunds.mockRejectedValue(new RefundDoesNotFitError());

    for (const delivery of [1, 2]) {
      const effect = await processChargeRefundEvent(input(chargeRef), { store, gateway });
      expect(effect, `entrega ${delivery}`).toEqual({ effectType: REFUND_REVIEW_EFFECT_TYPE, effectId: attemptId });
    }
    expect(store.recordRefundNotice).toHaveBeenCalledWith({
      attempt: attempt(),
      reason: REFUND_UNALLOCATED_REASON,
      refundId: refundRef,
      amountCents: 7000,
      currency: "EUR",
      now,
    });
    expect([...notices]).toEqual([`family-collection:${attemptId}:needs_review:${REFUND_UNALLOCATED_REASON}:${refundRef}`]);
    // Solo ids en el registro.
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toMatch(/Ana|@/);
  });

  it("una segunda devolución del mismo cobro también avisa (C13)", async () => {
    const second = "re_SyntheticRefunds2";
    const { gateway } = fakeGateway(
      charge([
        refund({ amountCents: 1000 }),
        refund({ id: second, amountCents: 1000, createdAt: new Date("2026-12-06T09:45:00.000Z") }),
      ])
    );
    const { store, notices } = fakeStore();
    store.recordAttemptRefunds.mockRejectedValue(new RefundDoesNotFitError());

    await processChargeRefundEvent(input(chargeRef), { store, gateway });
    expect([...notices]).toEqual([
      `family-collection:${attemptId}:needs_review:${REFUND_UNALLOCATED_REASON}:${refundRef}`,
      `family-collection:${attemptId}:needs_review:${REFUND_UNALLOCATED_REASON}:${second}`,
    ]);
  });

  it("varias devoluciones del cargo: de la más antigua a la más nueva; el efecto es la primera fila nueva", async () => {
    const later = "re_SyntheticRefundsLater";
    const { gateway } = fakeGateway(
      charge([
        refund({ id: later, amountCents: 1000, createdAt: new Date("2026-12-06T09:45:00.000Z") }),
        refund({ amountCents: 2000, reasonCode: "duplicate" }),
      ])
    );
    const { store } = fakeStore();
    store.recordAttemptRefunds.mockImplementation(async (request) => ({
      outcome: "recorded",
      refundIds: [request.refund.id === refundRef ? refundRowId : "60000000-0000-4000-8000-000000000099"],
      paymentStatus: "partially_refunded",
    }));

    expect(await processChargeRefundEvent(input(chargeRef), { store, gateway })).toEqual({
      effectType: REFUND_EFFECT_TYPE,
      effectId: refundRowId,
    });
    expect(store.recordAttemptRefunds.mock.calls.map(([request]) => [request.refund.id, request.refund.reasonCode])).toEqual([
      [refundRef, "duplicate"],
      [later, "requested_by_academy"],
    ]);
  });

  it("una devolución ya anotada que pasa a failed/canceled → aviso refund_reversed, sin tocar el libro", async () => {
    const { gateway, state } = fakeGateway(charge([refund()]));
    const { store, notices } = fakeStore();
    await processChargeRefundEvent(input(chargeRef), { store, gateway });

    for (const status of ["failed", "canceled"]) {
      state.charge = charge([refund({ status })]);
      expect(await processRefundEvent(input(refundRef), { store, gateway }), status).toEqual({
        effectType: REFUND_REVIEW_EFFECT_TYPE,
        effectId: attemptId,
      });
    }
    expect(store.recordAttemptRefunds).toHaveBeenCalledTimes(1);
    expect([...notices]).toEqual([`family-collection:${attemptId}:needs_review:${REFUND_REVERSED_REASON}:${refundRef}`]);
  });

  it("una devolución nunca anotada que falla → nada", async () => {
    const { gateway } = fakeGateway(charge([refund({ status: "failed" })]));
    const { store } = fakeStore();
    expect(await processRefundEvent(input(refundRef), { store, gateway })).toEqual({ effectType: null, effectId: null });
    expect(store.recordAttemptRefunds).not.toHaveBeenCalled();
    expect(store.recordRefundNotice).not.toHaveBeenCalled();
  });

  it("cargo que no es de un cobro de Zaltyko, de otra cuenta, sin pi_ o de un intento no cobrado → sin efecto", async () => {
    const cases: Array<[string, CollectionAttempt | null, ChargeRefundsSnapshot]> = [
      ["sin intento", null, charge([refund()])],
      ["otra cuenta", attempt({ paymentProviderAccountId: otherAccountRowId }), charge([refund()])],
      ["sin pi_", attempt(), charge([refund()], { paymentIntentId: null })],
      ["no cobrado", attempt({ status: "failed" }), charge([refund()])],
    ];
    for (const [label, found, snapshot] of cases) {
      const { gateway } = fakeGateway(snapshot);
      const { store } = fakeStore({ attempt: found });
      expect(await processChargeRefundEvent(input(chargeRef), { store, gateway }), label).toEqual({
        effectType: null,
        effectId: null,
      });
      expect(store.recordAttemptRefunds, label).not.toHaveBeenCalled();
      expect(store.recordRefundNotice, label).not.toHaveBeenCalled();
    }
  });

  it("ola final (punto 1): devolución antes que succeeded → primero se registra el cobro por su pi_ y luego la fila refund", async () => {
    for (const status of ["processing", "created", "requires_action"] as const) {
      const { gateway } = fakeGateway(charge([refund()]));
      const options: { attempt?: CollectionAttempt | null } = { attempt: attempt({ status }) };
      const { store } = fakeStore(options);
      // El camino de los cobros (processPaymentIntentEvent) registra el cobro: el intento pasa a succeeded.
      const recordCollection = vi.fn(async () => {
        options.attempt = attempt({ status: "succeeded" });
      });

      const effect = await processChargeRefundEvent(input(chargeRef), { store, gateway, recordCollection });

      expect(effect, status).toEqual({ effectType: REFUND_EFFECT_TYPE, effectId: refundRowId });
      expect(recordCollection, status).toHaveBeenCalledTimes(1);
      expect(recordCollection, status).toHaveBeenCalledWith(input(paymentIntentId));
      expect(store.recordAttemptRefunds, status).toHaveBeenCalledTimes(1);
      expect(store.recordAttemptRefunds.mock.calls[0][0].attemptId, status).toBe(attemptId);
      // El cobro se registra antes que la devolución (registrar antes de repartir).
      expect(recordCollection.mock.invocationCallOrder[0], status).toBeLessThan(
        store.recordAttemptRefunds.mock.invocationCallOrder[0]
      );
    }
  });

  it("ola final (punto 1): el intento sigue abierto y Stripe ya devolvió → error pasajero (Stripe reenvía), sin filas ni avisos", async () => {
    const { gateway } = fakeGateway(charge([refund()]));
    const { store } = fakeStore({ attempt: attempt({ status: "processing" }) });
    const recordCollection = vi.fn(async () => undefined);

    await expect(processRefundEvent(input(refundRef), { store, gateway, recordCollection })).rejects.toThrow(
      REFUND_BEFORE_COLLECTION_RECORDED
    );
    expect(recordCollection).toHaveBeenCalledTimes(1);
    // Sin el camino de los cobros (p. ej. en otro llamador) tampoco se pierde.
    await expect(processChargeRefundEvent(input(chargeRef), { store, gateway })).rejects.toThrow(
      REFUND_BEFORE_COLLECTION_RECORDED
    );
    expect(store.recordAttemptRefunds).not.toHaveBeenCalled();
    expect(store.recordRefundNotice).not.toHaveBeenCalled();
  });

  it("ola final (punto 1): intento abierto con solo devoluciones pending → sin efecto y sin error", async () => {
    const { gateway } = fakeGateway(charge([refund({ status: "pending" })]));
    const { store } = fakeStore({ attempt: attempt({ status: "processing" }) });
    const recordCollection = vi.fn(async () => undefined);

    expect(await processChargeRefundEvent(input(chargeRef), { store, gateway, recordCollection })).toEqual({
      effectType: null,
      effectId: null,
    });
    expect(store.recordAttemptRefunds).not.toHaveBeenCalled();
  });

  it("ola final (punto 1): un intento ya cobrado o cerrado sin cobro no llama al camino de los cobros", async () => {
    for (const status of ["succeeded", "failed", "canceled"] as const) {
      const { gateway } = fakeGateway(charge([refund()]));
      const { store } = fakeStore({ attempt: attempt({ status }) });
      const recordCollection = vi.fn(async () => undefined);
      await processChargeRefundEvent(input(chargeRef), { store, gateway, recordCollection });
      expect(recordCollection, status).not.toHaveBeenCalled();
    }
  });

  it("Minor 1: intento claimed sin pi_ y la devolución llega primero → el camino de los cobros lo encuentra y registra, y después la fila refund", async () => {
    const { gateway } = fakeGateway(charge([refund()]));
    // El intento sigue `claimed`: Zaltyko creó el cobro y se cayó antes de guardar su `pi_…`.
    const options: { attempt?: CollectionAttempt | null } = {
      attempt: attempt({ status: "claimed", paymentIntentId: null }),
    };
    const { store } = fakeStore(options);
    // El camino de los cobros (processPaymentIntentEvent) lo adopta por la metadata y registra el cobro.
    const recordCollection = vi.fn(async () => {
      options.attempt = attempt({ status: "succeeded" });
    });

    const effect = await processRefundEvent(input(refundRef), { store, gateway, recordCollection });

    expect(effect).toEqual({ effectType: REFUND_EFFECT_TYPE, effectId: refundRowId });
    // Una sola vez: no se repite al ver el intento (ya cobrado).
    expect(recordCollection).toHaveBeenCalledTimes(1);
    expect(recordCollection).toHaveBeenCalledWith(input(paymentIntentId));
    expect(store.findAttemptByPaymentIntent).toHaveBeenCalledTimes(2);
    expect(store.recordAttemptRefunds).toHaveBeenCalledTimes(1);
    expect(store.recordAttemptRefunds.mock.calls[0][0].attemptId).toBe(attemptId);
    expect(store.recordAttemptRefunds.mock.calls[0][0].paymentIntentId).toBe(paymentIntentId);
    // Primero el cobro y después la devolución.
    expect(recordCollection.mock.invocationCallOrder[0]).toBeLessThan(
      store.recordAttemptRefunds.mock.invocationCallOrder[0]
    );
    // Ya resuelto: no hace falta mirar la metadata.
    expect(gateway.retrievePaymentIntentAttemptId).not.toHaveBeenCalled();
  });

  it("Minor 1: el intento claimed aparece pero sigue abierto → error pasajero sin repetir el camino de los cobros", async () => {
    const { gateway } = fakeGateway(charge([refund()]));
    const options: { attempt?: CollectionAttempt | null } = {
      attempt: attempt({ status: "claimed", paymentIntentId: null }),
    };
    const { store } = fakeStore(options);
    // Le guarda el `pi_…`, pero Stripe aún no da el resultado del cobro.
    const recordCollection = vi.fn(async () => {
      options.attempt = attempt({ status: "created" });
    });

    await expect(processChargeRefundEvent(input(chargeRef), { store, gateway, recordCollection })).rejects.toThrow(
      REFUND_BEFORE_COLLECTION_RECORDED
    );
    expect(recordCollection).toHaveBeenCalledTimes(1);
    expect(store.recordAttemptRefunds).not.toHaveBeenCalled();
    expect(store.recordRefundNotice).not.toHaveBeenCalled();
  });

  it("Minor 1: ningún intento ni después del camino de los cobros → error pasajero solo si la metadata dice que es de Zaltyko", async () => {
    // La metadata del cobro apunta a un intento de Zaltyko: Stripe reenvía.
    const ours = fakeGateway(charge([refund()]));
    ours.state.metadataAttemptId = attemptId;
    const oursStore = fakeStore({ attempt: attempt({ status: "claimed", paymentIntentId: null }) });
    const recordCollection = vi.fn(async () => undefined);
    await expect(
      processRefundEvent(input(refundRef), { store: oursStore.store, gateway: ours.gateway, recordCollection })
    ).rejects.toThrow(REFUND_BEFORE_COLLECTION_RECORDED);
    expect(recordCollection).toHaveBeenCalledTimes(1);
    expect(ours.gateway.retrievePaymentIntentAttemptId).toHaveBeenCalledWith({ connectedAccount, paymentIntentId });
    expect(oursStore.store.recordAttemptRefunds).not.toHaveBeenCalled();

    // Otro cobro de la academia (sin metadata de Zaltyko): sin efecto y sin error.
    const foreign = fakeGateway(charge([refund()]));
    const foreignStore = fakeStore({ attempt: null });
    expect(
      await processChargeRefundEvent(input(chargeRef), { store: foreignStore.store, gateway: foreign.gateway, recordCollection })
    ).toEqual({ effectType: null, effectId: null });
    expect(foreign.gateway.retrievePaymentIntentAttemptId).toHaveBeenCalledTimes(1);
    expect(foreignStore.store.recordAttemptRefunds).not.toHaveBeenCalled();
    expect(foreignStore.store.recordRefundNotice).not.toHaveBeenCalled();
  });

  it("revisión de d5274ff: la metadata apunta a un intento que ya no está claimed o es de otra cuenta → sin efecto ni reenvío, aviso solo con ids", async () => {
    const recordCollection = vi.fn(async () => undefined);
    for (const [label, stored, reason] of [
      // Cerrado (p. ej. cancelado por la puerta) sin haber guardado el `pi_…`.
      ["ya no claimed", attempt({ status: "canceled", paymentIntentId: null }), "attempt_not_claimed"],
      // No existe en esta academia.
      ["inexistente", null, "attempt_not_claimed"],
      // Sigue claimed, pero en otra cuenta conectada de la academia.
      [
        "otra cuenta",
        attempt({ status: "claimed", paymentIntentId: null, paymentProviderAccountId: otherAccountRowId }),
        "other_connected_account",
      ],
    ] as const) {
      vi.mocked(logger.warn).mockClear();
      const { gateway, state } = fakeGateway(charge([refund()]));
      state.metadataAttemptId = attemptId;
      const { store } = fakeStore({ attempt: stored });

      expect(await processRefundEvent(input(refundRef), { store, gateway, recordCollection }), label).toEqual({
        effectType: null,
        effectId: null,
      });
      expect(store.findClaimedAttemptById, label).toHaveBeenCalledWith({ organizationId, attemptId });
      expect(store.recordAttemptRefunds, label).not.toHaveBeenCalled();
      expect(store.recordRefundNotice, label).not.toHaveBeenCalled();
      expect(logger.warn, label).toHaveBeenCalledWith(
        "Cobro automático: devolución de un cobro de Zaltyko sin intento reclamado que adoptar en esta cuenta; no se aplica",
        {
          organizationId,
          eventId: "evt_SyntheticRefunds1",
          objectId: refundRef,
          accountId: connectedAccount,
          paymentIntentId,
          attemptId,
          reason,
        }
      );
    }
  });

  it("Minor 1: sin intento y solo devoluciones pending → ni camino de los cobros ni Stripe", async () => {
    const { gateway, state } = fakeGateway(charge([refund({ status: "pending" })]));
    state.metadataAttemptId = attemptId;
    const { store } = fakeStore({ attempt: attempt({ status: "claimed", paymentIntentId: null }) });
    const recordCollection = vi.fn(async () => undefined);

    expect(await processChargeRefundEvent(input(chargeRef), { store, gateway, recordCollection })).toEqual({
      effectType: null,
      effectId: null,
    });
    expect(recordCollection).not.toHaveBeenCalled();
    expect(gateway.retrievePaymentIntentAttemptId).not.toHaveBeenCalled();
  });

  it("Stripe: un error permanente no tiene efecto (solo ids en el registro); uno pasajero sube para que Stripe reenvíe", async () => {
    const { gateway } = fakeGateway(charge([refund()]));
    const { store } = fakeStore();
    const permanent = Object.assign(new Error("No such charge for Ana Prueba"), {
      type: "StripeInvalidRequestError",
      code: "resource_missing",
    });
    gateway.retrieveChargeRefunds.mockRejectedValueOnce(permanent);
    expect(await processChargeRefundEvent(input(chargeRef), { store, gateway })).toEqual({ effectType: null, effectId: null });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ errorCode: "resource_missing", objectId: chargeRef })
    );
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("Ana Prueba");

    const transient = Object.assign(new Error("lock_timeout"), { type: "StripeAPIError", code: "lock_timeout" });
    gateway.retrieveRefundCharge.mockRejectedValueOnce(transient);
    await expect(processRefundEvent(input(refundRef), { store, gateway })).rejects.toBe(transient);
    expect(store.recordAttemptRefunds).not.toHaveBeenCalled();
  });

  it("Tarea M (punto 7): más de 1000 devoluciones en un cargo → permanente: sin efecto y en el registro, nunca un 500 eterno", async () => {
    const { gateway } = fakeGateway(charge([refund()]));
    const { store } = fakeStore();
    gateway.retrieveChargeRefunds.mockRejectedValueOnce(new Error(TOO_MANY_REFUNDS_FOR_CHARGE_ERROR));

    expect(await processChargeRefundEvent(input(chargeRef), { store, gateway })).toEqual({ effectType: null, effectId: null });
    expect(logger.warn).toHaveBeenCalledWith(
      "Cobro automático: Stripe no deja leer una devolución de un evento",
      expect.objectContaining({ errorCode: TOO_MANY_REFUNDS_FOR_CHARGE_ERROR, objectId: chargeRef })
    );
    expect(store.recordAttemptRefunds).not.toHaveBeenCalled();
    expect(store.recordRefundNotice).not.toHaveBeenCalled();
  });

  it("un error inesperado del almacén sube (el evento queda failed y Stripe lo reenvía)", async () => {
    const { gateway } = fakeGateway(charge([refund()]));
    const { store } = fakeStore();
    const failure = Object.assign(new Error("conflicto"), { code: "IDEMPOTENCY_CONFLICT" });
    store.recordAttemptRefunds.mockRejectedValue(failure);
    await expect(processChargeRefundEvent(input(chargeRef), { store, gateway })).rejects.toBe(failure);
    expect(store.recordRefundNotice).not.toHaveBeenCalled();
  });

  it("cerrojos: bandera de eventos apagada, clave Live, base de producción o sin almacenamiento → sin efecto y sin leer Stripe", async () => {
    const closers: Array<[string, () => void, boolean]> = [
      ["bandera", () => (env.events = false), true],
      ["live", () => (env.environment = "live"), true],
      ["producción", () => (env.production = true), true],
      ["almacenamiento", () => undefined, false],
    ];
    for (const [label, close, storage] of closers) {
      env.events = true;
      env.environment = "test";
      env.production = false;
      close();
      const { gateway } = fakeGateway(charge([refund()]));
      const { store } = fakeStore({ storage });
      expect(await processChargeRefundEvent(input(chargeRef), { store, gateway }), label).toEqual({
        effectType: null,
        effectId: null,
      });
      expect(await processRefundEvent(input(refundRef), { store, gateway }), label).toEqual({
        effectType: null,
        effectId: null,
      });
      expect(gateway.retrieveChargeRefunds, label).not.toHaveBeenCalled();
      expect(gateway.retrieveRefundCharge, label).not.toHaveBeenCalled();
      expect(store.recordAttemptRefunds, label).not.toHaveBeenCalled();
    }
  });
});

describe("createStripeRefundGateway", () => {
  function fakeStripe(options: { refunds: unknown[]; paymentIntent?: unknown; refundCharge?: unknown }) {
    const autoPagingToArray = vi.fn(async () => options.refunds);
    const fns = {
      chargesRetrieve: vi.fn(async () => ({ id: chargeRef, payment_intent: options.paymentIntent ?? paymentIntentId })),
      refundsList: vi.fn(() => ({ autoPagingToArray })),
      refundsRetrieve: vi.fn(async () => ({ id: refundRef, charge: options.refundCharge ?? chargeRef })),
    };
    const client = {
      charges: { retrieve: fns.chargesRetrieve },
      refunds: { list: fns.refundsList, retrieve: fns.refundsRetrieve },
    } as unknown as Stripe;
    return { client, fns, autoPagingToArray };
  }

  const stripeRefund = (overrides: Record<string, unknown> = {}) => ({
    id: refundRef,
    object: "refund",
    status: "succeeded",
    amount: 3500,
    currency: "eur",
    reason: "requested_by_customer",
    created: 1_796_549_400,
    charge: chargeRef,
    ...overrides,
  });

  it("relee el cargo y todas sus devoluciones en la cuenta conectada; solo ids, estados, importes y códigos", async () => {
    const { client, fns, autoPagingToArray } = fakeStripe({
      refunds: [stripeRefund(), stripeRefund({ id: "pyr_SyntheticRefunds2", reason: null, status: "pending" })],
      paymentIntent: { id: paymentIntentId, object: "payment_intent" },
    });

    await expect(
      createStripeRefundGateway(client).retrieveChargeRefunds({ connectedAccount, chargeId: chargeRef })
    ).resolves.toEqual({
      chargeId: chargeRef,
      paymentIntentId,
      refunds: [
        {
          id: refundRef,
          status: "succeeded",
          amountCents: 3500,
          currency: "EUR",
          reasonCode: "requested_by_customer",
          createdAt: new Date(1_796_549_400 * 1000),
        },
        {
          id: "pyr_SyntheticRefunds2",
          status: "pending",
          amountCents: 3500,
          currency: "EUR",
          reasonCode: null,
          createdAt: new Date(1_796_549_400 * 1000),
        },
      ],
    });
    expect(fns.chargesRetrieve).toHaveBeenCalledWith(chargeRef, {}, { stripeAccount: connectedAccount });
    expect(fns.refundsList).toHaveBeenCalledWith({ charge: chargeRef, limit: 100 }, { stripeAccount: connectedAccount });
    expect(autoPagingToArray).toHaveBeenCalledWith({ limit: 1001 });
  });

  it("deja fuera las devoluciones sin forma conocida o de otro cargo", async () => {
    const { client } = fakeStripe({
      refunds: [stripeRefund({ amount: 0 }), stripeRefund({ charge: "ch_OtherCharge" }), stripeRefund({ created: null })],
    });
    const snapshot = await createStripeRefundGateway(client).retrieveChargeRefunds({ connectedAccount, chargeId: chargeRef });
    expect(snapshot.refunds).toEqual([]);
  });

  it("con más devoluciones de las que se leen, lanza en vez de decidir con una lista a medias", async () => {
    const { client } = fakeStripe({ refunds: Array.from({ length: 1001 }, (_, index) => stripeRefund({ id: `re_Many${index}` })) });
    await expect(
      createStripeRefundGateway(client).retrieveChargeRefunds({ connectedAccount, chargeId: chargeRef })
    ).rejects.toThrow(TOO_MANY_REFUNDS_FOR_CHARGE_ERROR);
  });

  it("Minor 1: el id del intento sale de la metadata del pi_ en la cuenta conectada; sin metadata de Zaltyko, null", async () => {
    const retrieve = vi.fn(async (id: string) => ({
      id,
      object: "payment_intent",
      metadata: id === paymentIntentId ? { zaltyko_collection_attempt_id: attemptId } : {},
    }));
    const client = { paymentIntents: { retrieve } } as unknown as Stripe;
    const gateway = createStripeRefundGateway(client);

    await expect(gateway.retrievePaymentIntentAttemptId?.({ connectedAccount, paymentIntentId })).resolves.toBe(attemptId);
    expect(retrieve).toHaveBeenCalledWith(paymentIntentId, {}, { stripeAccount: connectedAccount });
    await expect(
      gateway.retrievePaymentIntentAttemptId?.({ connectedAccount, paymentIntentId: "pi_SyntheticOther1" })
    ).resolves.toBeNull();
  });

  it("la devolución da el id de su cargo (como texto o como objeto)", async () => {
    const asText = fakeStripe({ refunds: [] });
    await expect(
      createStripeRefundGateway(asText.client).retrieveRefundCharge({ connectedAccount, refundId: refundRef })
    ).resolves.toBe(chargeRef);
    expect(asText.fns.refundsRetrieve).toHaveBeenCalledWith(refundRef, {}, { stripeAccount: connectedAccount });

    const asObject = fakeStripe({ refunds: [], refundCharge: { id: "py_SyntheticRefunds1", object: "charge" } });
    await expect(
      createStripeRefundGateway(asObject.client).retrieveRefundCharge({ connectedAccount, refundId: refundRef })
    ).resolves.toBe("py_SyntheticRefunds1");
  });
});
