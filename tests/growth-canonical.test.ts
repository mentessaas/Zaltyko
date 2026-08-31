import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/db", () => ({ db: dbMocks }));
vi.mock("server-only", () => ({}));
vi.mock("@/db/schema", () => ({
  growthEvents: {
    id: { column: "id" },
    eventId: { column: "event_id" },
    idempotencyKey: { column: "idempotency_key" },
  },
}));

import {
  buildCanonicalGrowthEvent,
  opaqueTransactionId,
  type CanonicalGrowthEventInput,
  type ReconciliationEvidence,
} from "@/lib/growth/canonical";
import { persistCanonicalGrowthEvent } from "@/lib/growth/canonical-adapter";
import { reconcileSyntheticGrowthData } from "@/lib/growth/reconciliation";
import { growthReconciliationFixture } from "./fixtures/growth-reconciliation";

const consent = {
  state: "granted" as const,
  revokedAt: null,
  policyVersion: "v1-2026-08-12",
};

const baseInput: CanonicalGrowthEventInput = {
  eventName: "feature_used",
  eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  businessKey: "action-1",
  userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  academyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  tenantId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  source: "product",
  environment: "sandbox",
  evidenceScope: "T",
  consent,
  currentPolicyVersion: "v1-2026-08-12",
  properties: {
    feature_key: "class_attendance_recorded",
    outcome: "confirmed",
    platform: "server",
    role: "owner",
    business_action_id: "action-1",
  },
};

function subscriptionEvidence(
  overrides: Partial<ReconciliationEvidence["db"]> = {},
  stripeOverrides: Partial<ReconciliationEvidence["stripe"]> = {}
): ReconciliationEvidence {
  return {
    providerEnvironment: "test",
    db: {
      subscriptionId: "db-internal-row",
      stripeSubscriptionId: "sub-test-001",
      status: "active",
      planCode: "starter",
      currency: "EUR",
      ...overrides,
    },
    stripe: {
      subscriptionId: "sub-test-001",
      status: "active",
      planCode: "starter",
      currency: "eur",
      livemode: false,
      ...stripeOverrides,
    },
  };
}

function subscriptionInput(
  reconciliation: ReconciliationEvidence
): CanonicalGrowthEventInput {
  return {
    ...baseInput,
    eventName: "subscription_created",
    source: "reconciliation",
    businessKey: "tx-subscription-001",
    transactionId: opaqueTransactionId("tx-subscription-001"),
    properties: {
      plan_code: "starter",
      currency: "eur",
      evidence_source: "db+stripe_test",
      subscription_lifecycle_version: "1",
    },
    reconciliation,
  };
}

