import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { logger } from "@/lib/logger";
import { loadOrganizationPlanState } from "@/modules/billing/application/plan-state";
import type { EntitlementSnapshot } from "@/modules/billing/domain/plan-eligibility";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  getConnectStatus,
  renewConnectOnboardingLink,
  startConnectOnboarding,
  syncConnectAccountFromEvent,
} from "@/modules/payments-connect/application/connect-onboarding-service";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import type { ConnectAccountSnapshot } from "@/modules/payments-connect/domain/account-projection";
import {
  findConnectAccountByReference,
  findConnectAccountForOrganization,
  insertConnectAccountIfAbsent,
  loadOrganizationCountryCode,
  lockConnectAccount,
  touchConnectAccountSyncedAt,
  updateConnectAccountProjection,
  type StoredConnectAccount,
} from "@/modules/payments-connect/infrastructure/connect-account-store";
import type { ConnectAccountsGateway } from "@/modules/payments-connect/infrastructure/stripe-connect-gateway";
import {
  appendAuditEntry,
  appendOutboxEvent,
} from "@/modules/shared/infrastructure/transactional-records";

/**
 * Conectar Stripe (cobro automático, Fase 1): reglas del servicio con base y
 * Stripe simulados. Nunca llama a Stripe: el adaptador real lanza si se usa.
 */

