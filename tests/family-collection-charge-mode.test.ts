import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático (Fase 3): modo con el que nace cada cuota al emitir.
 * Base, plan, almacenamiento y entorno simulados; nunca llama a Stripe.
 */

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/modules/family-collection/application/config", () => ({
  isFamilyAutomaticCollectionFlagEnabled: vi.fn(),
  isFamilyAutomaticSepaCollectionFlagEnabled: vi.fn(),
  resolveConnectEnvironment: vi.fn(),
  isProductionDatabase: vi.fn(),
}));
vi.mock("@/modules/family-collection/application/storage", () => ({
  isFamilyCollectionStorageAvailable: vi.fn(),
}));
vi.mock("@/modules/family-payment-methods/application/storage", () => ({
  isFamilyPaymentMethodsStorageAvailable: vi.fn(),
}));
vi.mock("@/modules/payments-connect/application/storage", () => ({
  isConnectOnboardingStorageAvailable: vi.fn(),
}));
vi.mock("@/modules/billing/application/plan-state", () => ({
  loadOrganizationPlanState: vi.fn(),
  loadPlanChangeRevision: vi.fn(),
}));
vi.mock("@/modules/payments-connect/infrastructure/connect-account-store", () => ({
  findConnectAccountForOrganization: vi.fn(),
}));
vi.mock("@/modules/family-payment-methods/infrastructure/family-payment-store", () => ({
  findActiveAuthorization: vi.fn(),
}));

