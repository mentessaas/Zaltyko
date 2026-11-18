import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { PRODUCTION_SUPABASE_PROJECT_REF } from "@/lib/launch/production-supabase";
import { logger } from "@/lib/logger";
import { loadOrganizationPlanState } from "@/modules/billing/application/plan-state";
import type { EntitlementSnapshot } from "@/modules/billing/domain/plan-eligibility";
import {
  completeFamilyPaymentSetup,
  getFamilyPaymentMethodState,
  getOwnerFamilyPaymentMethodsView,
  listOwnerFamilyPaymentMethods,
  revokeFamilyPaymentMethod,
  revokeFamilyPaymentMethodByOwner,
  startFamilyPaymentSetup,
} from "@/modules/family-payment-methods/application/family-payment-methods-service";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import {
  consentTextSha256,
  FAMILY_PAYMENT_CONSENT_VERSION,
  renderConsentText,
} from "@/modules/family-payment-methods/domain/consent";
import type { SetupIntentSnapshot } from "@/modules/family-payment-methods/domain/setup-verification";
import {
  findActiveAuthorization,
  findLatestCustomerReference,
  findSetupAttemptForPayer,
  insertActiveAuthorization,
  insertSetupAttempt,
  listActiveAuthorizationsForOrganization,
  loadOrganizationName,
  lockActiveAuthorization,
  lockActiveAuthorizationById,
  lockOrganizationForPaymentMethods,
  lockSetupAttempt,
  markSetupAttemptAbandoned,
  markSetupAttemptCompleted,
  resolveFamilyPayer,
  revokeAuthorization,
  type StoredAuthorization,
  type StoredSetupAttempt,
} from "@/modules/family-payment-methods/infrastructure/family-payment-store";
import type { FamilyPaymentGateway } from "@/modules/family-payment-methods/infrastructure/stripe-family-gateway";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
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
 * Pago automático de cuotas (cobro automático, Fase 2): reglas del servicio
 * con base y Stripe simulados. Nunca llama a Stripe: el adaptador real lanza
 * si se usa. Solo datos sintéticos.
 */

