import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático (Fase 3): la preferencia de cobro de una familia.
 * Bandera apagada = comportamiento de siempre (409); con la bandera y los
 * cerrojos abiertos y plan de pago, se guarda y pasa a ser efectiva.
 */

const state = vi.hoisted(() => ({
  rows: new Map<unknown, Array<Record<string, unknown>>>(),
  executed: [] as string[],
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  visible: true,
}));

vi.mock("@/db", async () => {
  const { PgDialect: Dialect } = await import("drizzle-orm/pg-core");
  const dialect = new Dialect();
  const client = {
    select: () => {
      let table: unknown;
      const query = {
        from: (value: unknown) => {
          table = value;
          return query;
        },
        where: () => query,
        limit: async () => state.rows.get(table) ?? [],
      };
      return query;
    },
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        state.inserts.push(values);
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.updates.push(values);
        return { where: async () => undefined };
      },
    }),
    execute: async (statement: Parameters<InstanceType<typeof Dialect>["sqlToQuery"]>[0]) => {
      const text = dialect.sqlToQuery(statement).sql.replace(/\s+/g, " ");
      state.executed.push(text);
      return { rows: text.includes("as visible") ? [{ visible: state.visible }] : [] };
    },
  };
  return {
    db: {
      ...client,
      transaction: async (callback: (tx: unknown) => unknown) => callback(client),
    },
  };
});
vi.mock("@/modules/family-collection/application/config", () => ({
  isFamilyAutomaticCollectionFlagEnabled: vi.fn(),
  resolveConnectEnvironment: vi.fn(),
  isProductionDatabase: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));
vi.mock("@/modules/billing/application/plan-state", () => ({
  loadOrganizationPlanState: vi.fn(),
}));
vi.mock("@/modules/saas-billing/application/organization-usage", () => ({
  assertOrganizationOperationalWritable: vi.fn(),
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({
  appendAuditEntry: vi.fn(),
  appendOutboxEvent: vi.fn(),
}));

import { familyCollectionPreferences } from "@/db/zaltyko-schema";
import {
  getFamilyCollectionPreference,
  saveFamilyCollectionPreference,
} from "@/modules/billing/application/family-collection-preferences";
import { loadOrganizationPlanState } from "@/modules/billing/application/plan-state";
import type { EntitlementSnapshot } from "@/modules/billing/domain/plan-eligibility";
import {
  isFamilyAutomaticCollectionFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { appendAuditEntry } from "@/modules/shared/infrastructure/transactional-records";

const userId = "10000000-0000-4000-8000-000000000101";
const organizationId = "10000000-0000-4000-8000-000000000001";
const familyId = "10000000-0000-4000-8000-000000000601";

function ownerScope(): OwnerScope {
  return {
    organization: { id: organizationId, name: "Club Sintético", defaultCurrency: "EUR" },
    member: { id: "10000000-0000-4000-8000-000000000201", role: "owner", locationScopeMode: "all" },
    locations: [{ id: "10000000-0000-4000-8000-000000000002", name: "Sede" }],
    selectedLocationId: null,
    canViewOrganizationAggregate: true,
  };
}

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

function setOpen(open: boolean) {
  vi.mocked(isFamilyAutomaticCollectionFlagEnabled).mockReturnValue(open);
  vi.mocked(resolveConnectEnvironment).mockReturnValue("test");
  vi.mocked(isProductionDatabase).mockReturnValue(false);
}

const saveAutomatic = {
  userId,
  organizationId,
  familyId,
  mode: "automatic" as const,
  expectedVersion: 0,
  idempotencyKey: "family-preference-001",
};

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = new Map();
  state.executed = [];
  state.inserts = [];
  state.updates = [];
  state.visible = true;
  vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope());
  vi.mocked(loadOrganizationPlanState).mockResolvedValue({
    entitlement: entitlement("growth"),
    subscription: null,
  });
});

describe("preferencia de cobro con la bandera apagada", () => {
  it("sigue respondiendo 409 FAMILY_AUTOMATIC_COLLECTION_DISABLED sin escribir", async () => {
    setOpen(false);

    await expect(saveFamilyCollectionPreference(saveAutomatic)).rejects.toMatchObject({
      code: "FAMILY_AUTOMATIC_COLLECTION_DISABLED",
      status: 409,
    });
    expect(state.inserts).toEqual([]);
    // La familia sigue necesitando cuotas abiertas para verse.
    expect(state.executed.some((text) => text.includes("zaltyko.charges"))).toBe(true);
  });

  it("con la clave Live o la base de producción tampoco se abre", async () => {
    vi.mocked(isFamilyAutomaticCollectionFlagEnabled).mockReturnValue(true);
    vi.mocked(resolveConnectEnvironment).mockReturnValue("live");
    vi.mocked(isProductionDatabase).mockReturnValue(false);
    await expect(saveFamilyCollectionPreference(saveAutomatic)).rejects.toMatchObject({
      code: "FAMILY_AUTOMATIC_COLLECTION_DISABLED",
    });

    vi.mocked(resolveConnectEnvironment).mockReturnValue("test");
    vi.mocked(isProductionDatabase).mockReturnValue(true);
    await expect(saveFamilyCollectionPreference(saveAutomatic)).rejects.toMatchObject({
      code: "FAMILY_AUTOMATIC_COLLECTION_DISABLED",
    });
    expect(state.inserts).toEqual([]);
  });

  it("la lectura sigue siendo «siempre manual»", async () => {
    setOpen(false);
    state.rows.set(familyCollectionPreferences, [
      { requestedMode: "automatic", version: 2, entitlementRevision: 4 },
    ]);

    await expect(
      getFamilyCollectionPreference({ userId, organizationId, familyId })
    ).resolves.toEqual({
      organizationId,
      familyId,
      requestedMode: "automatic",
      effectiveMode: "manual",
      version: 2,
      entitlementRevision: 4,
      preferenceEntitlementRevision: 4,
      automaticPreferenceAvailable: false,
      automaticProcessingEnabled: false,
      automaticStatus: "not_released",
      requiresConfirmation: false,
    });
  });
});

describe("preferencia de cobro con el cobro automático abierto", () => {
  beforeEach(() => setOpen(true));

  it("guarda automatic con plan de pago y la devuelve efectiva", async () => {
    const result = await saveFamilyCollectionPreference(saveAutomatic);

    expect(state.inserts).toEqual([
      expect.objectContaining({
        organizationId,
        familyId,
        requestedMode: "automatic",
        entitlementRevision: 4,
        version: 1,
      }),
    ]);
    expect(result).toMatchObject({
      requestedMode: "automatic",
      effectiveMode: "automatic",
      automaticPreferenceAvailable: true,
      automaticProcessingEnabled: true,
      automaticStatus: "available",
      requiresConfirmation: false,
      preferenceEntitlementRevision: 4,
    });
    expect(appendAuditEntry).toHaveBeenCalledOnce();
  });

  it("se puede activar antes de la primera cuota (familia sin cuotas abiertas)", async () => {
    await saveFamilyCollectionPreference(saveAutomatic);

    const scopeChecks = state.executed.filter((text) => text.includes("as visible"));
    expect(scopeChecks.length).toBeGreaterThan(0);
    for (const text of scopeChecks) expect(text).not.toContain("zaltyko.charges");
  });

  it("una familia que no es de la academia sigue dando 404", async () => {
    state.visible = false;
    await expect(saveFamilyCollectionPreference(saveAutomatic)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
    expect(state.inserts).toEqual([]);
  });

  it("sin plan de pago responde 409 FEATURE_NOT_AVAILABLE sin escribir", async () => {
    vi.mocked(loadOrganizationPlanState).mockResolvedValue({
      entitlement: entitlement("free"),
      subscription: null,
    });

    await expect(saveFamilyCollectionPreference(saveAutomatic)).rejects.toMatchObject({
      code: "FEATURE_NOT_AVAILABLE",
      status: 409,
    });
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("una preferencia de otra revisión del plan pide confirmación y no es efectiva", async () => {
    state.rows.set(familyCollectionPreferences, [
      { requestedMode: "automatic", version: 2, entitlementRevision: 3 },
    ]);

    await expect(
      getFamilyCollectionPreference({ userId, organizationId, familyId })
    ).resolves.toMatchObject({
      requestedMode: "automatic",
      effectiveMode: "manual",
      requiresConfirmation: true,
      automaticPreferenceAvailable: true,
      entitlementRevision: 4,
      preferenceEntitlementRevision: 3,
    });
  });

  it("con plan gratuito la preferencia queda en manual con el motivo del plan", async () => {
    vi.mocked(loadOrganizationPlanState).mockResolvedValue({
      entitlement: entitlement("free"),
      subscription: null,
    });
    state.rows.set(familyCollectionPreferences, [
      { requestedMode: "automatic", version: 2, entitlementRevision: 4 },
    ]);

    await expect(
      getFamilyCollectionPreference({ userId, organizationId, familyId })
    ).resolves.toMatchObject({
      effectiveMode: "manual",
      automaticPreferenceAvailable: false,
      automaticStatus: "paid_plan_required",
      requiresConfirmation: false,
    });
  });
});
