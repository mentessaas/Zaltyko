import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  EntitlementSnapshot,
  SaasSubscriptionProjection,
} from "@/modules/billing/domain/plan-eligibility";
import {
  FAMILY_PAYMENT_METHODS_FLAG_ENV,
  isFamilyPaymentMethodsFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-payment-methods/application/config";
import {
  evaluateFamilyPaymentMethodAvailability,
  type FamilyPaymentPlanState,
} from "@/modules/family-payment-methods/domain/availability";
import {
  consentTextSha256,
  FAMILY_PAYMENT_CONSENT_VERSION,
  renderConsentText,
} from "@/modules/family-payment-methods/domain/consent";
import {
  truncateClientIp,
  truncateUserAgent,
} from "@/modules/family-payment-methods/domain/evidence";
import {
  verifyCompletedSetupIntent,
  type SetupIntentSnapshot,
} from "@/modules/family-payment-methods/domain/setup-verification";
import * as connectConfig from "@/modules/payments-connect/application/config";

/**
 * Pago automático de cuotas (cobro automático, Fase 2): dominio puro de
 * consentimiento, evidencia, disponibilidad y verificación de la preparación
 * en Stripe. Solo datos sintéticos y referencias inventadas.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("renderConsentText", () => {
  it("tarjeta: texto exacto con el nombre de la academia", () => {
    expect(
      renderConsentText({
        kind: "card",
        academyName: "Club Sintético",
        version: FAMILY_PAYMENT_CONSENT_VERSION,
      })
    ).toBe(
      "Autorizo a Club Sintético a cobrar automáticamente en esta tarjeta el importe de cada cuota que emita a mi familia. Puedo dejar de pagar automáticamente cuando quiera desde este portal. Los cobros ya enviados siguen su curso."
    );
  });

  it("domiciliación: texto exacto con el nombre de la academia", () => {
    expect(
      renderConsentText({
        kind: "sepa_debit",
        academyName: "Club Sintético",
        version: FAMILY_PAYMENT_CONSENT_VERSION,
      })
    ).toBe(
      "Autorizo a Club Sintético a cobrar automáticamente en esta cuenta bancaria, por domiciliación, el importe de cada cuota que emita a mi familia. Puedo dejar de pagar automáticamente cuando quiera desde este portal. Los cobros ya enviados siguen su curso."
    );
  });

  it("la versión vigente es el borrador del 16-11-2026", () => {
    expect(FAMILY_PAYMENT_CONSENT_VERSION).toBe("borrador-2026-11-16");
  });

  it("versión desconocida → lanza", () => {
    expect(() =>
      renderConsentText({ kind: "card", academyName: "Club Sintético", version: "v0" })
    ).toThrow();
    expect(() =>
      renderConsentText({ kind: "sepa_debit", academyName: "Club Sintético", version: "" })
    ).toThrow();
  });

  it("sin nombre de academia → lanza", () => {
    expect(() =>
      renderConsentText({
        kind: "card",
        academyName: "   ",
        version: FAMILY_PAYMENT_CONSENT_VERSION,
      })
    ).toThrow();
  });
});

describe("consentTextSha256", () => {
  it("SHA-256 hex de los bytes UTF-8 (vectores conocidos)", () => {
    expect(consentTextSha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(consentTextSha256("cuota ñ")).toBe(
      "3045be56c69c1a843e20050e3a8b2590e6016b7c510ebf5314a53bddd7cc6d05"
    );
  });

  it("estable para el mismo texto y distinto por academia y por método", () => {
    const render = (kind: "card" | "sepa_debit", academyName: string) =>
      consentTextSha256(
        renderConsentText({ kind, academyName, version: FAMILY_PAYMENT_CONSENT_VERSION })
      );
    const cardA = render("card", "Club A");
    expect(cardA).toMatch(/^[0-9a-f]{64}$/);
    expect(render("card", "Club A")).toBe(cardA);
    const hashes = new Set([cardA, render("card", "Club B"), render("sepa_debit", "Club A")]);
    expect(hashes.size).toBe(3);
  });
});

describe("truncateClientIp", () => {
  it("IPv4 → /24", () => {
    expect(truncateClientIp("203.0.113.77")).toBe("203.0.113.0");
  });

  it("IPv6 → /48", () => {
    expect(truncateClientIp("2001:db8:1:2::5")).toBe("2001:db8:1::");
    expect(truncateClientIp("2001:DB8:0001:abcd:1:2:3:4")).toBe("2001:db8:1::");
    expect(truncateClientIp("::1")).toBe("::");
  });

  it("IPv6 que envuelve una IPv4 → /24 de la IPv4", () => {
    expect(truncateClientIp("::ffff:203.0.113.77")).toBe("203.0.113.0");
  });

  it("lista «a, b» → la primera entrada", () => {
    expect(truncateClientIp("203.0.113.77, 10.0.0.1")).toBe("203.0.113.0");
    expect(truncateClientIp(" 2001:db8:1:2::5 ,203.0.113.77")).toBe("2001:db8:1::");
  });

  it("basura o ausente → null", () => {
    expect(truncateClientIp(null)).toBeNull();
    expect(truncateClientIp("")).toBeNull();
    expect(truncateClientIp("no-es-una-ip")).toBeNull();
    expect(truncateClientIp("999.1.1.1")).toBeNull();
    expect(truncateClientIp("203.0.113")).toBeNull();
    expect(truncateClientIp("2001:db8::1::2")).toBeNull();
    expect(truncateClientIp("unknown, 203.0.113.77")).toBeNull();
  });
});

describe("truncateUserAgent", () => {
  it("300 caracteres con salto de línea → 120 sin caracteres de control", () => {
    const raw = `${"A".repeat(100)}\n${"B".repeat(199)}`;
    expect(raw).toHaveLength(300);
    const result = truncateUserAgent(raw);
    expect(result).toBe(`${"A".repeat(100)} ${"B".repeat(19)}`);
    expect(result).toHaveLength(120);
    expect(
      Array.from(result ?? "").some((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
      })
    ).toBe(false);
  });

  it("agente corto se conserva; solo control o ausente → null", () => {
    expect(truncateUserAgent("Mozilla/5.0 (sintético)")).toBe("Mozilla/5.0 (sintético)");
    expect(truncateUserAgent("Mozilla/5.0\r\n\tPrueba")).toBe("Mozilla/5.0 Prueba");
    expect(truncateUserAgent("\n\t\u0000")).toBeNull();
    expect(truncateUserAgent(null)).toBeNull();
  });
});

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

type AvailabilityInput = Parameters<typeof evaluateFamilyPaymentMethodAvailability>[0];

const readyAccount = {
  status: "active",
  cardPaymentsCapabilityStatus: "active",
  sepaDebitPaymentsCapabilityStatus: "active",
};

const freePlan: FamilyPaymentPlanState = {
  entitlement: starterEntitlement({ planCode: "free", source: "bootstrap", subscriptionId: null }),
  subscription: null,
};

function eligibleInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    flagEnabled: true,
    environment: "test",
    productionDatabase: false,
    storageAvailable: true,
    isPayer: true,
    account: readyAccount,
    planState: { entitlement: starterEntitlement(), subscription: starterSubscription() },
    organizationId,
    now,
    ...overrides,
  };
}

describe("evaluateFamilyPaymentMethodAvailability", () => {
  it("todo listo y SEPA activa: tarjeta y domiciliación", () => {
    expect(evaluateFamilyPaymentMethodAvailability(eligibleInput())).toEqual({
      available: true,
      kinds: ["card", "sepa_debit"],
    });
  });

  it("SEPA no activa → solo tarjeta", () => {
    expect(
      evaluateFamilyPaymentMethodAvailability(
        eligibleInput({
          account: { ...readyAccount, sepaDebitPaymentsCapabilityStatus: "pending" },
        })
      )
    ).toEqual({ available: true, kinds: ["card"] });
    expect(
      evaluateFamilyPaymentMethodAvailability(
        eligibleInput({
          account: { ...readyAccount, sepaDebitPaymentsCapabilityStatus: "inactive" },
        })
      )
    ).toEqual({ available: true, kinds: ["card"] });
  });

  it("1. bandera apagada → flag_off (antes que cualquier otro motivo)", () => {
    expect(
      evaluateFamilyPaymentMethodAvailability(
        eligibleInput({
          flagEnabled: false,
          environment: null,
          productionDatabase: true,
          storageAvailable: false,
          isPayer: false,
          account: null,
          planState: freePlan,
        })
      )
    ).toEqual({ available: false, reason: "flag_off" });
  });

  it("2. entorno desconocido → environment_unknown", () => {
    expect(
      evaluateFamilyPaymentMethodAvailability(
        eligibleInput({
          environment: null,
          productionDatabase: true,
          storageAvailable: false,
          isPayer: false,
          account: null,
          planState: freePlan,
        })
      )
    ).toEqual({ available: false, reason: "environment_unknown" });
  });

  it("3. entorno live → live_not_released", () => {
    expect(
      evaluateFamilyPaymentMethodAvailability(
        eligibleInput({
          environment: "live",
          storageAvailable: false,
          isPayer: false,
          account: null,
          planState: freePlan,
        })
      )
    ).toEqual({ available: false, reason: "live_not_released" });
  });

  it("3b. clave de test con la base de producción → live_not_released (segundo cerrojo)", () => {
    expect(
      evaluateFamilyPaymentMethodAvailability(eligibleInput({ productionDatabase: true }))
    ).toEqual({ available: false, reason: "live_not_released" });
    expect(
      evaluateFamilyPaymentMethodAvailability(
        eligibleInput({
          productionDatabase: true,
          storageAvailable: false,
          isPayer: false,
          account: null,
          planState: freePlan,
        })
      )
    ).toEqual({ available: false, reason: "live_not_released" });
  });

  it("4. sin almacenamiento → storage_missing", () => {
    expect(
      evaluateFamilyPaymentMethodAvailability(
        eligibleInput({
          storageAvailable: false,
          isPayer: false,
          account: null,
          planState: freePlan,
        })
      )
    ).toEqual({ available: false, reason: "storage_missing" });
  });

  it("5. no es la persona pagadora → not_payer", () => {
    expect(
      evaluateFamilyPaymentMethodAvailability(
        eligibleInput({ isPayer: false, account: null, planState: freePlan })
      )
    ).toEqual({ available: false, reason: "not_payer" });
  });

  describe("6. cuenta de la academia", () => {
    it("sin cuenta conectada → account_not_ready (antes que el plan)", () => {
      expect(
        evaluateFamilyPaymentMethodAvailability(
          eligibleInput({ account: null, planState: freePlan })
        )
      ).toEqual({ available: false, reason: "account_not_ready" });
    });

    it("cuenta no activa → account_not_ready", () => {
      expect(
        evaluateFamilyPaymentMethodAvailability(
          eligibleInput({ account: { ...readyAccount, status: "restricted" } })
        )
      ).toEqual({ available: false, reason: "account_not_ready" });
    });

    it("tarjeta no activa (aunque SEPA sí) → account_not_ready", () => {
      expect(
        evaluateFamilyPaymentMethodAvailability(
          eligibleInput({
            account: { ...readyAccount, cardPaymentsCapabilityStatus: "pending" },
          })
        )
      ).toEqual({ available: false, reason: "account_not_ready" });
    });
  });

  describe("7. plan", () => {
    it("plan free → paid_plan_required", () => {
      expect(
        evaluateFamilyPaymentMethodAvailability(eligibleInput({ planState: freePlan }))
      ).toEqual({ available: false, reason: "paid_plan_required" });
    });

    it("suscripción en prueba (trialing) → paid_plan_required", () => {
      expect(
        evaluateFamilyPaymentMethodAvailability(
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

const expectedCard = {
  attemptId: "20000000-0000-4000-8000-000000000001",
  customerReference: "cus_synthetic_family",
  kind: "card" as const,
};

const expectedSepa = { ...expectedCard, kind: "sepa_debit" as const };

function cardIntent(overrides: Partial<SetupIntentSnapshot> = {}): SetupIntentSnapshot {
  return {
    id: "seti_synthetic_1",
    status: "succeeded",
    customer: "cus_synthetic_family",
    paymentMethod: "pm_synthetic_card",
    paymentMethodType: "card",
    mandate: null,
    metadataAttemptId: "20000000-0000-4000-8000-000000000001",
    ...overrides,
  };
}

function sepaIntent(overrides: Partial<SetupIntentSnapshot> = {}): SetupIntentSnapshot {
  return cardIntent({
    paymentMethod: "pm_synthetic_sepa",
    paymentMethodType: "sepa_debit",
    mandate: "mandate_synthetic_1",
    ...overrides,
  });
}

describe("verifyCompletedSetupIntent", () => {
  it("tarjeta completada → succeeded sin mandato", () => {
    expect(verifyCompletedSetupIntent(expectedCard, cardIntent())).toEqual({
      outcome: "succeeded",
      paymentMethodReference: "pm_synthetic_card",
      mandateReference: null,
    });
  });

  it("domiciliación completada → succeeded con mandato", () => {
    expect(verifyCompletedSetupIntent(expectedSepa, sepaIntent())).toEqual({
      outcome: "succeeded",
      paymentMethodReference: "pm_synthetic_sepa",
      mandateReference: "mandate_synthetic_1",
    });
  });

  it.each(["processing", "requires_action", "requires_confirmation", "requires_payment_method"])(
    "%s → pending",
    (status) => {
      expect(
        verifyCompletedSetupIntent(
          expectedCard,
          cardIntent({ status, paymentMethod: null, paymentMethodType: null })
        )
      ).toEqual({ outcome: "pending" });
    }
  );

  it("domiciliación en processing con el método ya puesto → pending", () => {
    expect(
      verifyCompletedSetupIntent(expectedSepa, sepaIntent({ status: "processing", mandate: null }))
    ).toEqual({ outcome: "pending" });
  });

  it("canceled → failed", () => {
    expect(
      verifyCompletedSetupIntent(expectedCard, cardIntent({ status: "canceled" }))
    ).toEqual({ outcome: "failed" });
  });

  describe("mismatch", () => {
    it("customer distinto", () => {
      expect(
        verifyCompletedSetupIntent(expectedCard, cardIntent({ customer: "cus_other" }))
      ).toEqual({ outcome: "mismatch" });
      expect(
        verifyCompletedSetupIntent(expectedCard, cardIntent({ customer: null }))
      ).toEqual({ outcome: "mismatch" });
    });

    it("intento distinto o sin intento en metadata", () => {
      expect(
        verifyCompletedSetupIntent(
          expectedCard,
          cardIntent({ metadataAttemptId: "20000000-0000-4000-8000-000000000002" })
        )
      ).toEqual({ outcome: "mismatch" });
      expect(
        verifyCompletedSetupIntent(expectedCard, cardIntent({ metadataAttemptId: null }))
      ).toEqual({ outcome: "mismatch" });
    });

    it("tipo de método distinto del elegido", () => {
      expect(verifyCompletedSetupIntent(expectedCard, sepaIntent())).toEqual({
        outcome: "mismatch",
      });
      expect(verifyCompletedSetupIntent(expectedSepa, cardIntent())).toEqual({
        outcome: "mismatch",
      });
      // También mientras sigue pendiente.
      expect(
        verifyCompletedSetupIntent(expectedCard, sepaIntent({ status: "processing" }))
      ).toEqual({ outcome: "mismatch" });
    });

    it("completada sin método o sin tipo", () => {
      expect(
        verifyCompletedSetupIntent(expectedCard, cardIntent({ paymentMethod: null }))
      ).toEqual({ outcome: "mismatch" });
      expect(
        verifyCompletedSetupIntent(expectedCard, cardIntent({ paymentMethodType: null }))
      ).toEqual({ outcome: "mismatch" });
    });

    it("domiciliación completada sin mandato", () => {
      expect(
        verifyCompletedSetupIntent(expectedSepa, sepaIntent({ mandate: null }))
      ).toEqual({ outcome: "mismatch" });
    });
  });
});

describe("config de pago automático", () => {
  it("la bandera solo se enciende con el texto exacto «true»", () => {
    expect(FAMILY_PAYMENT_METHODS_FLAG_ENV).toBe("ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED");
    vi.stubEnv(FAMILY_PAYMENT_METHODS_FLAG_ENV, "true");
    expect(isFamilyPaymentMethodsFlagEnabled()).toBe(true);
    vi.stubEnv(FAMILY_PAYMENT_METHODS_FLAG_ENV, "TRUE");
    expect(isFamilyPaymentMethodsFlagEnabled()).toBe(false);
    vi.stubEnv(FAMILY_PAYMENT_METHODS_FLAG_ENV, "1");
    expect(isFamilyPaymentMethodsFlagEnabled()).toBe(false);
    vi.stubEnv(FAMILY_PAYMENT_METHODS_FLAG_ENV, "");
    expect(isFamilyPaymentMethodsFlagEnabled()).toBe(false);
  });

  it("reexporta los cerrojos de entorno de Conectar Stripe", () => {
    expect(resolveConnectEnvironment).toBe(connectConfig.resolveConnectEnvironment);
    expect(isProductionDatabase).toBe(connectConfig.isProductionDatabase);
  });
});