const { tx } = vi.hoisted(() => ({ tx: { kind: "tx" } }));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)) },
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
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
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({
  appendAuditEntry: vi.fn(),
  appendOutboxEvent: vi.fn(),
}));
vi.mock("@/modules/payments-connect/infrastructure/connect-account-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/payments-connect/infrastructure/connect-account-store")>()),
  findConnectAccountForOrganization: vi.fn(),
}));
vi.mock("@/modules/family-payment-methods/infrastructure/stripe-family-gateway", async (importOriginal) => ({
  // Las claves de idempotencia son puras: se conservan las reales.
  ...(await importOriginal<typeof import("@/modules/family-payment-methods/infrastructure/stripe-family-gateway")>()),
  createStripeFamilyGateway: vi.fn(() => {
    throw new Error("El adaptador real de Stripe no debe usarse en tests");
  }),
}));
vi.mock("@/modules/family-payment-methods/infrastructure/family-payment-store", () => ({
  resolveFamilyPayer: vi.fn(),
  loadOrganizationName: vi.fn(),
  findLatestCustomerReference: vi.fn(),
  insertSetupAttempt: vi.fn(),
  findSetupAttemptForPayer: vi.fn(),
  lockOrganizationForPaymentMethods: vi.fn(),
  lockSetupAttempt: vi.fn(),
  markSetupAttemptAbandoned: vi.fn(),
  markSetupAttemptCompleted: vi.fn(),
  findActiveAuthorization: vi.fn(),
  lockActiveAuthorization: vi.fn(),
  lockActiveAuthorizationById: vi.fn(),
  insertActiveAuthorization: vi.fn(),
  revokeAuthorization: vi.fn(),
  listActiveAuthorizationsForOrganization: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000101";
const organizationId = "10000000-0000-4000-8000-000000000001";
const familyId = "10000000-0000-4000-8000-000000000301";
const familyPayerId = "10000000-0000-4000-8000-000000000401";
const guardianId = "10000000-0000-4000-8000-000000000501";
const accountRowId = "10000000-0000-4000-8000-000000000901";
const attemptId = "10000000-0000-4000-8000-000000000601";
const authorizationId = "10000000-0000-4000-8000-000000000701";
const previousAuthorizationId = "10000000-0000-4000-8000-000000000702";
const connectedAccount = "acct_SyntheticA1";
const academyName = "Club Sintético";
const now = new Date("2026-11-16T12:00:00.000Z");

const family = { userId, organizationId, familyId, now };

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

function ownerScope(
  role: OwnerScope["member"]["role"] = "owner",
  locationScopeMode: OwnerScope["member"]["locationScopeMode"] = "all"
): OwnerScope {
  return {
    organization: { id: organizationId, name: academyName, defaultCurrency: "EUR" },
    member: { id: "10000000-0000-4000-8000-000000000201", role, locationScopeMode },
    locations: [],
    selectedLocationId: null,
    canViewOrganizationAggregate: true,
  };
}

function attempt(overrides: Partial<StoredSetupAttempt> = {}): StoredSetupAttempt {
  return {
    id: attemptId,
    organizationId,
    familyId,
    familyPayerId,
    guardianId,
    paymentProviderAccountId: accountRowId,
    paymentMethodKind: "card",
    providerCustomerReference: "cus_Synthetic1",
    providerSetupReference: "seti_Synthetic1",
    consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
    consentTextSha256: "b".repeat(64),
    consentedAt: new Date("2026-11-16T11:55:00.000Z"),
    status: "open",
    authorizationId: null,
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
    paymentMethodReference: "pm_SyntheticNew",
    paymentMethodKind: "card",
    consentedAt: new Date("2026-11-16T11:55:00.000Z"),
    ...overrides,
  };
}

function snapshot(overrides: Partial<SetupIntentSnapshot> = {}): SetupIntentSnapshot {
  return {
    id: "seti_Synthetic1",
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

function fakeGateway(retrieved: SetupIntentSnapshot = snapshot()) {
  return {
    createCustomer: vi.fn(async () => ({ id: "cus_SyntheticCreated" })),
    createSetupIntent: vi.fn(async () => ({ id: "seti_SyntheticNew", clientSecret: "seti_SyntheticNew_secret_x" })),
    retrieveSetupIntent: vi.fn(async () => retrieved),
    detachPaymentMethod: vi.fn(async (): Promise<void> => undefined),
  } satisfies FamilyPaymentGateway;
}

const startInput = {
  ...family,
  kind: "card" as const,
  consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
  consentAccepted: true as const,
  clientIp: "203.0.113.77",
  userAgent: "Mozilla/5.0 (Synthetic)\u0007 Test",
};

function expectNoWrites() {
  expect(db.transaction).not.toHaveBeenCalled();
  expect(markSetupAttemptAbandoned).not.toHaveBeenCalled();
  expect(appendAuditEntry).not.toHaveBeenCalled();
  expect(appendOutboxEvent).not.toHaveBeenCalled();
}

describe("servicio de pago automático de la familia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
    vi.mocked(isFamilyPaymentMethodsStorageAvailable).mockResolvedValue(true);
    vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(true);
    vi.mocked(resolveFamilyPayer).mockResolvedValue({ guardianId, familyPayerId });
    vi.mocked(findConnectAccountForOrganization).mockResolvedValue(account());
    vi.mocked(loadOrganizationPlanState).mockResolvedValue({ entitlement: entitlement("network"), subscription: null });
    vi.mocked(loadOrganizationName).mockResolvedValue(academyName);
    vi.mocked(findActiveAuthorization).mockResolvedValue(null);
    vi.mocked(findLatestCustomerReference).mockResolvedValue(null);
    vi.mocked(insertSetupAttempt).mockImplementation(async () => attempt({ providerSetupReference: "seti_SyntheticNew" }));
    vi.mocked(findSetupAttemptForPayer).mockResolvedValue(attempt());
    vi.mocked(lockOrganizationForPaymentMethods).mockResolvedValue(true);
    vi.mocked(lockSetupAttempt).mockResolvedValue(attempt());
    vi.mocked(lockActiveAuthorization).mockResolvedValue(null);
    vi.mocked(insertActiveAuthorization).mockResolvedValue(authorization());
    vi.mocked(markSetupAttemptAbandoned).mockResolvedValue(true);
    vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getFamilyPaymentMethodState con la bandera apagada", () => {
    beforeEach(() => {
      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "false");
    });

    it("con clave Live responde flag_off sin tocar la base", async () => {
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_synthetic");
      expect(await getFamilyPaymentMethodState(family)).toEqual({ kind: "unavailable", reason: "flag_off" });
      expect(isFamilyPaymentMethodsStorageAvailable).not.toHaveBeenCalled();
      expect(resolveFamilyPayer).not.toHaveBeenCalled();
    });

    it("contra la base de producción responde flag_off sin tocar la base", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
      expect(await getFamilyPaymentMethodState(family)).toEqual({ kind: "unavailable", reason: "flag_off" });
      expect(isFamilyPaymentMethodsStorageAvailable).not.toHaveBeenCalled();
      expect(resolveFamilyPayer).not.toHaveBeenCalled();
    });

    it("sin almacenamiento responde flag_off sin leer a la persona pagadora", async () => {
      vi.mocked(isFamilyPaymentMethodsStorageAvailable).mockResolvedValue(false);
      expect(await getFamilyPaymentMethodState(family)).toEqual({ kind: "unavailable", reason: "flag_off" });
      expect(resolveFamilyPayer).not.toHaveBeenCalled();
    });

    it("quien no es la pagadora ve flag_off", async () => {
      vi.mocked(resolveFamilyPayer).mockResolvedValue(null);
      expect(await getFamilyPaymentMethodState(family)).toEqual({ kind: "unavailable", reason: "flag_off" });
      expect(findConnectAccountForOrganization).not.toHaveBeenCalled();
    });

    it("sin método guardado responde flag_off: nunca ofrece guardar uno", async () => {
      expect(await getFamilyPaymentMethodState(family)).toEqual({ kind: "unavailable", reason: "flag_off" });
      expect(findActiveAuthorization).toHaveBeenCalledWith(expect.anything(), { organizationId, accountRowId, familyPayerId });
      expect(loadOrganizationPlanState).not.toHaveBeenCalled();
    });

    it("sin cuenta conectada responde flag_off", async () => {
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(null);
      expect(await getFamilyPaymentMethodState(family)).toEqual({ kind: "unavailable", reason: "flag_off" });
      expect(findActiveAuthorization).not.toHaveBeenCalled();
    });

    it("con método guardado lo enseña sin métodos para cambiar (solo se puede revocar)", async () => {
      // Ni la cuenta lista ni el plan de pago importan para enseñarlo.
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(account({ status: "restricted" }));
      vi.mocked(loadOrganizationPlanState).mockResolvedValue({ entitlement: entitlement("free"), subscription: null });
      vi.mocked(findActiveAuthorization).mockResolvedValue(authorization({ paymentMethodKind: "sepa_debit" }));
      expect(await getFamilyPaymentMethodState(family)).toEqual({
        kind: "active",
        method: "sepa_debit",
        since: "2026-11-16T11:55:00.000Z",
        kinds: [],
        academyName,
        consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
        consentTexts: {},
      });
      expect(resolveFamilyPayer).toHaveBeenCalledWith(expect.anything(), { userId, organizationId, familyId, now });
      expect(findConnectAccountForOrganization).toHaveBeenCalledWith(expect.anything(), organizationId, "test");
      expect(loadOrganizationPlanState).not.toHaveBeenCalled();
    });
  });

  describe("getFamilyPaymentMethodState", () => {

    it("con clave Live responde live_not_released sin tocar la base", async () => {
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_synthetic");
      expect(await getFamilyPaymentMethodState(family)).toEqual({ kind: "unavailable", reason: "live_not_released" });
      expect(resolveFamilyPayer).not.toHaveBeenCalled();
    });

    it("sin la tabla del candidato (o sin las columnas de la Fase 1) responde storage_missing", async () => {
      vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(false);
      expect(await getFamilyPaymentMethodState(family)).toEqual({ kind: "unavailable", reason: "storage_missing" });
      expect(resolveFamilyPayer).not.toHaveBeenCalled();
    });

    it("quien no es la pagadora ve not_payer y nada de la academia", async () => {
      vi.mocked(resolveFamilyPayer).mockResolvedValue(null);
      expect(await getFamilyPaymentMethodState(family)).toEqual({ kind: "unavailable", reason: "not_payer" });
      expect(resolveFamilyPayer).toHaveBeenCalledWith(expect.anything(), { userId, organizationId, familyId, now });
      expect(findConnectAccountForOrganization).not.toHaveBeenCalled();
    });

    it("sin método guardado ofrece los métodos con su texto", async () => {
      const state = await getFamilyPaymentMethodState(family);
      expect(state).toEqual({
        kind: "none",
        kinds: ["card", "sepa_debit"],
        academyName,
        consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
        consentTexts: {
          card: renderConsentText({ kind: "card", academyName, version: FAMILY_PAYMENT_CONSENT_VERSION }),
          sepa_debit: renderConsentText({ kind: "sepa_debit", academyName, version: FAMILY_PAYMENT_CONSENT_VERSION }),
        },
      });
      expect(findConnectAccountForOrganization).toHaveBeenCalledWith(expect.anything(), organizationId, "test");
    });

    it("sin domiciliación activa en Stripe solo ofrece tarjeta", async () => {
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(account({ sepaDebitPaymentsCapabilityStatus: "pending" }));
      const state = await getFamilyPaymentMethodState(family);
      expect(state).toMatchObject({ kind: "none", kinds: ["card"] });
      expect(Object.keys((state as { consentTexts: object }).consentTexts)).toEqual(["card"]);
    });

    it("con método activo dice cuál y desde cuándo", async () => {
      vi.mocked(findActiveAuthorization).mockResolvedValue(authorization({ paymentMethodKind: "sepa_debit" }));
      expect(await getFamilyPaymentMethodState(family)).toMatchObject({
        kind: "active",
        method: "sepa_debit",
        since: "2026-11-16T11:55:00.000Z",
        kinds: ["card", "sepa_debit"],
      });
      expect(findActiveAuthorization).toHaveBeenCalledWith(expect.anything(), {
        organizationId,
        accountRowId,
        familyPayerId,
      });
    });

    it("si la academia pierde el plan de pago, la familia sigue viendo su método pero no puede cambiarlo", async () => {
      vi.mocked(loadOrganizationPlanState).mockResolvedValue({ entitlement: entitlement("free"), subscription: null });
      vi.mocked(findActiveAuthorization).mockResolvedValue(authorization());
      expect(await getFamilyPaymentMethodState(family)).toEqual({
        kind: "active",
        method: "card",
        since: "2026-11-16T11:55:00.000Z",
        kinds: [],
        academyName,
        consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
        consentTexts: {},
      });

      vi.mocked(findActiveAuthorization).mockResolvedValue(null);
      expect(await getFamilyPaymentMethodState(family)).toEqual({ kind: "unavailable", reason: "paid_plan_required" });
    });

    it("academia sin cuenta conectada: account_not_ready", async () => {
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(null);
      expect(await getFamilyPaymentMethodState(family)).toEqual({ kind: "unavailable", reason: "account_not_ready" });
      expect(findActiveAuthorization).not.toHaveBeenCalled();
    });
  });

  describe("startFamilyPaymentSetup", () => {
    it("sin aceptar el texto responde 400 sin tocar la base ni Stripe", async () => {
      const gateway = fakeGateway();
      await expect(
        startFamilyPaymentSetup({ ...startInput, consentAccepted: false as unknown as true }, { gateway })
      ).rejects.toMatchObject({ code: "FAMILY_PAYMENT_CONSENT_REQUIRED", status: 400 });
      const { consentAccepted: _omitted, ...withoutConsent } = startInput;
      await expect(
        startFamilyPaymentSetup(withoutConsent as typeof startInput, { gateway })
      ).rejects.toMatchObject({ code: "FAMILY_PAYMENT_CONSENT_REQUIRED", status: 400 });
      expect(resolveFamilyPayer).not.toHaveBeenCalled();
      expect(gateway.createCustomer).not.toHaveBeenCalled();
      expect(gateway.createSetupIntent).not.toHaveBeenCalled();
    });

    it("con otra versión del texto responde 400 sin llamar a Stripe", async () => {
      const gateway = fakeGateway();
      await expect(
        startFamilyPaymentSetup({ ...startInput, consentVersion: "borrador-2026-01-01" }, { gateway })
      ).rejects.toMatchObject({ code: "FAMILY_PAYMENT_CONSENT_REQUIRED", status: 400 });
      expect(gateway.createSetupIntent).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("orden: función cerrada (503) antes que pagadora (404) antes que academia (503) antes que método (409)", async () => {
      const gateway = fakeGateway();

      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "false");
      vi.mocked(resolveFamilyPayer).mockResolvedValue(null);
      await expect(startFamilyPaymentSetup(startInput, { gateway })).rejects.toMatchObject({
        code: "FEATURE_NOT_AVAILABLE",
        status: 503,
        details: { reason: "flag_off" },
      });
      expect(resolveFamilyPayer).not.toHaveBeenCalled();

      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "true");
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(null);
      await expect(startFamilyPaymentSetup(startInput, { gateway })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
      expect(findConnectAccountForOrganization).not.toHaveBeenCalled();

      vi.mocked(resolveFamilyPayer).mockResolvedValue({ guardianId, familyPayerId });
      await expect(startFamilyPaymentSetup(startInput, { gateway })).rejects.toMatchObject({
        code: "FEATURE_NOT_AVAILABLE",
        status: 503,
        details: { reason: "account_not_ready" },
      });

      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(account({ sepaDebitPaymentsCapabilityStatus: "inactive" }));
      await expect(
        startFamilyPaymentSetup({ ...startInput, kind: "sepa_debit" }, { gateway })
      ).rejects.toMatchObject({ code: "FAMILY_PAYMENT_METHOD_NOT_OFFERED", status: 409 });

      expect(gateway.createCustomer).not.toHaveBeenCalled();
      expect(gateway.createSetupIntent).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("plan Free: 503 paid_plan_required sin Stripe", async () => {
      vi.mocked(loadOrganizationPlanState).mockResolvedValue({ entitlement: entitlement("free"), subscription: null });
      const gateway = fakeGateway();
      await expect(startFamilyPaymentSetup(startInput, { gateway })).rejects.toMatchObject({
        code: "FEATURE_NOT_AVAILABLE",
        details: { reason: "paid_plan_required" },
      });
      expect(gateway.createSetupIntent).not.toHaveBeenCalled();
    });

    it("crea el cliente con clave estable, guarda el intento con la evidencia recortada y no manda IP ni agente a auditoría", async () => {
      const gateway = fakeGateway();
      const result = await startFamilyPaymentSetup(startInput, { gateway });

      expect(result).toEqual({
        clientSecret: "seti_SyntheticNew_secret_x",
        connectedAccount,
        setupIntentId: "seti_SyntheticNew",
      });
      expect(gateway.createCustomer).toHaveBeenCalledWith({
        connectedAccount,
        organizationId,
        familyPayerId,
        idempotencyKey: `zaltyko-family-customer:${accountRowId}:${familyPayerId}`,
      });
      const setupCall = gateway.createSetupIntent.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(setupCall[0]).toMatchObject({
        connectedAccount,
        customer: "cus_SyntheticCreated",
        kind: "card",
        organizationId,
        familyPayerId,
      });
      const newAttemptId = setupCall[0].attemptId as string;
      expect(newAttemptId).toMatch(/^[0-9a-f-]{36}$/);

      const expectedText = renderConsentText({ kind: "card", academyName, version: FAMILY_PAYMENT_CONSENT_VERSION });
      expect(insertSetupAttempt).toHaveBeenCalledWith(tx, {
        id: newAttemptId,
        organizationId,
        familyId,
        familyPayerId,
        guardianId,
        accountRowId,
        kind: "card",
        customerReference: "cus_SyntheticCreated",
        setupReference: "seti_SyntheticNew",
        consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
        consentTextSha256: consentTextSha256(expectedText),
        consentedAt: now,
        clientIpPrefix: "203.0.113.0",
        userAgentExcerpt: "Mozilla/5.0 (Synthetic)  Test",
      });

      const expectedDetails = {
        attemptId: newAttemptId,
        familyId,
        familyPayerId,
        paymentProviderAccountId: accountRowId,
        kind: "card",
        consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
      };
      expect(appendAuditEntry).toHaveBeenCalledWith(tx, expect.objectContaining({
        action: "family_payment_methods.setup_started",
        targetType: "family_payment_authorization",
        actorUserId: userId,
        metadata: expectedDetails,
      }));
      expect(appendOutboxEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
        eventName: "family_payment_methods.setup_started",
        aggregateId: newAttemptId,
        payload: expectedDetails,
      }));
      const written = JSON.stringify([
        vi.mocked(appendAuditEntry).mock.calls,
        vi.mocked(appendOutboxEvent).mock.calls,
      ]);
      expect(written).not.toContain("203.0.113");
      expect(written).not.toContain("Mozilla");
      expect(written).not.toContain("secret");
    });

    it("reutiliza el cliente del último intento de esa persona en esa cuenta", async () => {
      vi.mocked(findLatestCustomerReference).mockResolvedValue("cus_SyntheticPrevious");
      const gateway = fakeGateway();
      await startFamilyPaymentSetup(startInput, { gateway });
      expect(findLatestCustomerReference).toHaveBeenCalledWith(expect.anything(), {
        organizationId,
        accountRowId,
        familyPayerId,
      });
      expect(gateway.createCustomer).not.toHaveBeenCalled();
      expect(gateway.createSetupIntent).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_SyntheticPrevious" }));
    });

    it("si no se puede guardar el intento, avisa con el seti_ y no entrega el clientSecret", async () => {
      vi.mocked(insertSetupAttempt).mockRejectedValue(new Error("insert failed"));
      const gateway = fakeGateway();
      await expect(startFamilyPaymentSetup(startInput, { gateway })).rejects.toThrow("insert failed");
      expect(logger.warn).toHaveBeenCalledWith(
        "Pago automático: preparación creada en Stripe sin guardar",
        expect.objectContaining({ organizationId, setupIntentId: "seti_SyntheticNew" })
      );
      expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("secret");
    });
  });

  describe("completeFamilyPaymentSetup", () => {
    const completeInput = { ...family, setupIntentId: "seti_Synthetic1" };

    it("busca el intento por seti_ y por la persona pagadora; uno ajeno es 404 sin Stripe", async () => {
      vi.mocked(findSetupAttemptForPayer).mockResolvedValue(null);
      const gateway = fakeGateway();
      await expect(completeFamilyPaymentSetup(completeInput, { gateway })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
      expect(findSetupAttemptForPayer).toHaveBeenCalledWith(expect.anything(), {
        organizationId,
        familyId,
        familyPayerId,
        setupReference: "seti_Synthetic1",
      });
      expect(gateway.retrieveSetupIntent).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("ya completado devuelve el resultado sin llamar a Stripe", async () => {
      vi.mocked(findSetupAttemptForPayer).mockResolvedValue(attempt({ status: "completed", authorizationId, paymentMethodKind: "sepa_debit" }));
      const gateway = fakeGateway();
      expect(await completeFamilyPaymentSetup(completeInput, { gateway })).toEqual({ outcome: "active", method: "sepa_debit" });
      expect(gateway.retrieveSetupIntent).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("lee en Stripe la preparación guardada en el intento", async () => {
      const gateway = fakeGateway(snapshot({ status: "processing", paymentMethod: null, paymentMethodType: null }));
      expect(await completeFamilyPaymentSetup(completeInput, { gateway })).toEqual({ outcome: "pending" });
      expect(gateway.retrieveSetupIntent).toHaveBeenCalledWith({ connectedAccount, setupIntentId: "seti_Synthetic1" });
      expectNoWrites();
    });

    it("mismatch (otro cliente u otro intento) es 404 sin escribir", async () => {
      for (const retrieved of [
        snapshot({ customer: "cus_Other" }),
        snapshot({ metadataAttemptId: "10000000-0000-4000-8000-000000000999" }),
        snapshot({ paymentMethodType: "sepa_debit" }),
        snapshot({ id: "seti_Other" }),
      ]) {
        const gateway = fakeGateway(retrieved);
        await expect(completeFamilyPaymentSetup(completeInput, { gateway })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
      }
      expectNoWrites();
    });

    it("failed marca el intento abandonado y responde 409", async () => {
      const gateway = fakeGateway(snapshot({ status: "canceled" }));
      await expect(completeFamilyPaymentSetup(completeInput, { gateway })).rejects.toMatchObject({
        code: "FAMILY_PAYMENT_SETUP_FAILED",
        status: 409,
      });
      expect(markSetupAttemptAbandoned).toHaveBeenCalledWith(expect.anything(), { organizationId, attemptId, now });
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("3DS fallido (pide método otra vez con error) marca el intento abandonado y responde 409", async () => {
      const gateway = fakeGateway(
        snapshot({ status: "requires_payment_method", paymentMethod: null, paymentMethodType: null, hasLastSetupError: true })
      );
      await expect(completeFamilyPaymentSetup(completeInput, { gateway })).rejects.toMatchObject({
        code: "FAMILY_PAYMENT_SETUP_FAILED",
        status: 409,
      });
      expect(markSetupAttemptAbandoned).toHaveBeenCalledWith(expect.anything(), { organizationId, attemptId, now });
      expect(insertActiveAuthorization).not.toHaveBeenCalled();
    });

    it("si la academia deja de estar lista antes de completar: 503 sin Stripe ni escrituras", async () => {
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(account({ status: "restricted" }));
      const gateway = fakeGateway();
      await expect(completeFamilyPaymentSetup(completeInput, { gateway })).rejects.toMatchObject({
        code: "FEATURE_NOT_AVAILABLE",
        status: 503,
        details: { reason: "account_not_ready" },
      });
      expect(findSetupAttemptForPayer).not.toHaveBeenCalled();
      expect(gateway.retrieveSetupIntent).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("succeeded activa la autorización con la evidencia del intento", async () => {
      const gateway = fakeGateway();
      expect(await completeFamilyPaymentSetup(completeInput, { gateway })).toEqual({ outcome: "active", method: "card" });
      expect(lockSetupAttempt).toHaveBeenCalledWith(tx, { organizationId, attemptId });
      expect(lockActiveAuthorization).toHaveBeenCalledWith(tx, { organizationId, accountRowId, familyPayerId });
      expect(revokeAuthorization).not.toHaveBeenCalled();
      expect(insertActiveAuthorization).toHaveBeenCalledWith(tx, {
        organizationId,
        familyId,
        familyPayerId,
        accountRowId,
        setupReference: "seti_Synthetic1",
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
      expect(markSetupAttemptCompleted).toHaveBeenCalledWith(tx, { organizationId, attemptId, authorizationId, now });
      expect(appendOutboxEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
        eventName: "family_payment_methods.authorization_activated",
        aggregateType: "family_payment_authorization",
        aggregateId: authorizationId,
      }));
      expect(gateway.detachPaymentMethod).not.toHaveBeenCalled();
    });

    it("si otra petición lo completó mientras esperaba el cerrojo, devuelve eso sin escribir", async () => {
      vi.mocked(lockSetupAttempt).mockResolvedValue(attempt({ status: "completed", authorizationId }));
      const gateway = fakeGateway();
      expect(await completeFamilyPaymentSetup(completeInput, { gateway })).toEqual({ outcome: "active", method: "card" });
      expect(insertActiveAuthorization).not.toHaveBeenCalled();
      expect(appendAuditEntry).not.toHaveBeenCalled();
    });

    it("cambio de método: revoca la anterior en la misma transacción y la desliga después", async () => {
      vi.mocked(lockActiveAuthorization).mockResolvedValue(
        authorization({ id: previousAuthorizationId, paymentMethodReference: "pm_SyntheticOld" })
      );
      const gateway = fakeGateway();
      gateway.detachPaymentMethod.mockImplementation(async () => {
        // Después del commit: la transacción ya terminó.
        expect(markSetupAttemptCompleted).toHaveBeenCalled();
      });
      await completeFamilyPaymentSetup(completeInput, { gateway });
      expect(revokeAuthorization).toHaveBeenCalledWith(tx, { organizationId, authorizationId: previousAuthorizationId, now });
      expect(appendOutboxEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
        eventName: "family_payment_methods.authorization_revoked",
        aggregateId: previousAuthorizationId,
        payload: expect.objectContaining({ actor: "family", reason: "replaced" }),
      }));
      expect(gateway.detachPaymentMethod).toHaveBeenCalledWith({ connectedAccount, paymentMethod: "pm_SyntheticOld" });
    });

    it("si Stripe no desliga el método anterior, se registra y la activación se mantiene", async () => {
      vi.mocked(lockActiveAuthorization).mockResolvedValue(
        authorization({ id: previousAuthorizationId, paymentMethodReference: "pm_SyntheticOld" })
      );
      const gateway = fakeGateway();
      gateway.detachPaymentMethod.mockRejectedValue(new Error("stripe down"));
      expect(await completeFamilyPaymentSetup(completeInput, { gateway })).toEqual({ outcome: "active", method: "card" });
      expect(logger.error).toHaveBeenCalledWith(
        "Pago automático: método revocado sin desligar en Stripe",
        expect.any(Error),
        expect.objectContaining({ authorizationId: previousAuthorizationId, paymentMethodId: "pm_SyntheticOld" })
      );
    });

    it("violación del índice único: devuelve lo completado por la otra petición o pide reintentar", async () => {
      const unique = Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
      vi.mocked(insertActiveAuthorization).mockRejectedValue(unique);
      vi.mocked(findSetupAttemptForPayer)
        .mockResolvedValueOnce(attempt())
        .mockResolvedValueOnce(attempt({ status: "completed", authorizationId }));
      expect(await completeFamilyPaymentSetup(completeInput, { gateway: fakeGateway() })).toEqual({ outcome: "active", method: "card" });

      vi.mocked(findSetupAttemptForPayer).mockResolvedValue(attempt());
      await expect(completeFamilyPaymentSetup(completeInput, { gateway: fakeGateway() })).rejects.toMatchObject({
        code: "CONCURRENCY_RETRY",
        status: 409,
      });
    });

    it("domiciliación que la academia ya no acepta: 409 sin Stripe", async () => {
      vi.mocked(findSetupAttemptForPayer).mockResolvedValue(attempt({ paymentMethodKind: "sepa_debit" }));
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(account({ sepaDebitPaymentsCapabilityStatus: "inactive" }));
      const gateway = fakeGateway();
      await expect(completeFamilyPaymentSetup(completeInput, { gateway })).rejects.toMatchObject({
        code: "FAMILY_PAYMENT_METHOD_NOT_OFFERED",
        status: 409,
      });
      expect(gateway.retrieveSetupIntent).not.toHaveBeenCalled();
    });
  });

  describe("revokeFamilyPaymentMethod", () => {
    it("sin activa responde none sin Stripe", async () => {
      const gateway = fakeGateway();
      expect(await revokeFamilyPaymentMethod(family, { gateway })).toEqual({ outcome: "none" });
      expect(revokeAuthorization).not.toHaveBeenCalled();
      expect(gateway.detachPaymentMethod).not.toHaveBeenCalled();
    });

    it("marca revoked y después desliga el método", async () => {
      vi.mocked(lockActiveAuthorization).mockResolvedValue(authorization());
      const gateway = fakeGateway();
      expect(await revokeFamilyPaymentMethod(family, { gateway })).toEqual({ outcome: "revoked" });
      expect(revokeAuthorization).toHaveBeenCalledWith(tx, { organizationId, authorizationId, now });
      expect(appendAuditEntry).toHaveBeenCalledWith(tx, expect.objectContaining({
        action: "family_payment_methods.authorization_revoked",
        targetId: authorizationId,
        metadata: expect.objectContaining({ actor: "family", reason: "requested" }),
      }));
      expect(gateway.detachPaymentMethod).toHaveBeenCalledWith({ connectedAccount, paymentMethod: "pm_SyntheticNew" });
    });

    it("quien no es la pagadora recibe 404 sin escribir", async () => {
      vi.mocked(resolveFamilyPayer).mockResolvedValue(null);
      await expect(revokeFamilyPaymentMethod(family, { gateway: fakeGateway() })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
      expectNoWrites();
    });

    it("no exige plan de pago: dejar de pagar siempre se puede", async () => {
      vi.mocked(loadOrganizationPlanState).mockResolvedValue({ entitlement: entitlement("free"), subscription: null });
      vi.mocked(lockActiveAuthorization).mockResolvedValue(authorization());
      expect(await revokeFamilyPaymentMethod(family, { gateway: fakeGateway() })).toEqual({ outcome: "revoked" });
    });

    it("con la bandera apagada se puede dejar de pagar automáticamente", async () => {
      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "false");
      vi.mocked(lockActiveAuthorization).mockResolvedValue(authorization());
      const gateway = fakeGateway();
      expect(await revokeFamilyPaymentMethod(family, { gateway })).toEqual({ outcome: "revoked" });
      expect(revokeAuthorization).toHaveBeenCalledWith(tx, { organizationId, authorizationId, now });
      expect(gateway.detachPaymentMethod).toHaveBeenCalledWith({ connectedAccount, paymentMethod: "pm_SyntheticNew" });
    });

    it.each([
      ["clave Live", "live_not_released", () => vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_synthetic")],
      [
        "base de producción",
        "live_not_released",
        () => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`),
      ],
      ["sin clave de Stripe", "environment_unknown", () => vi.stubEnv("STRIPE_SECRET_KEY", "")],
      ["sin almacenamiento de la Fase 2", "storage_missing", () => vi.mocked(isFamilyPaymentMethodsStorageAvailable).mockResolvedValue(false)],
      ["sin almacenamiento de la Fase 1", "storage_missing", () => vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(false)],
    ])("con la bandera apagada y %s: 503 sin leer a la persona pagadora", async (_label, reason, arrange) => {
      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "false");
      arrange();
      const gateway = fakeGateway();
      await expect(revokeFamilyPaymentMethod(family, { gateway })).rejects.toMatchObject({
        code: "FEATURE_NOT_AVAILABLE",
        status: 503,
        details: { reason },
      });
      expect(resolveFamilyPayer).not.toHaveBeenCalled();
      expect(gateway.detachPaymentMethod).not.toHaveBeenCalled();
      expectNoWrites();
    });
  });

  describe("academia", () => {
    it("solo propiedad o administración de todas las sedes", async () => {
      for (const scope of [ownerScope("manager"), ownerScope("admin", "selected")]) {
        vi.mocked(resolveOwnerScope).mockResolvedValue(scope);
        await expect(listOwnerFamilyPaymentMethods({ userId, organizationId })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
        await expect(
          revokeFamilyPaymentMethodByOwner({ userId, organizationId, authorizationId, now }, { gateway: fakeGateway() })
        ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      }
      expect(listActiveAuthorizationsForOrganization).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("lista las activas del entorno con nombre y primer apellido de la persona pagadora", async () => {
      vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope("admin", "all"));
      vi.mocked(listActiveAuthorizationsForOrganization).mockResolvedValue([
        {
          authorizationId,
          familyId,
          givenName: "Lucía",
          familyName: "García  Pons",
          method: "sepa_debit",
          since: new Date("2026-11-16T11:55:00.000Z"),
        },
      ]);
      expect(await listOwnerFamilyPaymentMethods({ userId, organizationId })).toEqual([
        { authorizationId, familyId, payerName: "Lucía García", method: "sepa_debit", since: "2026-11-16T11:55:00.000Z" },
      ]);
      expect(listActiveAuthorizationsForOrganization).toHaveBeenCalledWith(expect.anything(), {
        organizationId,
        accountRowId,
        limit: 200,
      });
    });

    it("con la bandera apagada lista las activas (para poder revocarlas)", async () => {
      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "false");
      vi.mocked(listActiveAuthorizationsForOrganization).mockResolvedValue([
        { authorizationId, familyId, givenName: "Lucía", familyName: "García", method: "card", since: new Date("2026-11-16T11:55:00.000Z") },
      ]);
      expect(await listOwnerFamilyPaymentMethods({ userId, organizationId })).toEqual([
        { authorizationId, familyId, payerName: "Lucía García", method: "card", since: "2026-11-16T11:55:00.000Z" },
      ]);
    });

    it.each([
      ["clave Live", () => vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_synthetic")],
      ["base de producción", () => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`)],
      ["sin almacenamiento", () => vi.mocked(isFamilyPaymentMethodsStorageAvailable).mockResolvedValue(false)],
    ])("con %s la lista está vacía y no se mira ni el rol ni la base", async (_label, arrange) => {
      arrange();
      expect(await listOwnerFamilyPaymentMethods({ userId, organizationId })).toEqual([]);
      expect(resolveOwnerScope).not.toHaveBeenCalled();
      expect(findConnectAccountForOrganization).not.toHaveBeenCalled();
      expect(listActiveAuthorizationsForOrganization).not.toHaveBeenCalled();
    });

    it("con la bandera apagada la academia revoca igual", async () => {
      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "false");
      vi.mocked(lockActiveAuthorizationById).mockResolvedValue(authorization());
      const gateway = fakeGateway();
      expect(
        await revokeFamilyPaymentMethodByOwner({ userId, organizationId, authorizationId, now }, { gateway })
      ).toEqual({ outcome: "revoked" });
      expect(gateway.detachPaymentMethod).toHaveBeenCalledWith({ connectedAccount, paymentMethod: "pm_SyntheticNew" });
    });

    it.each([
      ["clave Live", "live_not_released", () => vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_synthetic")],
      [
        "base de producción",
        "live_not_released",
        () => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`),
      ],
      ["sin almacenamiento", "storage_missing", () => vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(false)],
    ])("la academia con %s recibe 503 sin escribir", async (_label, reason, arrange) => {
      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "false");
      arrange();
      const gateway = fakeGateway();
      await expect(
        revokeFamilyPaymentMethodByOwner({ userId, organizationId, authorizationId, now }, { gateway })
      ).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE", status: 503, details: { reason } });
      expect(findConnectAccountForOrganization).not.toHaveBeenCalled();
      expect(gateway.detachPaymentMethod).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("revoca por id dentro de su academia y cuenta, con actor owner, y desliga después", async () => {
      vi.mocked(lockActiveAuthorizationById).mockResolvedValue(authorization());
      const gateway = fakeGateway();
      expect(
        await revokeFamilyPaymentMethodByOwner({ userId, organizationId, authorizationId, now }, { gateway })
      ).toEqual({ outcome: "revoked" });
      expect(lockActiveAuthorizationById).toHaveBeenCalledWith(tx, { organizationId, accountRowId, authorizationId });
      expect(appendOutboxEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
        eventName: "family_payment_methods.authorization_revoked",
        payload: expect.objectContaining({ actor: "owner" }),
      }));
      expect(gateway.detachPaymentMethod).toHaveBeenCalledWith({ connectedAccount, paymentMethod: "pm_SyntheticNew" });
    });

    it("una autorización que no está activa en esta academia: none", async () => {
      vi.mocked(lockActiveAuthorizationById).mockResolvedValue(null);
      const gateway = fakeGateway();
      expect(
        await revokeFamilyPaymentMethodByOwner({ userId, organizationId, authorizationId, now }, { gateway })
      ).toEqual({ outcome: "none" });
      expect(gateway.detachPaymentMethod).not.toHaveBeenCalled();
    });
  });

  describe("getOwnerFamilyPaymentMethodsView (panel de Familias)", () => {
    const activeRow = {
      authorizationId,
      familyId,
      givenName: "Lucía",
      familyName: "García",
      method: "card" as const,
      since: new Date("2026-11-16T11:55:00.000Z"),
    };
    const listed = { authorizationId, familyId, payerName: "Lucía García", method: "card", since: "2026-11-16T11:55:00.000Z" };

    beforeEach(() => {
      vi.mocked(listActiveAuthorizationsForOrganization).mockResolvedValue([]);
    });

    it("con activas se enseña aunque la bandera esté apagada", async () => {
      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "false");
      vi.mocked(listActiveAuthorizationsForOrganization).mockResolvedValue([activeRow]);
      expect(await getOwnerFamilyPaymentMethodsView({ userId, organizationId, now })).toEqual({
        visible: true,
        methods: [listed],
      });
      expect(loadOrganizationPlanState).not.toHaveBeenCalled();
    });

    it("vacía y con la bandera apagada no se enseña", async () => {
      vi.stubEnv("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED", "false");
      expect(await getOwnerFamilyPaymentMethodsView({ userId, organizationId, now })).toEqual({ visible: false });
      expect(loadOrganizationPlanState).not.toHaveBeenCalled();
    });

    it("vacía, con la bandera encendida y la academia lista: se enseña vacía", async () => {
      expect(await getOwnerFamilyPaymentMethodsView({ userId, organizationId, now })).toEqual({ visible: true, methods: [] });
    });

    it.each([
      ["sin cuenta conectada", () => vi.mocked(findConnectAccountForOrganization).mockResolvedValue(null)],
      ["con la cuenta restringida", () => vi.mocked(findConnectAccountForOrganization).mockResolvedValue(account({ status: "restricted" }))],
      [
        "con plan Free",
        () => vi.mocked(loadOrganizationPlanState).mockResolvedValue({ entitlement: entitlement("free"), subscription: null }),
      ],
    ])("vacía, con la bandera encendida y la academia %s: no se enseña un vacío engañoso", async (_label, arrange) => {
      arrange();
      expect(await getOwnerFamilyPaymentMethodsView({ userId, organizationId, now })).toEqual({ visible: false });
    });

    it("con clave Live no se enseña y no se mira el rol", async () => {
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_synthetic");
      expect(await getOwnerFamilyPaymentMethodsView({ userId, organizationId, now })).toEqual({ visible: false });
      expect(resolveOwnerScope).not.toHaveBeenCalled();
    });

    it("sin permiso lanza FORBIDDEN (la página lo convierte en «sin panel»)", async () => {
      vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope("manager"));
      await expect(getOwnerFamilyPaymentMethodsView({ userId, organizationId, now })).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      });
    });
  });
});