describe("contrato canónico A3", () => {
  it("construye un sobre estable e idempotente", () => {
    const built = buildCanonicalGrowthEvent(baseInput);

    expect(built.canonicalEventName).toBe("feature_used");
    expect(built.aliasSource).toBeNull();
    expect(built.idempotencyKey).toBe("v1:feature_used:action-1");
    expect(built.row.eventId).toBe(baseInput.eventId);
    expect(built.row.schemaVersion).toBe(1);
    expect(built.row.environment).toBe("sandbox");
    expect(built.row.evidenceScope).toBe("T");
  });

  it("normaliza aliases sin duplicar el evento canónico", () => {
    const built = buildCanonicalGrowthEvent({
      ...baseInput,
      eventName: "pricing_viewed",
      businessKey: "pricing-1",
      properties: { platform: "web", surface: "pricing" },
    });

    expect(built.canonicalEventName).toBe("view_pricing");
    expect(built.aliasSource).toBe("pricing_viewed");
    expect(built.row.eventName).toBe("view_pricing");
  });

  it("rechaza consentimiento revocado, obsoleto y propiedades PII-like", () => {
    expect(() =>
      buildCanonicalGrowthEvent({
        ...baseInput,
        consent: { ...consent, state: "revoked" },
      })
    ).toThrow(/consentimiento/);

    expect(() =>
      buildCanonicalGrowthEvent({
        ...baseInput,
        currentPolicyVersion: "v0-2026-01-01",
      })
    ).toThrow(/consentimiento/);

    expect(() =>
      buildCanonicalGrowthEvent({
        ...baseInput,
        properties: { ...baseInput.properties, email_hash: "not-allowed" },
      })
    ).toThrow(/PII/);
  });

  it("exige policy explícita y conserva el vínculo tenant/academy", () => {
    expect(() =>
      buildCanonicalGrowthEvent({
        ...baseInput,
        currentPolicyVersion: undefined,
      })
    ).toThrow(/consentimiento/);

    expect(() =>
      buildCanonicalGrowthEvent({
        ...baseInput,
        tenantId: null,
      })
    ).toThrow(/tenantId/);
  });

  it("acepta onboarding completo y rechaza el hito incompleto", () => {
    const valid = buildCanonicalGrowthEvent({
      ...baseInput,
      eventName: "academy_activated",
      businessKey: "academy-1",
      onboardingTasks: {
        create_first_group: true,
        add_5_athletes: true,
        invite_first_coach: true,
      },
      properties: { completion_version: "1", academy_scope: "single" },
    });
    expect(valid.canonicalEventName).toBe("onboarding_completed");

    expect(() =>
      buildCanonicalGrowthEvent({
        ...baseInput,
        eventName: "academy_activated",
        businessKey: "academy-incomplete",
        properties: { completion_version: "1", academy_scope: "single" },
      })
    ).toThrow(/tres tareas/);
  });

  it("acepta subscription_created sólo con DB y Stripe test reconciliados", () => {
    const built = buildCanonicalGrowthEvent(
      subscriptionInput(subscriptionEvidence())
    );

    expect(built.canonicalEventName).toBe("subscription_created");
    expect(built.row.transactionId).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(built.row.planCode).toBe("starter");
  });

  it("rechaza discrepancias de plan y moneda aunque coincidan ID y estado", () => {
    expect(() =>
      buildCanonicalGrowthEvent(
        subscriptionInput(subscriptionEvidence({}, { planCode: "growth" }))
      )
    ).toThrow(/planCode discrepante/);

    expect(() =>
      buildCanonicalGrowthEvent(
        subscriptionInput(subscriptionEvidence({}, { currency: "usd" }))
      )
    ).toThrow(/currency discrepante/);
  });

  it("rechaza identificadores de transacción crudos y eventos desconocidos", () => {
    expect(() =>
      buildCanonicalGrowthEvent({
        ...baseInput,
        transactionId: "sub_test_123",
      })
    ).toThrow(/opaca/);

    expect(() =>
      buildCanonicalGrowthEvent({
        ...baseInput,
        eventName: "historical_unknown",
      })
    ).toThrow(/fuera de catálogo/);
  });

  it("marca discrepancias sintéticas y no cuenta retries como suscripciones", () => {
    const report = reconcileSyntheticGrowthData(growthReconciliationFixture);

    expect(report.subscriptionChecks).toEqual([
      expect.objectContaining({ transactionId: "tx-good", reconciled: true }),
      expect.objectContaining({
        transactionId: "tx-plan",
        reconciled: false,
        reason: "DB/Stripe discrepante: planCode",
      }),
      expect.objectContaining({
        transactionId: "tx-currency",
        reconciled: false,
        reason: "DB/Stripe discrepante: currency",
      }),
    ]);
    expect(report.duplicateIdempotencyKeys).toEqual([
      "v1:academy_created:academy-a",
    ]);
    expect(report.totalRows).toBe(7);
    expect(report.canonicalRows).toBe(6);
    expect(report.outOfContractRows).toHaveLength(1);
    expect(report.reproducible).toBe(false);
  });

  it("mantiene la migración aditiva y la frontera server-only verificables", () => {
    const migration = readFileSync(
      "supabase/migrations/20260825090000_growth_events_canonical_a3.sql",
      "utf8"
    );
    const adapter = readFileSync("src/lib/growth/canonical-adapter.ts", "utf8");

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS schema_version");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS event_id uuid");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS transaction_id");
    expect(migration).toContain("growth_events_event_id_unique");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE)\b/i);
    expect(adapter).toContain('import "server-only"');
    expect(adapter).toContain("onConflictDoNothing");
    expect(adapter).toContain('status: "duplicate"');
  });
});

