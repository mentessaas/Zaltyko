import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/stripe/client";
import { loadOrganizationPlanState } from "@/modules/billing/application/plan-state";
import type { EntitlementSnapshot } from "@/modules/billing/domain/plan-eligibility";
import {
  AUTHORIZATION_EFFECT_TYPE,
  DEFAULT_PROVIDER_EVENT_HANDLERS,
  handleMandateEvent,
  handlePaymentMethodEvent,
  handleSetupIntentEvent,
  processMandateEvent,
  processPaymentMethodEvent,
  processSetupIntentEvent,
  type ProviderEventHandlerInput,
} from "@/modules/family-collection/application/family-collection-events";
import {
  completeFamilyPaymentSetupFromProvider,
  revokeAuthorizationFromProvider,
} from "@/modules/family-payment-methods/application/family-payment-methods-service";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { FAMILY_PAYMENT_CONSENT_VERSION } from "@/modules/family-payment-methods/domain/consent";
import type { SetupIntentSnapshot } from "@/modules/family-payment-methods/domain/setup-verification";
import {
  findActiveAuthorizationByMandate,
  findActiveAuthorizationByPaymentMethod,
  findSetupAttemptByReference,
  insertActiveAuthorization,
  isCurrentFamilyPayer,
  loadOrganizationName,
  lockActiveAuthorization,
  lockActiveAuthorizationById,
  lockOrganizationForPaymentMethods,
  lockSetupAttempt,
  markSetupAttemptAbandoned,
  markSetupAttemptCompleted,
  revokeAuthorization,
  type StoredAuthorization,
  type StoredSetupAttempt,
} from "@/modules/family-payment-methods/infrastructure/family-payment-store";
import {
  createStripeFamilyGateway,
  familyProviderReadFailureOf,
  type FamilyPaymentGateway,
  type FamilyPaymentMethodReads,
} from "@/modules/family-payment-methods/infrastructure/stripe-family-gateway";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import {
  findConnectAccountForOrganization,
  type StoredConnectAccount,
} from "@/modules/payments-connect/infrastructure/connect-account-store";
import {
  appendAuditEntry,
  appendOutboxEvent,
} from "@/modules/shared/infrastructure/transactional-records";

/**
 * Pago automático de cuotas (cobro automático, Fase 4, Tarea 8): los avisos
 * de Stripe sobre el método de pago (`payment_method.detached`,
 * `mandate.updated` y `setup_intent.succeeded`, decisión 12 del ADR) con la
 * base y Stripe simulados. El aviso es solo un aviso: se relee el objeto por
 * id en la cuenta conectada y solo se revoca si Stripe lo confirma. El
 * adaptador real de Stripe nunca se usa sin un cliente simulado
 * (getStripeClient lanza). Solo datos sintéticos y fechas fijas: no depende
 * del reloj.
 */

const { tx } = vi.hoisted(() => ({ tx: { kind: "tx" } }));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)) },
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: vi.fn(() => {
    throw new Error("Stripe real no debe usarse en tests");
  }),
}));
vi.mock("@/modules/billing/application/plan-state", () => ({
  loadOrganizationPlanState: vi.fn(),
}));
vi.mock("@/modules/family-payment-methods/application/storage", () => ({
  isFamilyPaymentMethodsStorageAvailable: vi.fn(),
}));
vi.mock("@/modules/payments-connect/application/storage", () => ({
  isConnectOnboardingStorageAvailable: vi.fn(),
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/shared/infrastructure/transactional-records")>()),
  appendAuditEntry: vi.fn(),
  appendOutboxEvent: vi.fn(),
}));
vi.mock("@/modules/payments-connect/infrastructure/connect-account-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/payments-connect/infrastructure/connect-account-store")>()),
  findConnectAccountForOrganization: vi.fn(),
}));
vi.mock("@/modules/family-payment-methods/infrastructure/family-payment-store", () => ({
  resolveFamilyPayer: vi.fn(),
  loadOrganizationName: vi.fn(),
  findLatestCustomerReference: vi.fn(),
  insertSetupAttempt: vi.fn(),
  findSetupAttemptForPayer: vi.fn(),
  findSetupAttemptByReference: vi.fn(),
  isCurrentFamilyPayer: vi.fn(),
  lockOrganizationForPaymentMethods: vi.fn(),
  lockSetupAttempt: vi.fn(),
  markSetupAttemptAbandoned: vi.fn(),
  markSetupAttemptCompleted: vi.fn(),
  findActiveAuthorization: vi.fn(),
  findActiveAuthorizationByPaymentMethod: vi.fn(),
  findActiveAuthorizationByMandate: vi.fn(),
  lockActiveAuthorization: vi.fn(),
  lockActiveAuthorizationById: vi.fn(),
  insertActiveAuthorization: vi.fn(),
  revokeAuthorization: vi.fn(),
  listActiveAuthorizationsForOrganization: vi.fn(),
}));

