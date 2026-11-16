import { describe, expect, it } from "vitest";

import type { OrganizationPlanState } from "@/modules/billing/application/plan-state";
import type {
  EntitlementSnapshot,
  SaasSubscriptionProjection,
} from "@/modules/billing/domain/plan-eligibility";
import { evaluateConnectAvailability } from "@/modules/payments-connect/domain/availability";

/**
 * Conectar Stripe (cobro automático, Fase 1): disponibilidad pura por
 * bandera, entorno, almacenamiento, rol, país y plan. Solo datos sintéticos.
 */

const organizationId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-11-16T12:00:00.000Z");

function starterEntitlement(
  overrides: Partial<EntitlementSnapshot> = {}
): EntitlementSnapshot {
  return {
    organizationId,
    planCode: "starter",
    revision: 3,
    source: "stripe_subscription",
    sourceReference: "evt_synthetic_003",
    subscriptionId: "sub-projection-a",
    effectiveFrom: "2026-11-01T00:00:00.000Z",
    effectiveUntil: null,
    ...overrides,
  };
}

function starterSubscription(
  overrides: Partial<SaasSubscriptionProjection> = {}
): SaasSubscriptionProjection {
  return {
    id: "sub-projection-a",
    organizationId,
    provider: "stripe",
    environment: "test",
    providerAccountReference: "acct_synthetic",
    subscriptionReference: "sub_synthetic",
    planCode: "starter",
    providerStatus: "active",
    currentPeriodStartedAt: "2026-11-01T00:00:00.000Z",
    currentPeriodEndsAt: "2026-12-01T00:00:00.000Z",
    ...overrides,
  };
}

type AvailabilityInput = Parameters<typeof evaluateConnectAvailability>[0];

function eligibleInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  const planState: OrganizationPlanState = {
    entitlement: starterEntitlement(),
    subscription: starterSubscription(),
  };
  return {
    flagEnabled: true,
    environment: "test",
    storageAvailable: true,
    member: { role: "owner", locationScopeMode: "all" },
    countryCode: "ES",
    planState,
    organizationId,
    now,
    ...overrides,
  };
}

describe("evaluateConnectAvailability", () => {
  it("Starter activa, España y entorno de prueba: disponible", () => {
    expect(evaluateConnectAvailability(eligibleInput())).toEqual({
      available: true,
      environment: "test",
    });
  });

  it("1. bandera apagada → flag_off (antes que cualquier otro motivo)", () => {
    expect(
      evaluateConnectAvailability(
        eligibleInput({
          flagEnabled: false,
          environment: null,
          storageAvailable: false,
          member: { role: "coach", locationScopeMode: "selected" },
          countryCode: "MX",
        })
      )
    ).toEqual({ available: false, reason: "flag_off" });
  });

  it("2. entorno desconocido → environment_unknown", () => {
    expect(
      evaluateConnectAvailability(
        eligibleInput({ environment: null, storageAvailable: false })
      )
    ).toEqual({ available: false, reason: "environment_unknown" });
  });

  it("3. entorno live → live_not_released (siempre en esta fase)", () => {
    expect(
      evaluateConnectAvailability(eligibleInput({ environment: "live" }))
    ).toEqual({ available: false, reason: "live_not_released" });
    expect(
      evaluateConnectAvailability(
        eligibleInput({ environment: "live", storageAvailable: false })
      )
    ).toEqual({ available: false, reason: "live_not_released" });
  });

  it("4. sin almacenamiento → storage_missing", () => {
    expect(
      evaluateConnectAvailability(
        eligibleInput({
          storageAvailable: false,
          member: { role: "coach", locationScopeMode: "all" },
        })
      )
    ).toEqual({ available: false, reason: "storage_missing" });
  });

  describe("5. rol", () => {
    it("coach → role_not_allowed", () => {
      expect(
        evaluateConnectAvailability(
          eligibleInput({
            member: { role: "coach", locationScopeMode: "all" },
            countryCode: "MX",
          })
        )
      ).toEqual({ available: false, reason: "role_not_allowed" });
    });

    it("admin con sedes seleccionadas → role_not_allowed", () => {
      expect(
        evaluateConnectAvailability(
          eligibleInput({ member: { role: "admin", locationScopeMode: "selected" } })
        )
      ).toEqual({ available: false, reason: "role_not_allowed" });
    });

    it("admin con todas las sedes pasa", () => {
      expect(
        evaluateConnectAvailability(
          eligibleInput({ member: { role: "admin", locationScopeMode: "all" } })
        )
      ).toEqual({ available: true, environment: "test" });
    });
  });

  it("6. academia de México → country_not_supported", () => {
    expect(
      evaluateConnectAvailability(
        eligibleInput({
          countryCode: "MX",
          planState: { entitlement: null, subscription: null },
        })
      )
    ).toEqual({ available: false, reason: "country_not_supported" });
  });

  describe("7. plan", () => {
    it("plan free → paid_plan_required", () => {
      expect(
        evaluateConnectAvailability(
          eligibleInput({
            planState: {
              entitlement: starterEntitlement({
                planCode: "free",
                source: "bootstrap",
                subscriptionId: null,
              }),
              subscription: null,
            },
          })
        )
      ).toEqual({ available: false, reason: "paid_plan_required" });
    });

    it("suscripción en prueba (trialing) → paid_plan_required", () => {
      expect(
        evaluateConnectAvailability(
          eligibleInput({
            planState: {
              entitlement: starterEntitlement(),
              subscription: starterSubscription({ providerStatus: "trialing" }),
            },
          })
        )
      ).toEqual({ available: false, reason: "paid_plan_required" });
    });
  });
});