function queryReturning<T>(rows: T[]) {
  const query = {
    values: vi.fn(() => query),
    onConflictDoNothing: vi.fn(() => query),
    returning: vi.fn(async () => rows),
  };
  dbMocks.insert.mockReturnValue(query);
  return query;
}

function querySelecting<T>(rows: T[]) {
  const query = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    limit: vi.fn(async () => rows),
  };
  dbMocks.select.mockReturnValue(query);
  return query;
}

function queryReturningError(error: Error) {
  const query = {
    values: vi.fn(() => query),
    onConflictDoNothing: vi.fn(() => query),
    returning: vi.fn(async () => {
      throw error;
    }),
  };
  dbMocks.insert.mockReturnValue(query);
  return query;
}

function storedCanonicalRow() {
  const now = new Date("2026-08-30T00:00:00.000Z");
  return {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    eventId: baseInput.eventId!,
    eventName: "feature_used",
    schemaVersion: 1,
    environment: "sandbox",
    evidenceScope: "T",
    source: "product",
    aliasSource: null,
    transactionId: null,
    userId: baseInput.userId!,
    academyId: baseInput.academyId!,
    tenantId: baseInput.tenantId!,
    planCode: null,
    properties: baseInput.properties!,
    idempotencyKey: "v1:feature_used:action-1",
    occurredAt: now,
    createdAt: now,
  };
}

describe("writer server-only del contrato A3", () => {
  it("persiste el event_id y la clave única sin perder el scope", async () => {
    const inserted = storedCanonicalRow();
    const query = queryReturning([inserted]);

    const result = await persistCanonicalGrowthEvent(baseInput);

    expect(result.status).toBe("inserted");
    expect(result.row.eventId).toBe(baseInput.eventId);
    expect(result.row.tenantId).toBe(baseInput.tenantId);
    expect(result.row.academyId).toBe(baseInput.academyId);
    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: baseInput.eventId,
        idempotencyKey: "v1:feature_used:action-1",
        tenantId: baseInput.tenantId,
        academyId: baseInput.academyId,
      })
    );
  });

  it("un retry con la misma clave devuelve la primera fila y no actualiza", async () => {
    const insertQuery = queryReturning([]);
    const selectQuery = querySelecting([storedCanonicalRow()]);

    const result = await persistCanonicalGrowthEvent(baseInput);

    expect(result.status).toBe("duplicate");
    expect(result.row.eventId).toBe(baseInput.eventId);
    expect(insertQuery.onConflictDoNothing).toHaveBeenCalled();
    expect(selectQuery.limit).toHaveBeenCalledWith(1);
  });

  it("no convierte una colisión con una fila histórica en evento canónico", async () => {
    queryReturning([]);
    querySelecting([
      {
        ...storedCanonicalRow(),
        schemaVersion: null,
        environment: null,
        evidenceScope: null,
      },
    ]);

    await expect(persistCanonicalGrowthEvent(baseInput)).rejects.toThrow(
      /CANONICAL_EVENT_CONFLICT/
    );
  });

  it("propaga una colisión de event_id con otra idempotency key", async () => {
    queryReturningError(new Error("growth_events_event_id_unique"));

    await expect(
      persistCanonicalGrowthEvent({ ...baseInput, businessKey: "action-2" })
    ).rejects.toThrow("growth_events_event_id_unique");
  });
});