const organizationId = "10000000-0000-4000-8000-000000000001";
const familyId = "10000000-0000-4000-8000-000000000301";
const familyPayerId = "10000000-0000-4000-8000-000000000401";
const guardianId = "10000000-0000-4000-8000-000000000501";
const accountRowId = "10000000-0000-4000-8000-000000000901";
const otherAccountRowId = "10000000-0000-4000-8000-000000000902";
const attemptId = "10000000-0000-4000-8000-000000000601";
const authorizationId = "10000000-0000-4000-8000-000000000701";
const newAuthorizationId = "10000000-0000-4000-8000-000000000702";
const inboxId = "10000000-0000-4000-8000-000000000801";
const connectedAccount = "acct_SyntheticA1";
const cardMethod = "pm_SyntheticCard";
const sepaMethod = "pm_SyntheticSepa";
const mandateId = "mandate_SyntheticSepa";
const setupIntentId = "seti_Synthetic1";
const now = new Date("2026-11-20T10:00:00.000Z");
const JOB_KEY = "zaltyko-family-collection";

function entitlement(planCode: EntitlementSnapshot["planCode"]): EntitlementSnapshot {
  return {
    organizationId,
    planCode,
    revision: 2,
    source: planCode === "free" ? "bootstrap" : "contract",
    sourceReference: planCode === "free" ? "bootstrap:synthetic" : `contract:${organizationId}`,
    subscriptionId: null,
    effectiveFrom: "2026-11-01T00:00:00.000Z",
    effectiveUntil: null,
  };
}

function account(overrides: Partial<StoredConnectAccount> = {}): StoredConnectAccount {
  return {
    id: accountRowId,
    organizationId,
    environment: "test",
    providerAccountReference: connectedAccount,
    status: "active",
    cardPaymentsCapabilityStatus: "active",
    sepaDebitPaymentsCapabilityStatus: "active",
    requirementsState: "none",
    revision: 3,
    lastSyncedAt: now,
    ...overrides,
  };
}

function authorization(overrides: Partial<StoredAuthorization> = {}): StoredAuthorization {
  return {
    id: authorizationId,
    organizationId,
    familyId,
    familyPayerId,
    paymentProviderAccountId: accountRowId,
    paymentMethodReference: cardMethod,
    paymentMethodKind: "card",
    consentedAt: new Date("2026-11-16T11:55:00.000Z"),
    ...overrides,
  };
}

/** Domiciliación activa con su orden (la orden no está en StoredAuthorization: se busca por ella). */
function sepaAuthorization(): StoredAuthorization {
  return authorization({ paymentMethodReference: sepaMethod, paymentMethodKind: "sepa_debit" });
}

