import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático (Fase 3): relectura de la cuenta conectada antes de cobrar.
 * Base y Stripe simulados; nunca llama a Stripe.
 */

const { tx } = vi.hoisted(() => ({ tx: { kind: "tx" } }));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)) },
}));
vi.mock("@/modules/payments-connect/application/config", () => ({
  isConnectOnboardingFlagEnabled: vi.fn(() => false),
  resolveConnectEnvironment: vi.fn(),
  isProductionDatabase: vi.fn(),
}));
vi.mock("@/modules/payments-connect/application/storage", () => ({
  isConnectOnboardingStorageAvailable: vi.fn(),
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({
  appendAuditEntry: vi.fn(),
  appendOutboxEvent: vi.fn(),
}));
vi.mock("@/modules/payments-connect/infrastructure/stripe-connect-gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/payments-connect/infrastructure/stripe-connect-gateway")>()),
  createStripeConnectGateway: vi.fn(() => {
    throw new Error("El adaptador real de Stripe no debe usarse en tests");
  }),
}));
vi.mock("@/modules/payments-connect/infrastructure/connect-account-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/payments-connect/infrastructure/connect-account-store")>()),
  findConnectAccountById: vi.fn(),
  lockConnectAccount: vi.fn(),
  touchConnectAccountSyncedAt: vi.fn(),
  updateConnectAccountProjection: vi.fn(),
}));

import { refreshConnectAccountForCollection } from "@/modules/payments-connect/application/connect-onboarding-service";
import {
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/payments-connect/application/config";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import type { ConnectAccountSnapshot } from "@/modules/payments-connect/domain/account-projection";
import {
  findConnectAccountById,
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

const organizationId = "10000000-0000-4000-8000-000000000001";
const accountRowId = "10000000-0000-4000-8000-000000000901";
const now = new Date("2026-11-17T06:00:00.000Z");

function storedAccount(overrides: Partial<StoredConnectAccount> = {}): StoredConnectAccount {
  return {
    id: accountRowId,
    organizationId,
    environment: "test",
    providerAccountReference: "acct_SyntheticA1",
    status: "active",
    cardPaymentsCapabilityStatus: "active",
    sepaDebitPaymentsCapabilityStatus: "active",
    requirementsState: "none",
    revision: 3,
    lastSyncedAt: new Date(now.getTime() - 2 * 60 * 60_000),
    ...overrides,
  } as StoredConnectAccount;
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

function gateway(snapshot: ConnectAccountSnapshot | Error) {
  const retrieveAccount = vi.fn(async () => {
    if (snapshot instanceof Error) throw snapshot;
    return snapshot;
  });
  return { retrieveAccount } as unknown as ConnectAccountsGateway & {
    retrieveAccount: typeof retrieveAccount;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveConnectEnvironment).mockReturnValue("test");
  vi.mocked(isProductionDatabase).mockReturnValue(false);
  vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(true);
  vi.mocked(findConnectAccountById).mockResolvedValue(storedAccount());
  vi.mocked(lockConnectAccount).mockResolvedValue(storedAccount());
});

describe("refreshConnectAccountForCollection", () => {
  it("relee la cuenta y anota la lectura sin inventar un id de evento", async () => {
    const fresh = storedAccount({ lastSyncedAt: now });
    vi.mocked(touchConnectAccountSyncedAt).mockResolvedValue(fresh);
    const fake = gateway(activeSnapshot());

    const result = await refreshConnectAccountForCollection(accountRowId, { gateway: fake, now });

    expect(fake.retrieveAccount).toHaveBeenCalledWith("acct_SyntheticA1");
    expect(touchConnectAccountSyncedAt).toHaveBeenCalledWith(tx, {
      accountRowId,
      providerEventReference: null,
      syncedAt: now,
    });
    expect(result).toEqual({ outcome: "unchanged", account: fresh });
    expect(appendAuditEntry).not.toHaveBeenCalled();
  });

  it("si la cuenta cambió, la proyecta con auditoría y sin evento de Stripe", async () => {
    vi.mocked(lockConnectAccount).mockResolvedValue(storedAccount({ status: "restricted" }));
    const updated = storedAccount({ revision: 4, lastSyncedAt: now });
    vi.mocked(updateConnectAccountProjection).mockResolvedValue(updated);

    const result = await refreshConnectAccountForCollection(accountRowId, {
      gateway: gateway(activeSnapshot()),
      now,
    });

    expect(result?.outcome).toBe("synced");
    expect(updateConnectAccountProjection).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ accountRowId, providerEventReference: null, syncedAt: now })
    );
    expect(appendAuditEntry).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: null,
        metadata: expect.objectContaining({ providerEventReference: null }),
      })
    );
    expect(appendOutboxEvent).toHaveBeenCalledOnce();
  });

  it.each([
    ["clave Live", () => vi.mocked(resolveConnectEnvironment).mockReturnValue("live")],
    ["clave desconocida", () => vi.mocked(resolveConnectEnvironment).mockReturnValue(null)],
    ["base de producción", () => vi.mocked(isProductionDatabase).mockReturnValue(true)],
    ["sin almacenamiento", () => vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(false)],
    ["sin fila", () => vi.mocked(findConnectAccountById).mockResolvedValue(null)],
    ["con una fila de Live", () => vi.mocked(findConnectAccountById).mockResolvedValue(storedAccount({ environment: "live" }))],
  ])("con %s no llama a Stripe ni escribe", async (_label, arrange) => {
    arrange();
    const fake = gateway(activeSnapshot());

    await expect(refreshConnectAccountForCollection(accountRowId, { gateway: fake, now })).resolves.toBeNull();
    expect(fake.retrieveAccount).not.toHaveBeenCalled();
    expect(lockConnectAccount).not.toHaveBeenCalled();
  });

  it("si Stripe no responde devuelve null y no escribe", async () => {
    const fake = gateway(new Error("synthetic network"));

    await expect(refreshConnectAccountForCollection(accountRowId, { gateway: fake, now })).resolves.toBeNull();
    expect(lockConnectAccount).not.toHaveBeenCalled();
  });

  it("si Stripe devuelve otra cuenta no proyecta nada", async () => {
    const fake = gateway(activeSnapshot("acct_SyntheticOther"));

    await expect(refreshConnectAccountForCollection(accountRowId, { gateway: fake, now })).resolves.toBeNull();
    expect(lockConnectAccount).not.toHaveBeenCalled();
  });
});