const { tx } = vi.hoisted(() => ({ tx: { kind: "tx" } }));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)) },
}));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  getAppUrl: () => "https://zaltyko.test",
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
vi.mock("@/modules/payments-connect/application/storage", () => ({
  isConnectOnboardingStorageAvailable: vi.fn(),
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({
  appendAuditEntry: vi.fn(),
  appendOutboxEvent: vi.fn(),
}));
vi.mock("@/modules/payments-connect/infrastructure/stripe-connect-gateway", async (importOriginal) => ({
  // isStripeIdempotencyConflict es puro: se conserva el real.
  ...(await importOriginal<typeof import("@/modules/payments-connect/infrastructure/stripe-connect-gateway")>()),
  createStripeConnectGateway: vi.fn(() => {
    throw new Error("El adaptador real de Stripe no debe usarse en tests");
  }),
}));
vi.mock("@/modules/payments-connect/infrastructure/connect-account-store", async (importOriginal) => ({
  // storedProjection es puro: se conserva el real.
  ...(await importOriginal<typeof import("@/modules/payments-connect/infrastructure/connect-account-store")>()),
  loadOrganizationCountryCode: vi.fn(),
  findConnectAccountForOrganization: vi.fn(),
  findConnectAccountByReference: vi.fn(),
  lockConnectAccount: vi.fn(),
  insertConnectAccountIfAbsent: vi.fn(),
  updateConnectAccountProjection: vi.fn(),
  touchConnectAccountSyncedAt: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000101";
const organizationId = "10000000-0000-4000-8000-000000000001";
const accountRowId = "10000000-0000-4000-8000-000000000901";
const now = new Date("2026-11-16T12:00:00.000Z");

function ownerScope(role: OwnerScope["member"]["role"] = "owner"): OwnerScope {
  return {
    organization: { id: organizationId, name: "Club Sintético", defaultCurrency: "EUR" },
    member: { id: "10000000-0000-4000-8000-000000000201", role, locationScopeMode: "all" },
    locations: [],
    selectedLocationId: null,
    canViewOrganizationAggregate: true,
  };
}

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

function storedAccount(overrides: Partial<StoredConnectAccount> = {}): StoredConnectAccount {
  return {
    id: accountRowId,
    organizationId,
    environment: "test",
    providerAccountReference: "acct_SyntheticA1",
    status: "onboarding",
    cardPaymentsCapabilityStatus: "pending",
    sepaDebitPaymentsCapabilityStatus: "pending",
    requirementsState: "user_action",
    revision: 1,
    lastSyncedAt: new Date(now.getTime() - 5 * 60_000),
    ...overrides,
  };
}

/** Cuenta recién creada: faltan datos de la academia. */
function freshSnapshot(id = "acct_SyntheticA1"): ConnectAccountSnapshot {
  return {
    id,
    closed: false,
    cardPaymentsStatus: null,
    sepaDebitPaymentsStatus: null,
    requirementEntries: [{ deadlineStatus: "currently_due", awaitingActionFrom: "user" }],
  };
}

function activeSnapshot(id = "acct_SyntheticA1"): ConnectAccountSnapshot {
  return {
    id,
    closed: false,
    cardPaymentsStatus: "active",
    sepaDebitPaymentsStatus: "active",
    requirementEntries: [],
  };
}

function fakeGateway(snapshot: ConnectAccountSnapshot = freshSnapshot()) {
  return {
    createAccount: vi.fn(async () => snapshot),
    retrieveAccount: vi.fn(async () => snapshot),
    createOnboardingLink: vi.fn(async () => ({ url: "https://connect.stripe.test/setup/synthetic" })),
    parseAccountEvent: vi.fn(),
  } satisfies ConnectAccountsGateway;
}

describe("servicio de Conectar Stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ZALTYKO_CONNECT_ONBOARDING_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
    vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope());
    vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(true);
    vi.mocked(loadOrganizationCountryCode).mockResolvedValue("ES");
    vi.mocked(loadOrganizationPlanState).mockResolvedValue({
      entitlement: entitlement("network"),
      subscription: null,
    });
    vi.mocked(findConnectAccountForOrganization).mockResolvedValue(null);
    vi.mocked(findConnectAccountByReference).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getConnectStatus", () => {
    it("sin fila muestra not_connected", async () => {
      const gateway = fakeGateway();
      const state = await getConnectStatus({ userId, organizationId, refresh: true }, { gateway, now });
      expect(state).toEqual({ kind: "not_connected" });
      expect(gateway.retrieveAccount).not.toHaveBeenCalled();
      expect(resolveOwnerScope).toHaveBeenCalledWith({ userId, organizationId });
    });

    it("sin fila y plan Free muestra el motivo paid_plan_required", async () => {
      vi.mocked(loadOrganizationPlanState).mockResolvedValue({
        entitlement: entitlement("free"),
        subscription: null,
      });
      const state = await getConnectStatus({ userId, organizationId, refresh: false }, { gateway: fakeGateway(), now });
      expect(state).toEqual({ kind: "unavailable", reason: "paid_plan_required" });
    });

    it("con fila sigue mostrando su estado aunque el plan ya no sea de pago", async () => {
      vi.mocked(loadOrganizationPlanState).mockResolvedValue({
        entitlement: entitlement("free"),
        subscription: null,
      });
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(storedAccount({ status: "active", cardPaymentsCapabilityStatus: "active" }));
      const state = await getConnectStatus({ userId, organizationId, refresh: false }, { gateway: fakeGateway(), now });
      expect(state).toEqual({ kind: "ready", card: "active", sepa: "pending", disabled: false });
    });

    it("con la bandera apagada no consulta la base y responde unavailable", async () => {
      vi.stubEnv("ZALTYKO_CONNECT_ONBOARDING_ENABLED", "false");
      const state = await getConnectStatus({ userId, organizationId, refresh: true }, { gateway: fakeGateway(), now });
      expect(state).toEqual({ kind: "unavailable", reason: "flag_off" });
      expect(isConnectOnboardingStorageAvailable).not.toHaveBeenCalled();
      expect(findConnectAccountForOrganization).not.toHaveBeenCalled();
    });

    it("sin el candidato aplicado responde storage_missing sin leer la tabla", async () => {
      vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(false);
      const state = await getConnectStatus({ userId, organizationId, refresh: true }, { gateway: fakeGateway(), now });
      expect(state).toEqual({ kind: "unavailable", reason: "storage_missing" });
      expect(findConnectAccountForOrganization).not.toHaveBeenCalled();
    });

    it("un rol sin permiso no ve la fila aunque exista", async () => {
      vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope("manager"));
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(storedAccount());
      const state = await getConnectStatus({ userId, organizationId, refresh: false }, { gateway: fakeGateway(), now });
      expect(state).toEqual({ kind: "unavailable", reason: "role_not_allowed" });
      expect(findConnectAccountForOrganization).not.toHaveBeenCalled();
    });

    it("traduce cada estado de fila a su estado de pantalla", async () => {
      const cases: Array<[Partial<StoredConnectAccount>, string, boolean]> = [
        [{ status: "onboarding", requirementsState: "user_action" }, "needs_details", false],
        [{ status: "onboarding", requirementsState: "stripe_review" }, "in_review", false],
        [{ status: "active", requirementsState: "none" }, "ready", false],
        [{ status: "restricted", requirementsState: "past_due" }, "problem", false],
        [{ status: "disabled", requirementsState: "none" }, "problem", true],
      ];
      for (const [row, kind, disabled] of cases) {
        vi.mocked(findConnectAccountForOrganization).mockResolvedValueOnce(storedAccount(row));
        const state = await getConnectStatus({ userId, organizationId, refresh: false }, { gateway: fakeGateway(), now });
        expect(state).toEqual({ kind, card: "pending", sepa: "pending", disabled });
      }
    });

    it("un refresco con menos de 60 s desde la última sincronización no llama a Stripe", async () => {
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(
        storedAccount({ lastSyncedAt: new Date(now.getTime() - 30_000) })
      );
      const gateway = fakeGateway();
      const state = await getConnectStatus({ userId, organizationId, refresh: true }, { gateway, now });
      expect(state).toMatchObject({ kind: "needs_details" });
      expect(gateway.retrieveAccount).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("la fila recién creada (last_synced_at null) se refresca aunque no hayan pasado 60 s", async () => {
      const row = storedAccount({ lastSyncedAt: null });
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(row);
      vi.mocked(lockConnectAccount).mockResolvedValue(row);
      vi.mocked(updateConnectAccountProjection).mockResolvedValue({
        ...row,
        status: "onboarding",
        requirementsState: "stripe_review",
        revision: 2,
        lastSyncedAt: now,
      });
      const gateway = fakeGateway({
        ...freshSnapshot(),
        requirementEntries: [{ deadlineStatus: "currently_due", awaitingActionFrom: "stripe" }],
      });

      const state = await getConnectStatus({ userId, organizationId, refresh: true }, { gateway, now });

      expect(gateway.retrieveAccount).toHaveBeenCalledWith("acct_SyntheticA1");
      expect(state).toMatchObject({ kind: "in_review" });
    });

    it("sin refresh no llama a Stripe aunque la sincronización sea antigua", async () => {
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(storedAccount());
      const gateway = fakeGateway();
      await getConnectStatus({ userId, organizationId, refresh: false }, { gateway, now });
      expect(gateway.retrieveAccount).not.toHaveBeenCalled();
    });

    it("si la proyección no cambia solo anota last_synced_at y no audita", async () => {
      const row = storedAccount();
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(row);
      vi.mocked(lockConnectAccount).mockResolvedValue(row);
      vi.mocked(touchConnectAccountSyncedAt).mockResolvedValue({ ...row, lastSyncedAt: now });
      const gateway = fakeGateway(freshSnapshot());

      const state = await getConnectStatus({ userId, organizationId, refresh: true }, { gateway, now });

      expect(gateway.retrieveAccount).toHaveBeenCalledWith("acct_SyntheticA1");
      expect(touchConnectAccountSyncedAt).toHaveBeenCalledWith(tx, accountRowId);
      expect(updateConnectAccountProjection).not.toHaveBeenCalled();
      expect(appendAuditEntry).not.toHaveBeenCalled();
      expect(appendOutboxEvent).not.toHaveBeenCalled();
      expect(state).toMatchObject({ kind: "needs_details" });
    });

    it("si la proyección cambia sube la revisión, audita y deja evento", async () => {
      const row = storedAccount();
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(row);
      vi.mocked(lockConnectAccount).mockResolvedValue(row);
      vi.mocked(updateConnectAccountProjection).mockResolvedValue({
        ...row,
        status: "active",
        cardPaymentsCapabilityStatus: "active",
        sepaDebitPaymentsCapabilityStatus: "active",
        requirementsState: "none",
        revision: 2,
        lastSyncedAt: now,
      });
      const gateway = fakeGateway(activeSnapshot());

      const state = await getConnectStatus({ userId, organizationId, refresh: true }, { gateway, now });

      expect(state).toEqual({ kind: "ready", card: "active", sepa: "active", disabled: false });
      expect(updateConnectAccountProjection).toHaveBeenCalledWith(tx, {
        accountRowId,
        projection: {
          status: "active",
          cardPaymentsCapabilityStatus: "active",
          sepaDebitPaymentsCapabilityStatus: "active",
          requirementsState: "none",
        },
        providerEventReference: null,
      });
      expect(appendAuditEntry).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: "payments_connect.account_synced",
          actorUserId: userId,
          targetId: accountRowId,
          idempotencyKey: `payments-connect:account-synced:${accountRowId}:2`,
        })
      );
      expect(appendOutboxEvent).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ eventName: "payments_connect.account_synced", aggregateId: accountRowId })
      );
    });
  });

  describe("startConnectOnboarding", () => {
    it("en Free lanza CONNECT_UNAVAILABLE con paid_plan_required y no crea la cuenta", async () => {
      vi.mocked(loadOrganizationPlanState).mockResolvedValue({
        entitlement: entitlement("free"),
        subscription: null,
      });
      const gateway = fakeGateway();
      await expect(startConnectOnboarding({ userId, organizationId }, { gateway, now })).rejects.toMatchObject({
        code: "CONNECT_UNAVAILABLE",
        status: 409,
        details: { reason: "paid_plan_required" },
      });
      expect(gateway.createAccount).not.toHaveBeenCalled();
      expect(gateway.createOnboardingLink).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("fuera de España lanza country_not_supported aunque haya fila", async () => {
      vi.mocked(loadOrganizationCountryCode).mockResolvedValue("MX");
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(storedAccount());
      const gateway = fakeGateway();
      await expect(startConnectOnboarding({ userId, organizationId }, { gateway, now })).rejects.toMatchObject({
        code: "CONNECT_UNAVAILABLE",
        details: { reason: "country_not_supported" },
      });
      expect(gateway.createOnboardingLink).not.toHaveBeenCalled();
    });

    it("sin fila crea la cuenta solo con academia y entorno, la guarda auditada y devuelve el enlace", async () => {
      const gateway = fakeGateway();
      vi.mocked(insertConnectAccountIfAbsent).mockResolvedValue(storedAccount({ lastSyncedAt: null }));

      const result = await startConnectOnboarding({ userId, organizationId }, { gateway, now });

      expect(result).toEqual({ url: "https://connect.stripe.test/setup/synthetic" });
      expect(gateway.createAccount).toHaveBeenCalledWith({ organizationId, environment: "test" });
      expect(insertConnectAccountIfAbsent).toHaveBeenCalledWith(tx, {
        organizationId,
        environment: "test",
        providerAccountReference: "acct_SyntheticA1",
        projection: {
          status: "onboarding",
          cardPaymentsCapabilityStatus: "pending",
          sepaDebitPaymentsCapabilityStatus: "pending",
          requirementsState: "user_action",
        },
      });
      expect(appendAuditEntry).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: "payments_connect.account_created", targetId: accountRowId })
      );
      expect(gateway.createOnboardingLink).toHaveBeenCalledWith({
        accountId: "acct_SyntheticA1",
        returnUrl: `https://zaltyko.test/owner/settings?organizationId=${organizationId}&stripe=vuelta#cobro-automatico`,
        refreshUrl: `https://zaltyko.test/api/v1/owner/payments/connect/link?organizationId=${organizationId}`,
      });
      // Stripe se llama antes de abrir la transacción, nunca dentro.
      expect(gateway.createAccount.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(db.transaction).mock.invocationCallOrder[0]
      );
    });

    it.each<[string, Record<string, unknown>]>([
      ["la clave de idempotencia está en uso", { type: "StripeInvalidRequestError", code: "idempotency_key_in_use" }],
      ["Stripe rechaza la clave reutilizada", { type: "StripeIdempotencyError", rawType: "idempotency_error" }],
    ])("si %s lanza CONCURRENCY_RETRY 409 sin guardar nada", async (_label, stripeError) => {
      const gateway = fakeGateway();
      gateway.createAccount.mockRejectedValue(Object.assign(new Error("idempotencia"), stripeError));

      await expect(startConnectOnboarding({ userId, organizationId }, { gateway, now })).rejects.toMatchObject({
        code: "CONCURRENCY_RETRY",
        status: 409,
        message: "Stripe todavía está preparando tu cuenta. Vuelve a intentarlo.",
      });
      expect(db.transaction).not.toHaveBeenCalled();
      expect(insertConnectAccountIfAbsent).not.toHaveBeenCalled();
      expect(gateway.createOnboardingLink).not.toHaveBeenCalled();
    });

    it("otro fallo de Stripe al crear la cuenta se propaga tal cual", async () => {
      const gateway = fakeGateway();
      const failure = new Error("stripe caído");
      gateway.createAccount.mockRejectedValue(failure);

      await expect(startConnectOnboarding({ userId, organizationId }, { gateway, now })).rejects.toBe(failure);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("si la transacción falla tras crear la cuenta registra solo ids y propaga el error", async () => {
      const gateway = fakeGateway();
      const failure = new Error("base caída");
      vi.mocked(db.transaction).mockRejectedValueOnce(failure);

      await expect(startConnectOnboarding({ userId, organizationId }, { gateway, now })).rejects.toBe(failure);
      expect(logger.error).toHaveBeenCalledWith(
        "Conectar Stripe: cuenta creada en Stripe sin guardar",
        failure,
        { organizationId, accountId: "acct_SyntheticA1" }
      );
      expect(gateway.createOnboardingLink).not.toHaveBeenCalled();
    });

    it("con fila existente solo pide un enlace nuevo", async () => {
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(storedAccount());
      const gateway = fakeGateway();
      await startConnectOnboarding({ userId, organizationId }, { gateway, now });
      expect(gateway.createAccount).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
      expect(gateway.createOnboardingLink).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "acct_SyntheticA1" })
      );
    });
  });

  describe("renewConnectOnboardingLink", () => {
    it("sin fila lanza NOT_FOUND y no crea la cuenta, ni el enlace, ni escribe", async () => {
      const gateway = fakeGateway();
      await expect(renewConnectOnboardingLink({ userId, organizationId }, { gateway, now })).rejects.toMatchObject({
        code: "NOT_FOUND",
        status: 404,
      });
      expect(gateway.createAccount).not.toHaveBeenCalled();
      expect(gateway.createOnboardingLink).not.toHaveBeenCalled();
      expect(insertConnectAccountIfAbsent).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
      expect(appendAuditEntry).not.toHaveBeenCalled();
      expect(appendOutboxEvent).not.toHaveBeenCalled();
    });

    it("con fila solo pide un enlace nuevo para la cuenta guardada", async () => {
      vi.mocked(findConnectAccountForOrganization).mockResolvedValue(storedAccount());
      const gateway = fakeGateway();

      const result = await renewConnectOnboardingLink({ userId, organizationId }, { gateway, now });

      expect(result).toEqual({ url: "https://connect.stripe.test/setup/synthetic" });
      expect(resolveOwnerScope).toHaveBeenCalledWith({ userId, organizationId });
      expect(gateway.createAccount).not.toHaveBeenCalled();
      expect(gateway.retrieveAccount).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
      expect(gateway.createOnboardingLink).toHaveBeenCalledWith({
        accountId: "acct_SyntheticA1",
        returnUrl: `https://zaltyko.test/owner/settings?organizationId=${organizationId}&stripe=vuelta#cobro-automatico`,
        refreshUrl: `https://zaltyko.test/api/v1/owner/payments/connect/link?organizationId=${organizationId}`,
      });
    });

    it("sin disponibilidad lanza CONNECT_UNAVAILABLE sin buscar la cuenta ni llamar a Stripe", async () => {
      vi.stubEnv("ZALTYKO_CONNECT_ONBOARDING_ENABLED", "false");
      const gateway = fakeGateway();
      await expect(renewConnectOnboardingLink({ userId, organizationId }, { gateway, now })).rejects.toMatchObject({
        code: "CONNECT_UNAVAILABLE",
        status: 409,
        details: { reason: "flag_off" },
      });
      expect(findConnectAccountForOrganization).not.toHaveBeenCalled();
      expect(gateway.createOnboardingLink).not.toHaveBeenCalled();
    });

    it("el error de alcance de resolveOwnerScope se propaga sin llamar a Stripe", async () => {
      vi.mocked(resolveOwnerScope).mockRejectedValue(new Error("sin acceso"));
      const gateway = fakeGateway();
      await expect(renewConnectOnboardingLink({ userId, organizationId }, { gateway, now })).rejects.toThrow("sin acceso");
      expect(gateway.createOnboardingLink).not.toHaveBeenCalled();
    });
  });

  describe("syncConnectAccountFromEvent", () => {
    it("una cuenta desconocida se ignora sin escribir", async () => {
      const gateway = fakeGateway();
      const outcome = await syncConnectAccountFromEvent(
        { eventId: "evt_synthetic_1", accountId: "acct_Unknown1", livemode: false },
        { gateway, now }
      );
      expect(outcome).toBe("ignored");
      expect(findConnectAccountByReference).toHaveBeenCalledWith(db, "test", "acct_Unknown1");
      expect(gateway.retrieveAccount).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
      expect(appendAuditEntry).not.toHaveBeenCalled();
    });

    it("un evento live con clave de test se ignora sin leer la base", async () => {
      const outcome = await syncConnectAccountFromEvent(
        { eventId: "evt_synthetic_2", accountId: "acct_SyntheticA1", livemode: true },
        { gateway: fakeGateway(), now }
      );
      expect(outcome).toBe("ignored");
      expect(isConnectOnboardingStorageAvailable).not.toHaveBeenCalled();
      expect(findConnectAccountByReference).not.toHaveBeenCalled();
    });

    it("con clave Live se ignora aunque el evento sea Live, sin leer la base", async () => {
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_synthetic");
      const gateway = fakeGateway();
      const outcome = await syncConnectAccountFromEvent(
        { eventId: "evt_synthetic_live", accountId: "acct_SyntheticA1", livemode: true },
        { gateway, now }
      );
      expect(outcome).toBe("ignored");
      expect(isConnectOnboardingStorageAvailable).not.toHaveBeenCalled();
      expect(findConnectAccountByReference).not.toHaveBeenCalled();
      expect(gateway.retrieveAccount).not.toHaveBeenCalled();
    });

    it("sin almacenamiento se ignora", async () => {
      vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(false);
      const outcome = await syncConnectAccountFromEvent(
        { eventId: "evt_synthetic_3", accountId: "acct_SyntheticA1", livemode: false },
        { gateway: fakeGateway(), now }
      );
      expect(outcome).toBe("ignored");
      expect(findConnectAccountByReference).not.toHaveBeenCalled();
    });

    it("una cuenta conocida se vuelve a leer y se proyecta con la referencia del evento", async () => {
      const row = storedAccount();
      vi.mocked(findConnectAccountByReference).mockResolvedValue(row);
      vi.mocked(lockConnectAccount).mockResolvedValue(row);
      vi.mocked(updateConnectAccountProjection).mockResolvedValue({ ...row, status: "active", revision: 2 });
      const gateway = fakeGateway(activeSnapshot());

      const outcome = await syncConnectAccountFromEvent(
        { eventId: "evt_synthetic_4", accountId: "acct_SyntheticA1", livemode: false },
        { gateway, now }
      );

      expect(outcome).toBe("synced");
      expect(gateway.retrieveAccount).toHaveBeenCalledWith("acct_SyntheticA1");
      expect(updateConnectAccountProjection).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ accountRowId, providerEventReference: "evt_synthetic_4" })
      );
      expect(appendAuditEntry).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: "payments_connect.account_synced", actorUserId: null })
      );
    });
  });
});