function setupAttempt(overrides: Partial<StoredSetupAttempt> = {}): StoredSetupAttempt {
  return {
    id: attemptId,
    organizationId,
    familyId,
    familyPayerId,
    guardianId,
    paymentProviderAccountId: accountRowId,
    paymentMethodKind: "card",
    providerCustomerReference: "cus_Synthetic1",
    providerSetupReference: setupIntentId,
    consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
    consentTextSha256: "b".repeat(64),
    consentedAt: new Date("2026-11-16T11:55:00.000Z"),
    status: "open",
    authorizationId: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<SetupIntentSnapshot> = {}): SetupIntentSnapshot {
  return {
    id: setupIntentId,
    status: "succeeded",
    customer: "cus_Synthetic1",
    paymentMethod: "pm_SyntheticNew",
    paymentMethodType: "card",
    mandate: null,
    metadataAttemptId: attemptId,
    hasLastSetupError: false,
    ...overrides,
  };
}

/** Lo que Stripe dice del método y de la orden (o el error que lanza). */
function fakeReads(
  input: {
    paymentMethod?: { id: string; customer: string | null } | null | Error;
    mandate?: { id: string; status: string } | null | Error;
  } = {}
) {
  return {
    retrievePaymentMethod: vi.fn<FamilyPaymentMethodReads["retrievePaymentMethod"]>(async () => {
      if (input.paymentMethod instanceof Error) throw input.paymentMethod;
      return input.paymentMethod === undefined ? { id: cardMethod, customer: "cus_Synthetic1" } : input.paymentMethod;
    }),
    retrieveMandate: vi.fn<FamilyPaymentMethodReads["retrieveMandate"]>(async () => {
      if (input.mandate instanceof Error) throw input.mandate;
      return input.mandate === undefined ? { id: mandateId, status: "active" } : input.mandate;
    }),
  } satisfies FamilyPaymentMethodReads;
}

function fakeSetupGateway(retrieved: SetupIntentSnapshot | Error = snapshot()) {
  return {
    createCustomer: vi.fn(async () => {
      throw new Error("Un aviso nunca crea un cliente");
    }),
    createSetupIntent: vi.fn(async () => {
      throw new Error("Un aviso nunca crea una preparación");
    }),
    retrieveSetupIntent: vi.fn(async () => {
      if (retrieved instanceof Error) throw retrieved;
      return retrieved;
    }),
    detachPaymentMethod: vi.fn(async (): Promise<void> => undefined),
  } satisfies FamilyPaymentGateway;
}

function handlerInput(objectId: string, overrides: Partial<ProviderEventHandlerInput> = {}): ProviderEventHandlerInput {
  return {
    organizationId,
    account: account(),
    objectId,
    now,
    inboxId,
    eventId: "evt_SyntheticEvent1",
    ...overrides,
  };
}

const NO_EFFECT = { effectType: null, effectId: null };

function expectNoWrites() {
  expect(db.transaction).not.toHaveBeenCalled();
  expect(revokeAuthorization).not.toHaveBeenCalled();
  expect(insertActiveAuthorization).not.toHaveBeenCalled();
  expect(markSetupAttemptCompleted).not.toHaveBeenCalled();
  expect(markSetupAttemptAbandoned).not.toHaveBeenCalled();
  expect(appendAuditEntry).not.toHaveBeenCalled();
  expect(appendOutboxEvent).not.toHaveBeenCalled();
}

const permissionError = () =>
  Object.assign(new Error("No such account: el texto de Stripe no se registra"), {
    type: "StripePermissionError",
    code: "account_invalid",
  });
const transientError = () =>
  Object.assign(new Error("Stripe no responde"), { type: "StripeConnectionError", code: undefined });

describe("avisos de Stripe sobre el método de pago (Tarea 8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
    vi.mocked(isFamilyPaymentMethodsStorageAvailable).mockResolvedValue(true);
    vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(true);
    vi.mocked(findConnectAccountForOrganization).mockResolvedValue(account());
    vi.mocked(loadOrganizationPlanState).mockResolvedValue({ entitlement: entitlement("network"), subscription: null });
    vi.mocked(loadOrganizationName).mockResolvedValue("Club Sintético");
    vi.mocked(findActiveAuthorizationByPaymentMethod).mockResolvedValue(authorization());
    vi.mocked(findActiveAuthorizationByMandate).mockResolvedValue(sepaAuthorization());
    vi.mocked(lockActiveAuthorizationById).mockResolvedValue(authorization());
    vi.mocked(findSetupAttemptByReference).mockResolvedValue(setupAttempt());
    vi.mocked(isCurrentFamilyPayer).mockResolvedValue(true);
    vi.mocked(lockOrganizationForPaymentMethods).mockResolvedValue(true);
    vi.mocked(lockSetupAttempt).mockResolvedValue(setupAttempt());
    vi.mocked(lockActiveAuthorization).mockResolvedValue(null);
    vi.mocked(insertActiveAuthorization).mockResolvedValue(
      authorization({ id: newAuthorizationId, paymentMethodReference: "pm_SyntheticNew" })
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("payment_method.detached", () => {
    it("payment_method.detached de un pm_ activo → revoked; el siguiente cobro no sale", async () => {
      const gateway = fakeReads({ paymentMethod: { id: cardMethod, customer: null } });

      expect(await processPaymentMethodEvent(handlerInput(cardMethod), { gateway })).toEqual({
        effectType: AUTHORIZATION_EFFECT_TYPE,
        effectId: authorizationId,
      });

      // Se busca solo en esa academia y esa cuenta, y se relee en su cuenta conectada.
      expect(findActiveAuthorizationByPaymentMethod).toHaveBeenCalledWith(expect.anything(), {
        organizationId,
        accountRowId,
        paymentMethodReference: cardMethod,
      });
      expect(gateway.retrievePaymentMethod).toHaveBeenCalledWith({ connectedAccount, paymentMethodId: cardMethod });
      expect(gateway.retrieveMandate).not.toHaveBeenCalled();
      // Bloqueada y revocada: deja de estar activa, así que el cobro (que solo
      // usa autorizaciones activas) ya no la reclama.
      expect(lockActiveAuthorizationById).toHaveBeenCalledWith(tx, { organizationId, accountRowId, authorizationId });
      // Orden único: primero la academia, después la autorización.
      expect(lockOrganizationForPaymentMethods).toHaveBeenCalledWith(tx, organizationId);
      expect(vi.mocked(lockOrganizationForPaymentMethods).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(lockActiveAuthorizationById).mock.invocationCallOrder[0]
      );
      // Stripe se leyó antes de abrir la transacción, nunca dentro.
      expect(gateway.retrievePaymentMethod.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(db.transaction).mock.invocationCallOrder[0]
      );
      expect(revokeAuthorization).toHaveBeenCalledWith(tx, { organizationId, authorizationId, now });
      expect(appendAuditEntry).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          actorUserId: null,
          action: "family_payment_methods.authorization_revoked",
          targetId: authorizationId,
          idempotencyKey: `family-payment-methods:authorization-revoked:${authorizationId}`,
          metadata: expect.objectContaining({
            actor: "system",
            reason: "detached_in_stripe",
            actor_type: "system",
            job_key: JOB_KEY,
          }),
        })
      );
      expect(appendOutboxEvent).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          eventName: "family_payment_methods.authorization_revoked",
          aggregateId: authorizationId,
          payload: expect.objectContaining({ actor: "system", reason: "detached_in_stripe" }),
        })
      );
      // Nunca se vuelve a desligar en Stripe ni se usa el adaptador real.
      expect(getStripeClient).not.toHaveBeenCalled();

      // El mismo aviso otra vez (o en otro orden): ya no hay activa con ese pm_ → nada.
      vi.clearAllMocks();
      vi.mocked(isFamilyPaymentMethodsStorageAvailable).mockResolvedValue(true);
      vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(true);
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(account());
      vi.mocked(findActiveAuthorizationByPaymentMethod).mockResolvedValue(null);
      expect(await processPaymentMethodEvent(handlerInput(cardMethod), { gateway })).toEqual(NO_EFFECT);
      expect(gateway.retrievePaymentMethod).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("payment_method.detached de un pm_ que Stripe aún tiene ligado → none", async () => {
      const gateway = fakeReads({ paymentMethod: { id: cardMethod, customer: "cus_Synthetic1" } });
      expect(await processPaymentMethodEvent(handlerInput(cardMethod), { gateway })).toEqual(NO_EFFECT);
      expect(gateway.retrievePaymentMethod).toHaveBeenCalledTimes(1);
      expectNoWrites();
    });

    it("un pm_ que Stripe ya no tiene (resource_missing) también se revoca", async () => {
      const gateway = fakeReads({ paymentMethod: null });
      expect(await revokeAuthorizationFromProvider(
        { organizationId, accountRowId, paymentMethodId: cardMethod, reason: "detached_in_stripe", now },
        { gateway }
      )).toEqual({ outcome: "revoked", authorizationId });
      expect(revokeAuthorization).toHaveBeenCalledTimes(1);
    });

    it("un pm_ sin autorización activa en Zaltyko (otra cosa de la academia) → none sin leer Stripe", async () => {
      vi.mocked(findActiveAuthorizationByPaymentMethod).mockResolvedValue(null);
      const gateway = fakeReads({ paymentMethod: { id: "pm_SyntheticOther", customer: null } });
      expect(await processPaymentMethodEvent(handlerInput("pm_SyntheticOther"), { gateway })).toEqual(NO_EFFECT);
      expect(gateway.retrievePaymentMethod).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("aviso de una cuenta que no es la de la academia → none sin buscar ni leer Stripe", async () => {
      const gateway = fakeReads({ paymentMethod: { id: cardMethod, customer: null } });
      const foreign = handlerInput(cardMethod, { account: account({ id: otherAccountRowId }) });
      expect(await processPaymentMethodEvent(foreign, { gateway })).toEqual(NO_EFFECT);
      expect(findConnectAccountForOrganization).toHaveBeenCalledWith(expect.anything(), organizationId, "test");
      expect(findActiveAuthorizationByPaymentMethod).not.toHaveBeenCalled();
      expect(gateway.retrievePaymentMethod).not.toHaveBeenCalled();
      expectNoWrites();
      // Solo ids en el registro.
      expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { organizationId, accountRowId: otherAccountRowId });
    });

    it("otro camino la revocó entre la lectura y el cerrojo → none, sin auditoría", async () => {
      vi.mocked(lockActiveAuthorizationById).mockResolvedValue(null);
      const gateway = fakeReads({ paymentMethod: { id: cardMethod, customer: null } });
      expect(await processPaymentMethodEvent(handlerInput(cardMethod), { gateway })).toEqual(NO_EFFECT);
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(revokeAuthorization).not.toHaveBeenCalled();
      expect(appendAuditEntry).not.toHaveBeenCalled();
    });

    it("Stripe sin permiso sobre la cuenta → none y solo nombre y código en el registro", async () => {
      const gateway = fakeReads({ paymentMethod: permissionError() });
      expect(await processPaymentMethodEvent(handlerInput(cardMethod), { gateway })).toEqual(NO_EFFECT);
      expectNoWrites();
      expect(logger.warn).toHaveBeenCalledWith(
        "Pago automático: Stripe no deja leer el método de un aviso; sin efecto",
        {
          organizationId,
          authorizationId,
          accountId: connectedAccount,
          paymentMethodId: cardMethod,
          errorName: "StripePermissionError",
          errorCode: "account_invalid",
        }
      );
      expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("texto de Stripe");
    });

    it("error pasajero de Stripe → se lanza sin escribir (el evento queda failed y Stripe lo reenvía)", async () => {
      const failure = transientError();
      const gateway = fakeReads({ paymentMethod: failure });
      await expect(processPaymentMethodEvent(handlerInput(cardMethod), { gateway })).rejects.toBe(failure);
      expectNoWrites();
    });

    it("no exige la bandera de esta fase (dejar de cobrar siempre se puede), pero sí clave de test", async () => {
      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "false");
      const gateway = fakeReads({ paymentMethod: { id: cardMethod, customer: null } });
      expect(await processPaymentMethodEvent(handlerInput(cardMethod), { gateway })).toEqual({
        effectType: AUTHORIZATION_EFFECT_TYPE,
        effectId: authorizationId,
      });

      vi.clearAllMocks();
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_synthetic");
      expect(await processPaymentMethodEvent(handlerInput(cardMethod), { gateway })).toEqual(NO_EFFECT);
      expect(isFamilyPaymentMethodsStorageAvailable).not.toHaveBeenCalled();
      expect(findConnectAccountForOrganization).not.toHaveBeenCalled();
      expect(gateway.retrievePaymentMethod).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("sin almacenamiento de la Fase 2 → none sin tocar nada", async () => {
      vi.mocked(isFamilyPaymentMethodsStorageAvailable).mockResolvedValue(false);
      const gateway = fakeReads({ paymentMethod: { id: cardMethod, customer: null } });
      expect(await processPaymentMethodEvent(handlerInput(cardMethod), { gateway })).toEqual(NO_EFFECT);
      expect(findConnectAccountForOrganization).not.toHaveBeenCalled();
      expectNoWrites();
    });
  });

  describe("mandate.updated", () => {
    beforeEach(() => {
      vi.mocked(lockActiveAuthorizationById).mockResolvedValue(sepaAuthorization());
    });

    it("mandate.updated inactive → domiciliación revocada; active → none", async () => {
      const active = fakeReads({ mandate: { id: mandateId, status: "active" } });
      expect(await processMandateEvent(handlerInput(mandateId), { gateway: active })).toEqual(NO_EFFECT);
      expect(findActiveAuthorizationByMandate).toHaveBeenCalledWith(expect.anything(), {
        organizationId,
        accountRowId,
        mandateReference: mandateId,
      });
      expect(active.retrieveMandate).toHaveBeenCalledWith({ connectedAccount, mandateId });
      expect(active.retrievePaymentMethod).not.toHaveBeenCalled();
      expectNoWrites();

      // `pending` tampoco dice que la orden ya no valga.
      const pending = fakeReads({ mandate: { id: mandateId, status: "pending" } });
      expect(await processMandateEvent(handlerInput(mandateId), { gateway: pending })).toEqual(NO_EFFECT);
      expectNoWrites();

      const inactive = fakeReads({ mandate: { id: mandateId, status: "inactive" } });
      expect(await processMandateEvent(handlerInput(mandateId), { gateway: inactive })).toEqual({
        effectType: AUTHORIZATION_EFFECT_TYPE,
        effectId: authorizationId,
      });
      expect(lockActiveAuthorizationById).toHaveBeenCalledWith(tx, { organizationId, accountRowId, authorizationId });
      expect(revokeAuthorization).toHaveBeenCalledWith(tx, { organizationId, authorizationId, now });
      expect(appendAuditEntry).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          actorUserId: null,
          metadata: expect.objectContaining({
            actor: "system",
            reason: "mandate_inactive",
            kind: "sepa_debit",
            actor_type: "system",
            job_key: JOB_KEY,
          }),
        })
      );
      expect(appendOutboxEvent).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ payload: expect.objectContaining({ actor: "system", reason: "mandate_inactive" }) })
      );
    });

    it("con la domiciliación del cobro automático apagada por su bandera, el aviso de la orden se atiende igual", async () => {
      vi.stubEnv("ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED", "false");
      const inactive = fakeReads({ mandate: { id: mandateId, status: "inactive" } });
      expect(await processMandateEvent(handlerInput(mandateId), { gateway: inactive })).toMatchObject({
        effectType: AUTHORIZATION_EFFECT_TYPE,
      });
    });

    it("una orden que Stripe no encuentra no se da por perdida → none", async () => {
      const missing = fakeReads({ mandate: null });
      expect(await processMandateEvent(handlerInput(mandateId), { gateway: missing })).toEqual(NO_EFFECT);
      expectNoWrites();
    });

    it("una orden sin autorización activa → none sin leer Stripe", async () => {
      vi.mocked(findActiveAuthorizationByMandate).mockResolvedValue(null);
      const inactive = fakeReads({ mandate: { id: mandateId, status: "inactive" } });
      expect(await processMandateEvent(handlerInput(mandateId), { gateway: inactive })).toEqual(NO_EFFECT);
      expect(inactive.retrieveMandate).not.toHaveBeenCalled();
      expectNoWrites();
    });
  });

  describe("setup_intent.succeeded (decisión 12 del ADR)", () => {
    it("setup_intent.succeeded con el navegador cerrado → autorización activa una sola vez", async () => {
      const gateway = fakeSetupGateway();

      expect(await processSetupIntentEvent(handlerInput(setupIntentId), { gateway })).toEqual({
        effectType: AUTHORIZATION_EFFECT_TYPE,
        effectId: newAuthorizationId,
      });
      expect(findSetupAttemptByReference).toHaveBeenCalledWith(expect.anything(), {
        organizationId,
        accountRowId,
        setupReference: setupIntentId,
      });
      expect(gateway.retrieveSetupIntent).toHaveBeenCalledWith({ connectedAccount, setupIntentId });
      expect(lockSetupAttempt).toHaveBeenCalledWith(tx, { organizationId, attemptId });
      expect(lockOrganizationForPaymentMethods).toHaveBeenCalledWith(tx, organizationId);
      expect(vi.mocked(lockOrganizationForPaymentMethods).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(lockSetupAttempt).mock.invocationCallOrder[0]
      );
      expect(gateway.retrieveSetupIntent.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(db.transaction).mock.invocationCallOrder[0]
      );
      expect(insertActiveAuthorization).toHaveBeenCalledTimes(1);
      // La misma activación que desde el navegador: la evidencia del intento.
      expect(insertActiveAuthorization).toHaveBeenCalledWith(tx, {
        organizationId,
        familyId,
        familyPayerId,
        accountRowId,
        setupReference: setupIntentId,
        paymentMethodReference: "pm_SyntheticNew",
        mandateReference: null,
        kind: "card",
        consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
        consentEvidenceReference: `family_payment_setup_attempts:${attemptId}`,
        consentEvidenceSha256: "b".repeat(64),
        consentedAt: new Date("2026-11-16T11:55:00.000Z"),
        consentedByGuardianId: guardianId,
        now,
      });
      expect(markSetupAttemptCompleted).toHaveBeenCalledWith(tx, {
        organizationId,
        attemptId,
        authorizationId: newAuthorizationId,
        now,
      });
      expect(appendAuditEntry).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          actorUserId: null,
          action: "family_payment_methods.authorization_activated",
          targetId: newAuthorizationId,
          metadata: expect.objectContaining({ attemptId, actor: "system", actor_type: "system", job_key: JOB_KEY }),
        })
      );
      expect(appendOutboxEvent).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          eventName: "family_payment_methods.authorization_activated",
          aggregateId: newAuthorizationId,
          payload: expect.objectContaining({ actor: "system", attemptId }),
        })
      );
      expect(gateway.detachPaymentMethod).not.toHaveBeenCalled();

      // El reenvío del aviso: el intento ya está completado → sin Stripe ni escrituras.
      vi.mocked(findSetupAttemptByReference).mockResolvedValue(
        setupAttempt({ status: "completed", authorizationId: newAuthorizationId })
      );
      expect(await processSetupIntentEvent(handlerInput(setupIntentId), { gateway })).toEqual(NO_EFFECT);
      expect(gateway.retrieveSetupIntent).toHaveBeenCalledTimes(1);
      expect(insertActiveAuthorization).toHaveBeenCalledTimes(1);
      expect(appendAuditEntry).toHaveBeenCalledTimes(1);
    });

    it("setup_intent.succeeded de una preparación ya completada → none", async () => {
      // Ya completada (por el navegador) antes de llegar el aviso.
      vi.mocked(findSetupAttemptByReference).mockResolvedValue(
        setupAttempt({ status: "completed", authorizationId: newAuthorizationId })
      );
      const gateway = fakeSetupGateway();
      expect(await processSetupIntentEvent(handlerInput(setupIntentId), { gateway })).toEqual(NO_EFFECT);
      expect(gateway.retrieveSetupIntent).not.toHaveBeenCalled();
      expectNoWrites();

      // El navegador la completa mientras el aviso espera el cerrojo del intento.
      vi.mocked(findSetupAttemptByReference).mockResolvedValue(setupAttempt());
      vi.mocked(lockSetupAttempt).mockResolvedValue(setupAttempt({ status: "completed", authorizationId: newAuthorizationId }));
      expect(
        await completeFamilyPaymentSetupFromProvider({ organizationId, accountRowId, setupIntentId, now }, { gateway })
      ).toEqual({ outcome: "none" });
      expect(insertActiveAuthorization).not.toHaveBeenCalled();
      expect(appendAuditEntry).not.toHaveBeenCalled();
    });

    it("Tarea M (punto 11): quien empezó la preparación ya no es la persona pagadora → none sin leer Stripe ni escribir", async () => {
      vi.mocked(isCurrentFamilyPayer).mockResolvedValue(false);
      const gateway = fakeSetupGateway();
      expect(
        await completeFamilyPaymentSetupFromProvider({ organizationId, accountRowId, setupIntentId, now }, { gateway })
      ).toEqual({ outcome: "none" });
      expect(isCurrentFamilyPayer).toHaveBeenCalledWith(expect.anything(), {
        organizationId,
        familyId,
        familyPayerId,
        guardianId,
        now,
      });
      expect(gateway.retrieveSetupIntent).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        "Pago automático: preparación terminada en Stripe de quien ya no es la persona pagadora; sin efecto",
        { organizationId, setupIntentId, attemptId }
      );
      expectNoWrites();
    });

    it("una preparación abandonada o que no es de Zaltyko → none sin leer Stripe", async () => {
      const gateway = fakeSetupGateway();
      vi.mocked(findSetupAttemptByReference).mockResolvedValue(setupAttempt({ status: "abandoned" }));
      expect(await processSetupIntentEvent(handlerInput(setupIntentId), { gateway })).toEqual(NO_EFFECT);
      vi.mocked(findSetupAttemptByReference).mockResolvedValue(null);
      expect(await processSetupIntentEvent(handlerInput("seti_SyntheticForeign"), { gateway })).toEqual(NO_EFFECT);
      expect(gateway.retrieveSetupIntent).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("Stripe aún no la da por terminada → pending sin escribir; fallida → none sin marcarla abandonada", async () => {
      const processing = fakeSetupGateway(snapshot({ status: "processing", paymentMethod: null, paymentMethodType: null }));
      expect(
        await completeFamilyPaymentSetupFromProvider({ organizationId, accountRowId, setupIntentId, now }, { gateway: processing })
      ).toEqual({ outcome: "pending" });
      expect(await processSetupIntentEvent(handlerInput(setupIntentId), { gateway: processing })).toEqual(NO_EFFECT);

      // La familia puede seguir en el formulario: el aviso no la abandona.
      const failed = fakeSetupGateway(
        snapshot({ status: "requires_payment_method", paymentMethod: null, paymentMethodType: null, hasLastSetupError: true })
      );
      expect(
        await completeFamilyPaymentSetupFromProvider({ organizationId, accountRowId, setupIntentId, now }, { gateway: failed })
      ).toEqual({ outcome: "none" });
      expectNoWrites();
    });

    it("la preparación de Stripe no es la del intento (otro cliente, otro intento, otro tipo) → none sin escribir", async () => {
      for (const retrieved of [
        snapshot({ customer: "cus_Other" }),
        snapshot({ metadataAttemptId: "10000000-0000-4000-8000-000000000999" }),
        snapshot({ paymentMethodType: "sepa_debit" }),
        snapshot({ id: "seti_Other" }),
      ]) {
        expect(
          await processSetupIntentEvent(handlerInput(setupIntentId), { gateway: fakeSetupGateway(retrieved) })
        ).toEqual(NO_EFFECT);
      }
      expectNoWrites();
      expect(logger.warn).toHaveBeenCalledWith("Pago automático: la preparación de Stripe no es la del intento; sin efecto", {
        organizationId,
        setupIntentId,
        attemptId,
      });
    });

    it("las mismas puertas que el navegador: bandera apagada, plan Free o tipo que la academia ya no acepta → none", async () => {
      const gateway = fakeSetupGateway();

      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "false");
      expect(await processSetupIntentEvent(handlerInput(setupIntentId), { gateway })).toEqual(NO_EFFECT);
      expect(findSetupAttemptByReference).not.toHaveBeenCalled();
      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "true");

      vi.mocked(loadOrganizationPlanState).mockResolvedValueOnce({ entitlement: entitlement("free"), subscription: null });
      expect(await processSetupIntentEvent(handlerInput(setupIntentId), { gateway })).toEqual(NO_EFFECT);

      vi.mocked(findSetupAttemptByReference).mockResolvedValue(setupAttempt({ paymentMethodKind: "sepa_debit" }));
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(account({ sepaDebitPaymentsCapabilityStatus: "inactive" }));
      expect(await processSetupIntentEvent(handlerInput(setupIntentId), { gateway })).toEqual(NO_EFFECT);

      // Cuenta de la academia distinta de la del aviso.
      vi.mocked(findSetupAttemptByReference).mockResolvedValue(setupAttempt());
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(account({ id: otherAccountRowId }));
      expect(await processSetupIntentEvent(handlerInput(setupIntentId), { gateway })).toEqual(NO_EFFECT);

      expect(gateway.retrieveSetupIntent).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("cambio de método: revoca la anterior con el sistema como actor y la desliga después del commit", async () => {
      vi.mocked(lockActiveAuthorization).mockResolvedValue(authorization({ paymentMethodReference: "pm_SyntheticOld" }));
      const gateway = fakeSetupGateway();
      expect(await processSetupIntentEvent(handlerInput(setupIntentId), { gateway })).toEqual({
        effectType: AUTHORIZATION_EFFECT_TYPE,
        effectId: newAuthorizationId,
      });
      // Tarea M (punto 12): se desliga después de completar la preparación y
      // de revocar la anterior (dentro de la transacción), nunca antes.
      const detachOrder = gateway.detachPaymentMethod.mock.invocationCallOrder[0];
      expect(detachOrder).toBeGreaterThan(vi.mocked(markSetupAttemptCompleted).mock.invocationCallOrder[0]);
      expect(detachOrder).toBeGreaterThan(vi.mocked(revokeAuthorization).mock.invocationCallOrder[0]);
      expect(revokeAuthorization).toHaveBeenCalledWith(tx, { organizationId, authorizationId, now });
      expect(appendOutboxEvent).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          eventName: "family_payment_methods.authorization_revoked",
          aggregateId: authorizationId,
          payload: expect.objectContaining({ actor: "system", reason: "replaced" }),
        })
      );
      expect(gateway.detachPaymentMethod).toHaveBeenCalledWith({ connectedAccount, paymentMethod: "pm_SyntheticOld" });
    });

    it("violación del índice único: si el navegador lo completó a la vez → none; si no, se pide reintentar", async () => {
      const unique = Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
      vi.mocked(insertActiveAuthorization).mockRejectedValue(unique);
      vi.mocked(findSetupAttemptByReference)
        .mockResolvedValueOnce(setupAttempt())
        .mockResolvedValueOnce(setupAttempt({ status: "completed", authorizationId: newAuthorizationId }));
      expect(await processSetupIntentEvent(handlerInput(setupIntentId), { gateway: fakeSetupGateway() })).toEqual(NO_EFFECT);

      vi.mocked(findSetupAttemptByReference).mockResolvedValue(setupAttempt());
      await expect(
        processSetupIntentEvent(handlerInput(setupIntentId), { gateway: fakeSetupGateway() })
      ).rejects.toMatchObject({ code: "CONCURRENCY_RETRY", status: 409 });
    });

    it("errores de Stripe: permanente → none; pasajero → se lanza sin escribir", async () => {
      expect(
        await processSetupIntentEvent(handlerInput(setupIntentId), { gateway: fakeSetupGateway(permissionError()) })
      ).toEqual(NO_EFFECT);
      const failure = transientError();
      await expect(
        processSetupIntentEvent(handlerInput(setupIntentId), { gateway: fakeSetupGateway(failure) })
      ).rejects.toBe(failure);
      expectNoWrites();
    });
  });

  describe("entradas y manejadores", () => {
    it("rechaza una combinación incoherente de referencia y motivo sin tocar nada", async () => {
      const gateway = fakeReads();
      await expect(
        revokeAuthorizationFromProvider({ organizationId, accountRowId, mandateId, reason: "detached_in_stripe", now }, { gateway })
      ).rejects.toThrow();
      await expect(
        revokeAuthorizationFromProvider(
          { organizationId, accountRowId, paymentMethodId: cardMethod, mandateId, reason: "mandate_inactive", now },
          { gateway }
        )
      ).rejects.toThrow();
      expect(isFamilyPaymentMethodsStorageAvailable).not.toHaveBeenCalled();
      expect(gateway.retrievePaymentMethod).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("los manejadores por defecto del buzón son los de la Tarea 8", () => {
      expect(DEFAULT_PROVIDER_EVENT_HANDLERS.paymentMethod).toBe(handlePaymentMethodEvent);
      expect(DEFAULT_PROVIDER_EVENT_HANDLERS.mandate).toBe(handleMandateEvent);
      expect(DEFAULT_PROVIDER_EVENT_HANDLERS.setupIntent).toBe(handleSetupIntentEvent);
    });
  });
});