import {
  getChargeCollectionModeSnapshot,
  isFamilyAutomaticCollectionOpen,
} from "@/modules/billing/application/charge-collection-mode";
import {
  loadOrganizationPlanState,
  loadPlanChangeRevision,
} from "@/modules/billing/application/plan-state";
import type { EntitlementSnapshot } from "@/modules/billing/domain/plan-eligibility";
import {
  isFamilyAutomaticCollectionFlagEnabled,
  isFamilyAutomaticSepaCollectionFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { findActiveAuthorization } from "@/modules/family-payment-methods/infrastructure/family-payment-store";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import { findConnectAccountForOrganization } from "@/modules/payments-connect/infrastructure/connect-account-store";

const organizationId = "10000000-0000-4000-8000-000000000001";
const familyId = "10000000-0000-4000-8000-000000000601";
const familyPayerId = "10000000-0000-4000-8000-000000000701";
const accountRowId = "10000000-0000-4000-8000-000000000901";
const now = new Date("2026-11-16T12:00:00.000Z");

function entitlement(planCode: EntitlementSnapshot["planCode"], revision = 4): EntitlementSnapshot {
  return {
    organizationId,
    planCode,
    revision,
    source: planCode === "free" ? "bootstrap" : "contract",
    sourceReference: planCode === "free" ? "bootstrap:synthetic" : `contract:${organizationId}`,
    subscriptionId: null,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
  };
}

function executor(preference: { requestedMode: string; entitlementRevision: number | null } | null) {
  return {
    execute: vi.fn(async () => ({ rows: preference ? [preference] : [] })),
  };
}

function snapshot(
  client: ReturnType<typeof executor>,
  overrides: Partial<Parameters<typeof getChargeCollectionModeSnapshot>[0]> = {}
) {
  return getChargeCollectionModeSnapshot({
    executor: client as never,
    organizationId,
    familyId,
    familyPayerId,
    invoiceKind: "monthly",
    now,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isFamilyAutomaticCollectionFlagEnabled).mockReturnValue(true);
  vi.mocked(resolveConnectEnvironment).mockReturnValue("test");
  vi.mocked(isProductionDatabase).mockReturnValue(false);
  vi.mocked(isFamilyCollectionStorageAvailable).mockResolvedValue(true);
  vi.mocked(isFamilyPaymentMethodsStorageAvailable).mockResolvedValue(true);
  vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(true);
  vi.mocked(loadOrganizationPlanState).mockResolvedValue({
    entitlement: entitlement("growth"),
    subscription: null,
  });
  vi.mocked(loadPlanChangeRevision).mockResolvedValue(4);
  vi.mocked(findConnectAccountForOrganization).mockResolvedValue({
    id: accountRowId,
    organizationId,
    environment: "test",
    providerAccountReference: "acct_SyntheticA1",
    status: "active",
    cardPaymentsCapabilityStatus: "active",
    sepaDebitPaymentsCapabilityStatus: "active",
    requirementsState: "none",
    revision: 1,
    lastSyncedAt: now,
  } as never);
  vi.mocked(findActiveAuthorization).mockResolvedValue({
    id: "10000000-0000-4000-8000-000000000801",
    organizationId,
    familyId,
    familyPayerId,
    paymentProviderAccountId: accountRowId,
    paymentMethodReference: "pm_synthetic",
    paymentMethodKind: "card",
    consentedAt: now,
  });
});

describe("getChargeCollectionModeSnapshot", () => {
  it("con la bandera apagada responde manual sin consultar la base ni el almacenamiento", async () => {
    vi.mocked(isFamilyAutomaticCollectionFlagEnabled).mockReturnValue(false);
    const client = executor({ requestedMode: "automatic", entitlementRevision: 4 });

    await expect(snapshot(client)).resolves.toBe("manual");
    expect(client.execute).not.toHaveBeenCalled();
    expect(isFamilyCollectionStorageAvailable).not.toHaveBeenCalled();
    expect(loadOrganizationPlanState).not.toHaveBeenCalled();
    expect(isFamilyAutomaticCollectionOpen()).toBe(false);
  });

  it("nace automática con bandera, cerrojos, plan de pago, preferencia vigente y autorización activa", async () => {
    const client = executor({ requestedMode: "automatic", entitlementRevision: 4 });

    await expect(snapshot(client)).resolves.toBe("automatic");
    expect(findActiveAuthorization).toHaveBeenCalledWith(client, {
      organizationId,
      accountRowId,
      familyPayerId,
    });
    expect(findConnectAccountForOrganization).toHaveBeenCalledWith(client, organizationId, "test");
  });

  it("una factura que no es mensual siempre nace manual", async () => {
    const client = executor({ requestedMode: "automatic", entitlementRevision: 4 });

    await expect(snapshot(client, { invoiceKind: undefined })).resolves.toBe("manual");
    await expect(snapshot(client, { invoiceKind: "other" })).resolves.toBe("manual");
    expect(client.execute).not.toHaveBeenCalled();
  });

  it.each([
    ["clave Live", () => vi.mocked(resolveConnectEnvironment).mockReturnValue("live")],
    ["clave desconocida", () => vi.mocked(resolveConnectEnvironment).mockReturnValue(null)],
    ["base de producción", () => vi.mocked(isProductionDatabase).mockReturnValue(true)],
  ])("con %s responde manual sin consultar la base", async (_label, arrange) => {
    arrange();
    const client = executor({ requestedMode: "automatic", entitlementRevision: 4 });

    await expect(snapshot(client)).resolves.toBe("manual");
    expect(client.execute).not.toHaveBeenCalled();
  });

  it.each([
    ["sin tablas de la Fase 3", () => vi.mocked(isFamilyCollectionStorageAvailable).mockResolvedValue(false)],
    ["sin tablas de la Fase 2", () => vi.mocked(isFamilyPaymentMethodsStorageAvailable).mockResolvedValue(false)],
    ["sin columnas de la Fase 1", () => vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(false)],
  ])("%s responde manual", async (_label, arrange) => {
    arrange();
    await expect(snapshot(executor({ requestedMode: "automatic", entitlementRevision: 4 }))).resolves.toBe(
      "manual"
    );
    expect(findActiveAuthorization).not.toHaveBeenCalled();
  });

  it("sin pagador en la factura responde manual", async () => {
    await expect(
      snapshot(executor({ requestedMode: "automatic", entitlementRevision: 4 }), { familyPayerId: null })
    ).resolves.toBe("manual");
  });

  it("con plan gratuito responde manual", async () => {
    vi.mocked(loadOrganizationPlanState).mockResolvedValue({
      entitlement: entitlement("free", 4),
      subscription: null,
    });
    await expect(snapshot(executor({ requestedMode: "automatic", entitlementRevision: 4 }))).resolves.toBe(
      "manual"
    );
  });

  it.each([
    ["sin preferencia guardada", null],
    ["con preferencia manual", { requestedMode: "manual", entitlementRevision: 4 }],
    ["con preferencia de otra revisión del plan", { requestedMode: "automatic", entitlementRevision: 3 }],
    ["con preferencia sin revisión", { requestedMode: "automatic", entitlementRevision: null }],
  ])("%s responde manual", async (_label, preference) => {
    await expect(snapshot(executor(preference))).resolves.toBe("manual");
    expect(findActiveAuthorization).not.toHaveBeenCalled();
  });

  it("una renovación del plan después de guardar la preferencia no la invalida", async () => {
    vi.mocked(loadOrganizationPlanState).mockResolvedValue({
      entitlement: entitlement("growth", 6),
      subscription: null,
    });
    vi.mocked(loadPlanChangeRevision).mockResolvedValue(4);
    const client = executor({ requestedMode: "automatic", entitlementRevision: 4 });

    await expect(snapshot(client)).resolves.toBe("automatic");
    expect(loadPlanChangeRevision).toHaveBeenCalledWith(client, organizationId);
  });

  it("un cambio real del plan después de guardar la preferencia la deja en manual", async () => {
    vi.mocked(loadOrganizationPlanState).mockResolvedValue({
      entitlement: entitlement("growth", 6),
      subscription: null,
    });
    vi.mocked(loadPlanChangeRevision).mockResolvedValue(5);

    await expect(snapshot(executor({ requestedMode: "automatic", entitlementRevision: 4 }))).resolves.toBe(
      "manual"
    );
    expect(findActiveAuthorization).not.toHaveBeenCalled();
  });

  it("sin cuenta conectada de test responde manual", async () => {
    vi.mocked(findConnectAccountForOrganization).mockResolvedValue(null);
    await expect(snapshot(executor({ requestedMode: "automatic", entitlementRevision: 4 }))).resolves.toBe(
      "manual"
    );
  });

  it("sin autorización activa del pagador responde manual", async () => {
    vi.mocked(findActiveAuthorization).mockResolvedValue(null);
    await expect(snapshot(executor({ requestedMode: "automatic", entitlementRevision: 4 }))).resolves.toBe(
      "manual"
    );
  });

  it("una autorización de otra familia no cuenta", async () => {
    vi.mocked(findActiveAuthorization).mockResolvedValue({
      id: "10000000-0000-4000-8000-000000000801",
      organizationId,
      familyId: "10000000-0000-4000-8000-000000000602",
      familyPayerId,
      paymentProviderAccountId: accountRowId,
      paymentMethodReference: "pm_synthetic",
      paymentMethodKind: "card",
      consentedAt: now,
    });
    await expect(snapshot(executor({ requestedMode: "automatic", entitlementRevision: 4 }))).resolves.toBe(
      "manual"
    );
  });

  describe("domiciliación (D2, «Primero solo tarjeta»)", () => {
    function paysBySepa() {
      vi.mocked(findActiveAuthorization).mockResolvedValue({
        id: "10000000-0000-4000-8000-000000000801",
        organizationId,
        familyId,
        familyPayerId,
        paymentProviderAccountId: accountRowId,
        paymentMethodReference: "pm_synthetic_sepa",
        paymentMethodKind: "sepa_debit",
        consentedAt: now,
      });
    }

    it("con la bandera de la domiciliación apagada (por defecto), la cuota de quien domicilia nace manual", async () => {
      paysBySepa();
      vi.mocked(isFamilyAutomaticSepaCollectionFlagEnabled).mockReturnValue(false);
      await expect(snapshot(executor({ requestedMode: "automatic", entitlementRevision: 4 }))).resolves.toBe(
        "manual"
      );
    });

    it("con la bandera de la domiciliación encendida nace automática, como hoy", async () => {
      paysBySepa();
      vi.mocked(isFamilyAutomaticSepaCollectionFlagEnabled).mockReturnValue(true);
      await expect(snapshot(executor({ requestedMode: "automatic", entitlementRevision: 4 }))).resolves.toBe(
        "automatic"
      );
    });

    it("la tarjeta nace automática aunque la bandera de la domiciliación esté apagada", async () => {
      vi.mocked(isFamilyAutomaticSepaCollectionFlagEnabled).mockReturnValue(false);
      await expect(snapshot(executor({ requestedMode: "automatic", entitlementRevision: 4 }))).resolves.toBe(
        "automatic"
      );
    });
  });
});