describe("adaptador de Stripe: relecturas del método y de la orden (Tarea 8)", () => {
  function fakeStripe() {
    const fns = { paymentMethodsRetrieve: vi.fn(), mandatesRetrieve: vi.fn() };
    const client = {
      paymentMethods: { retrieve: fns.paymentMethodsRetrieve },
      mandates: { retrieve: fns.mandatesRetrieve },
    } as unknown as Stripe;
    return { client, ...fns };
  }
  const missing = () => Object.assign(new Error("No such payment_method"), { type: "StripeInvalidRequestError", code: "resource_missing" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("método: solo id y cliente, en la cuenta de la academia; nada de dígitos ni titular", async () => {
    const stripe = fakeStripe();
    stripe.paymentMethodsRetrieve.mockResolvedValue({
      id: cardMethod,
      object: "payment_method",
      type: "card",
      customer: null,
      billing_details: { email: "familia@example.com", name: "Titular Sintético" },
      card: { last4: "4242", brand: "visa" },
    });
    const gateway = createStripeFamilyGateway(stripe.client);
    const read = await gateway.retrievePaymentMethod({ connectedAccount, paymentMethodId: cardMethod });
    expect(read).toEqual({ id: cardMethod, customer: null });
    expect(stripe.paymentMethodsRetrieve).toHaveBeenCalledWith(cardMethod, {}, { stripeAccount: connectedAccount });

    stripe.paymentMethodsRetrieve.mockResolvedValue({ id: cardMethod, object: "payment_method", customer: { id: "cus_Synthetic1" } });
    expect(await gateway.retrievePaymentMethod({ connectedAccount, paymentMethodId: cardMethod })).toEqual({
      id: cardMethod,
      customer: "cus_Synthetic1",
    });
    expect(getStripeClient).not.toHaveBeenCalled();
  });

  it("método que no existe → null; cualquier otro error se lanza", async () => {
    const stripe = fakeStripe();
    const gateway = createStripeFamilyGateway(stripe.client);
    stripe.paymentMethodsRetrieve.mockRejectedValueOnce(missing());
    expect(await gateway.retrievePaymentMethod({ connectedAccount, paymentMethodId: cardMethod })).toBeNull();
    const failure = transientError();
    stripe.paymentMethodsRetrieve.mockRejectedValueOnce(failure);
    await expect(gateway.retrievePaymentMethod({ connectedAccount, paymentMethodId: cardMethod })).rejects.toBe(failure);
  });

  it("orden: solo id y estado; la que no existe → null; otro error se lanza", async () => {
    const stripe = fakeStripe();
    const gateway = createStripeFamilyGateway(stripe.client);
    stripe.mandatesRetrieve.mockResolvedValueOnce({
      id: mandateId,
      object: "mandate",
      status: "inactive",
      customer_acceptance: { online: { ip_address: "203.0.113.7", user_agent: "Mozilla/5.0" } },
      payment_method_details: { sepa_debit: { reference: "REF", url: "https://example.invalid" } },
    });
    expect(await gateway.retrieveMandate({ connectedAccount, mandateId })).toEqual({ id: mandateId, status: "inactive" });
    expect(stripe.mandatesRetrieve).toHaveBeenCalledWith(mandateId, {}, { stripeAccount: connectedAccount });

    stripe.mandatesRetrieve.mockRejectedValueOnce(missing());
    expect(await gateway.retrieveMandate({ connectedAccount, mandateId })).toBeNull();
    const failure = transientError();
    stripe.mandatesRetrieve.mockRejectedValueOnce(failure);
    await expect(gateway.retrieveMandate({ connectedAccount, mandateId })).rejects.toBe(failure);
  });

  it("clasifica los errores de lectura solo por nombre y código", () => {
    expect(familyProviderReadFailureOf(missing())).toEqual({
      errorName: "StripeInvalidRequestError",
      errorCode: "resource_missing",
      permanent: true,
    });
    expect(familyProviderReadFailureOf(permissionError())).toEqual({
      errorName: "StripePermissionError",
      errorCode: "account_invalid",
      permanent: true,
    });
    expect(familyProviderReadFailureOf(Object.assign(new Error("x"), { rawType: "permission_error" }))).toMatchObject({
      permanent: true,
    });
    expect(familyProviderReadFailureOf(transientError())).toEqual({
      errorName: "StripeConnectionError",
      errorCode: null,
      permanent: false,
    });
    expect(familyProviderReadFailureOf("texto")).toEqual({ errorName: "unknown", errorCode: null, permanent: false });
  });
});
