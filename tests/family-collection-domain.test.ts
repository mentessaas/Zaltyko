import { afterEach, describe, expect, it, vi } from "vitest";

import { calendarDueDateToUtc } from "@/modules/billing/domain/calendar-due-date";
import type {
  EntitlementSnapshot,
  SaasSubscriptionProjection,
} from "@/modules/billing/domain/plan-eligibility";
import {
  FAMILY_AUTOMATIC_COLLECTION_FLAG_ENV,
  FAMILY_AUTOMATIC_SEPA_COLLECTION_FLAG_ENV,
  isFamilyAutomaticCollectionFlagEnabled,
  isFamilyAutomaticSepaCollectionFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import {
  ACCOUNT_FRESHNESS_MS,
  classifyGateReason,
  evaluateFamilyCollectionGate,
  REMINDER_SENT_REASON,
  SEPA_NOT_ENABLED_REASON,
  SUPPORTED_COLLECTION_CURRENCY,
  GATE_REASON_CLASSIFICATION,
  type FamilyCollectionGateCharge,
  type FamilyCollectionGateInput,
  type FamilyCollectionGateReason,
} from "@/modules/family-collection/domain/collection-gate";
import {
  addLocalDays,
  AMOUNT_BELOW_MINIMUM_CODE,
  collectionDate,
  isBelowCollectionMinimum,
  localCalendarDate,
  planInvoiceCollection,
  STRIPE_MINIMUM_AMOUNT_CENTS,
  startOfLocalDay,
  type CollectionPlanCharge,
  type CollectionPlanInvoice,
} from "@/modules/family-collection/domain/collection-plan";
import {
  AMOUNT_MISMATCH_REASON,
  CANCELED_IN_STRIPE_CODE,
  codeOf,
  collectionErrorOf,
  finalCreateErrorCode,
  INVALID_CREATE_REQUEST_CODE,
  isAuthenticationRequiredFailure,
  mapPaymentIntent,
  mapUnknownPaymentError,
  receivedMatches,
  receivedOf,
  snapshotOfPaymentIntent,
  type PaymentIntentSnapshot,
} from "@/modules/family-collection/domain/payment-outcome";
import {
  CARD_MAX_ATTEMPTS,
  CARD_RETRY_OFFSET_DAYS,
  NEVER_RETRY_DECLINE_CODES,
  nextRetry,
  SOFT_DECLINE_CODES,
} from "@/modules/family-collection/domain/retry-policy";
import { FAMILY_COLLECTION_MAX_ATTEMPTS_PER_INVOICE } from "@/modules/family-collection/infrastructure/family-collection-schema";
import * as connectConfig from "@/modules/payments-connect/application/config";

/**
 * Cobro automático de cuotas (Fase 3): dominio puro. Qué se cobra y cuándo
 * (P1, P2), la puerta completa, los reintentos (P3) y el resultado de Stripe.
 * Solo datos sintéticos y referencias inventadas.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

const MADRID = "Europe/Madrid";
const MEXICO = "America/Mexico_City";

// ---------------------------------------------------------------------------
// Día de cobro (P2)
// ---------------------------------------------------------------------------

describe("collectionDate", () => {
  it.each([
    ["sin día fijo: el día de vencimiento", "2026-11-10", null, "2026-11-10"],
    ["día fijo antes del vencimiento: el día de vencimiento", "2026-11-10", 5, "2026-11-10"],
    ["día fijo igual al vencimiento", "2026-11-10", 10, "2026-11-10"],
    ["día fijo después del vencimiento", "2026-11-10", 20, "2026-11-20"],
    ["día 1 con vencimiento el 1", "2026-11-01", 1, "2026-11-01"],
    ["día 31 en febrero de año bisiesto", "2028-02-01", 31, "2028-02-29"],
    ["día 31 en febrero de año no bisiesto", "2027-02-01", 31, "2027-02-28"],
    ["día 29 en febrero de año no bisiesto", "2027-02-10", 29, "2027-02-28"],
    ["día 30 en febrero de año bisiesto", "2028-02-10", 30, "2028-02-29"],
    ["día 31 en abril", "2026-04-01", 31, "2026-04-30"],
    ["día 31 en diciembre", "2026-12-01", 31, "2026-12-31"],
    ["día 31 con vencimiento el último día de febrero", "2027-02-28", 31, "2027-02-28"],
  ] as const)("%s", (_label, dueDateLocal, collectionDayOfMonth, expected) => {
    expect(collectionDate({ dueDateLocal, collectionDayOfMonth })).toBe(expected);
  });

  it.each([0, 32, 1.5, -1, Number.NaN])("rechaza el día de cobro %s", (day) => {
    expect(() =>
      collectionDate({ dueDateLocal: "2026-11-10", collectionDayOfMonth: day })
    ).toThrow(RangeError);
  });

  it.each(["2026-02-30", "2026-13-01", "10-11-2026", ""])(
    "rechaza la fecha de vencimiento %s",
    (dueDateLocal) => {
      expect(() => collectionDate({ dueDateLocal, collectionDayOfMonth: 5 })).toThrow(
        RangeError
      );
    }
  );
});

describe("localCalendarDate", () => {
  it("lee el vencimiento guardado como el día local de la sede", () => {
    // due_at son las 23:59:59.999 locales: en México ya es el día siguiente en UTC.
    const madridDue = calendarDueDateToUtc("2026-11-05", MADRID);
    const mexicoDue = calendarDueDateToUtc("2026-11-05", MEXICO);
    expect(madridDue).toBe("2026-11-05T22:59:59.999Z");
    expect(mexicoDue).toBe("2026-11-06T05:59:59.999Z");
    expect(localCalendarDate(madridDue, MADRID)).toBe("2026-11-05");
    expect(localCalendarDate(mexicoDue, MEXICO)).toBe("2026-11-05");
    expect(localCalendarDate(new Date(mexicoDue), MEXICO)).toBe("2026-11-05");
  });

  it("también en horario de verano", () => {
    const due = calendarDueDateToUtc("2026-07-31", MADRID);
    expect(due).toBe("2026-07-31T21:59:59.999Z");
    expect(localCalendarDate(due, MADRID)).toBe("2026-07-31");
  });

  it("rechaza un instante inválido", () => {
    expect(() => localCalendarDate("no-es-fecha", MADRID)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Qué se cobra (P1)
// ---------------------------------------------------------------------------

function invoice(overrides: Partial<CollectionPlanInvoice> = {}): CollectionPlanInvoice {
  return {
    id: "invoice-a",
    isMonthly: true,
    status: "issued",
    currency: "EUR",
    ...overrides,
  };
}

function charge(overrides: Partial<CollectionPlanCharge> = {}): CollectionPlanCharge {
  return {
    id: "charge-a",
    collectionMode: "automatic",
    status: "due",
    currency: "EUR",
    outstandingCents: 4500,
    dueAt: calendarDueDateToUtc("2026-11-10", MADRID),
    ...overrides,
  };
}

function plan(
  overrides: Partial<Parameters<typeof planInvoiceCollection>[0]> = {}
): ReturnType<typeof planInvoiceCollection> {
  return planInvoiceCollection({
    invoice: invoice(),
    charges: [charge()],
    todayLocal: "2026-11-10",
    collectionDayOfMonth: null,
    timezone: MADRID,
    ...overrides,
  });
}

describe("planInvoiceCollection", () => {
  it("cobra la suma de los saldos de las cuotas automáticas que vencen hoy", () => {
    expect(
      plan({
        charges: [
          charge({ id: "charge-a", outstandingCents: 4500 }),
          charge({ id: "charge-b", outstandingCents: 3000 }),
        ],
      })
    ).toEqual({
      collect: true,
      amountCents: 7500,
      allocations: [
        { chargeId: "charge-a", amountCents: 4500 },
        { chargeId: "charge-b", amountCents: 3000 },
      ],
    });
  });

  it("antes del día de vencimiento no cobra", () => {
    expect(plan({ todayLocal: "2026-11-09" })).toEqual({
      collect: false,
      reason: "not_due_yet",
    });
  });

  it("después del vencimiento sigue cobrando lo pendiente", () => {
    expect(plan({ todayLocal: "2026-11-25" })).toMatchObject({
      collect: true,
      amountCents: 4500,
    });
  });

  it("día fijo después del vencimiento: espera a ese día", () => {
    expect(plan({ collectionDayOfMonth: 20, todayLocal: "2026-11-19" })).toEqual({
      collect: false,
      reason: "not_due_yet",
    });
    expect(plan({ collectionDayOfMonth: 20, todayLocal: "2026-11-20" })).toMatchObject({
      collect: true,
      amountCents: 4500,
    });
  });

  it("día fijo antes del vencimiento: nunca antes del vencimiento", () => {
    expect(plan({ collectionDayOfMonth: 5, todayLocal: "2026-11-05" })).toEqual({
      collect: false,
      reason: "not_due_yet",
    });
    expect(plan({ collectionDayOfMonth: 5, todayLocal: "2026-11-10" })).toMatchObject({
      collect: true,
    });
  });

  it("día 31 en febrero no bisiesto: el último día del mes", () => {
    const dueAt = calendarDueDateToUtc("2027-02-05", MADRID);
    expect(
      plan({ charges: [charge({ dueAt })], collectionDayOfMonth: 31, todayLocal: "2027-02-27" })
    ).toEqual({ collect: false, reason: "not_due_yet" });
    expect(
      plan({ charges: [charge({ dueAt })], collectionDayOfMonth: 31, todayLocal: "2027-02-28" })
    ).toMatchObject({ collect: true });
  });

  it("pago parcial previo: solo el saldo", () => {
    expect(
      plan({ charges: [charge({ status: "partially_paid", outstandingCents: 2000 })] })
    ).toEqual({
      collect: true,
      amountCents: 2000,
      allocations: [{ chargeId: "charge-a", amountCents: 2000 }],
    });
  });

  it("cuota manual en la misma factura: no se cobra", () => {
    expect(
      plan({
        charges: [
          charge({ id: "charge-manual", collectionMode: "manual", outstandingCents: 4000 }),
          charge({ id: "charge-auto", outstandingCents: 3000 }),
        ],
      })
    ).toEqual({
      collect: true,
      amountCents: 3000,
      allocations: [{ chargeId: "charge-auto", amountCents: 3000 }],
    });
  });

  it("solo cuotas manuales: nada que cobrar", () => {
    expect(plan({ charges: [charge({ collectionMode: "manual" })] })).toEqual({
      collect: false,
      reason: "nothing_due",
    });
  });

  it.each([
    ["pagada", { status: "paid" as const }],
    ["anulada", { status: "void" as const }],
    ["sin saldo", { outstandingCents: 0 }],
    ["saldo negativo", { outstandingCents: -100 }],
    ["saldo no entero", { outstandingCents: 10.5 }],
  ])("cuota %s: nada que cobrar", (_label, overrides) => {
    expect(plan({ charges: [charge(overrides)] })).toEqual({
      collect: false,
      reason: "nothing_due",
    });
  });

  it("sin cuotas: nada que cobrar", () => {
    expect(plan({ charges: [] })).toEqual({ collect: false, reason: "nothing_due" });
  });

  it("factura no mensual: nunca se cobra sola", () => {
    expect(plan({ invoice: invoice({ isMonthly: false }) })).toEqual({
      collect: false,
      reason: "not_monthly",
    });
  });

  it.each(["draft", "paid", "void"] as const)("factura %s: cerrada", (status) => {
    expect(plan({ invoice: invoice({ status }) })).toEqual({
      collect: false,
      reason: "invoice_closed",
    });
  });

  it("factura pagada en parte: se cobra lo que queda", () => {
    expect(plan({ invoice: invoice({ status: "partially_paid" }) })).toMatchObject({
      collect: true,
    });
  });

  it("moneda distinta de la factura: no se cobra", () => {
    expect(
      plan({ charges: [charge({ id: "charge-a" }), charge({ id: "charge-b", currency: "USD" })] })
    ).toEqual({ collect: false, reason: "mixed_currency" });
  });

  it("solo entran las cuotas cuya fecha de cobro ya llegó, ordenadas por vencimiento", () => {
    expect(
      plan({
        todayLocal: "2026-11-10",
        charges: [
          charge({ id: "charge-late", dueAt: calendarDueDateToUtc("2026-11-15", MADRID) }),
          charge({ id: "charge-b", outstandingCents: 1000 }),
          charge({
            id: "charge-c",
            outstandingCents: 2000,
            dueAt: calendarDueDateToUtc("2026-11-01", MADRID),
          }),
          charge({ id: "charge-a", outstandingCents: 500 }),
        ],
      })
    ).toEqual({
      collect: true,
      amountCents: 3500,
      allocations: [
        { chargeId: "charge-c", amountCents: 2000 },
        { chargeId: "charge-a", amountCents: 500 },
        { chargeId: "charge-b", amountCents: 1000 },
      ],
    });
  });

  it("límite de día en Madrid: la medianoche local cuenta, no la de UTC", () => {
    const dueAt = calendarDueDateToUtc("2026-11-05", MADRID);
    // 23:30 del día 4 en Madrid (22:30 UTC): todavía no.
    const before = localCalendarDate(new Date("2026-11-04T22:30:00.000Z"), MADRID);
    // 00:30 del día 5 en Madrid, aunque en UTC aún sea el día 4.
    const after = localCalendarDate(new Date("2026-11-04T23:30:00.000Z"), MADRID);
    expect(before).toBe("2026-11-04");
    expect(after).toBe("2026-11-05");
    expect(plan({ charges: [charge({ dueAt })], todayLocal: before })).toEqual({
      collect: false,
      reason: "not_due_yet",
    });
    expect(plan({ charges: [charge({ dueAt })], todayLocal: after })).toMatchObject({
      collect: true,
    });
  });

  it("límite de día en Ciudad de México: el vencimiento se lee en la hora local", () => {
    // Vence el 5 en México: due_at es el 6 en UTC.
    const dueAt = calendarDueDateToUtc("2026-11-05", MEXICO);
    // 23:30 del día 4 en México (05:30 UTC del 5): todavía no.
    const before = localCalendarDate(new Date("2026-11-05T05:30:00.000Z"), MEXICO);
    // 23:30 del día 5 en México, aunque en UTC ya sea el día 6.
    const sameDay = localCalendarDate(new Date("2026-11-06T05:30:00.000Z"), MEXICO);
    expect(before).toBe("2026-11-04");
    expect(sameDay).toBe("2026-11-05");
    const input = { charges: [charge({ dueAt })], timezone: MEXICO };
    expect(plan({ ...input, todayLocal: before })).toEqual({
      collect: false,
      reason: "not_due_yet",
    });
    expect(plan({ ...input, todayLocal: sameDay })).toMatchObject({ collect: true });
    expect(plan({ ...input, todayLocal: sameDay, collectionDayOfMonth: 5 })).toMatchObject({
      collect: true,
    });
  });

  it("rechaza una fecha de hoy inválida", () => {
    expect(() => plan({ todayLocal: "2026-11-31" })).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Puerta completa
// ---------------------------------------------------------------------------

const gateNow = new Date("2026-11-10T09:00:00.000Z");

function paidEntitlement(overrides: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot {
  return {
    organizationId: "org-a",
    planCode: "growth",
    revision: 4,
    source: "stripe_subscription",
    sourceReference: "evt_synthetic_004",
    subscriptionId: "sub-projection-a",
    effectiveFrom: "2026-11-01T00:00:00.000Z",
    effectiveUntil: "2026-12-01T00:00:00.000Z",
    ...overrides,
  };
}

function paidSubscription(
  overrides: Partial<SaasSubscriptionProjection> = {}
): SaasSubscriptionProjection {
  return {
    id: "sub-projection-a",
    organizationId: "org-a",
    provider: "stripe",
    environment: "test",
    providerAccountReference: "acct_synthetic",
    subscriptionReference: "sub_synthetic",
    planCode: "growth",
    providerStatus: "active",
    currentPeriodStartedAt: "2026-11-01T00:00:00.000Z",
    currentPeriodEndsAt: "2026-12-01T00:00:00.000Z",
    ...overrides,
  };
}

function gateCharge(
  overrides: Partial<FamilyCollectionGateCharge> = {}
): FamilyCollectionGateCharge {
  return {
    id: "charge-a",
    organizationId: "org-a",
    familyId: "family-a",
    familyPayerId: "payer-a",
    collectionMode: "automatic",
    ...overrides,
  };
}

function gateInput(): FamilyCollectionGateInput {
  return {
    flagEnabled: true,
    environment: "test",
    productionDatabase: false,
    storageAvailable: true,
    reminderSent: false,
    // Los casos de domiciliación sin activar van en su propio bloque.
    sepaEnabled: true,
    organization: { id: "org-a", status: "active" },
    entitlement: paidEntitlement(),
    subscription: paidSubscription(),
    preference: {
      organizationId: "org-a",
      familyId: "family-a",
      requestedMode: "automatic",
      entitlementRevision: 4,
    },
    // Sin cambios reales del plan desde la revisión 4 (la vigente).
    planChangeRevision: 4,
    invoice: {
      organizationId: "org-a",
      familyId: "family-a",
      familyPayerId: "payer-a",
      currency: "EUR",
    },
    charges: [gateCharge({ id: "charge-a" }), gateCharge({ id: "charge-b" })],
    providerAccount: {
      id: "provider-account-a",
      organizationId: "org-a",
      processor: "stripe",
      environment: "test",
      accountsApiGeneration: 2,
      chargeModel: "direct",
      status: "active",
      cardPaymentsCapabilityStatus: "active",
      sepaDebitPaymentsCapabilityStatus: "active",
      lastSyncedAt: "2026-11-10T08:30:00.000Z",
    },
    authorization: {
      organizationId: "org-a",
      familyId: "family-a",
      familyPayerId: "payer-a",
      paymentProviderAccountId: "provider-account-a",
      status: "active",
      consentVersion: "consent-v1",
      consentEvidenceReference: "synthetic-consent-object-ref",
      consentEvidenceSha256: "a".repeat(64),
      consentedAt: "2026-11-01T10:00:00.000Z",
      consentedByGuardianId: "guardian-a",
      validUntil: null,
      revokedAt: null,
      paymentMethodKind: "card",
      paymentMethodReference: "pm_synthetic_a",
      mandateReference: null,
    },
    customerReference: "cus_synthetic_a",
    payer: {
      id: "payer-a",
      organizationId: "org-a",
      familyId: "family-a",
      startsOn: "2026-09-01",
      endsOn: null,
      guardianActive: true,
      guardianLinkActive: true,
    },
    todayLocal: "2026-11-10",
    now: gateNow,
  };
}

function sepaInput(): FamilyCollectionGateInput {
  const input = gateInput();
  return {
    ...input,
    authorization: {
      ...input.authorization!,
      paymentMethodKind: "sepa_debit",
      paymentMethodReference: "pm_synthetic_sepa",
      mandateReference: "mandate_synthetic_a",
    },
  };
}

function gate(mutate?: (input: FamilyCollectionGateInput) => void) {
  const input = gateInput();
  mutate?.(input);
  return evaluateFamilyCollectionGate(input);
}

describe("evaluateFamilyCollectionGate", () => {
  it("deja cobrar con tarjeta", () => {
    expect(gate()).toEqual({ allowed: true, paymentMethodKind: "card" });
  });

  it("deja cobrar con domiciliación", () => {
    expect(evaluateFamilyCollectionGate(sepaInput())).toEqual({
      allowed: true,
      paymentMethodKind: "sepa_debit",
    });
  });

  // Academia operativa = en prueba o activa (arreglo del 17-11-2026).
  it("deja cobrar a una academia en prueba con plan de pago vigente", () => {
    expect(
      gate((input) => {
        input.organization = { id: "org-a", status: "trial" };
      })
    ).toEqual({ allowed: true, paymentMethodKind: "card" });
  });

  it("una academia en prueba sin plan de pago no cobra: lo decide el plan (pasajero)", () => {
    expect(
      gate((input) => {
        input.organization = { id: "org-a", status: "trial" };
        input.entitlement = paidEntitlement({
          planCode: "free",
          source: "bootstrap",
          subscriptionId: null,
        });
      })
    ).toEqual({ allowed: false, reason: "paid_plan_required", classification: "transient" });
  });

  it.each<[string, (input: FamilyCollectionGateInput) => void, FamilyCollectionGateReason]>([
    ["bandera apagada", (input) => { input.flagEnabled = false; }, "flag_off"],
    ["clave desconocida", (input) => { input.environment = null; }, "environment_unknown"],
    ["clave de Live", (input) => { input.environment = "live"; }, "live_not_released"],
    [
      "base de producción con clave de test",
      (input) => { input.productionDatabase = true; },
      "live_not_released",
    ],
    ["sin almacenamiento", (input) => { input.storageAvailable = false; }, "storage_missing"],
  ])("%s → %s (pasajero)", (_label, mutate, reason) => {
    expect(gate(mutate)).toEqual({ allowed: false, reason, classification: "transient" });
  });

  it("la bandera apagada manda sobre cualquier otro motivo", () => {
    expect(
      gate((input) => {
        input.flagEnabled = false;
        input.environment = "live";
        input.storageAvailable = false;
        input.payer = null;
      })
    ).toMatchObject({ reason: "flag_off" });
  });

  it("una renovación del plan después de guardar la preferencia no la invalida", () => {
    expect(
      gate((input) => {
        // Renovaciones de Stripe: revisiones 5 y 6 con el mismo plan y suscripción.
        input.entitlement = paidEntitlement({ revision: 6 });
        input.planChangeRevision = 4;
      })
    ).toEqual({ allowed: true, paymentMethodKind: "card" });
  });

  it("un cambio real del plan después de guardar la preferencia la invalida (final)", () => {
    expect(
      gate((input) => {
        input.entitlement = paidEntitlement({ revision: 6 });
        input.planChangeRevision = 5;
      })
    ).toEqual({ allowed: false, reason: "preference_entitlement_stale", classification: "final" });
  });

  it("sin la revisión del último cambio real exige la revisión vigente exacta", () => {
    expect(
      gate((input) => {
        input.entitlement = paidEntitlement({ revision: 6 });
        input.planChangeRevision = null;
      })
    ).toEqual({ allowed: false, reason: "preference_entitlement_stale", classification: "final" });
  });

  it("aplica la puerta existente a cada cuota del reparto: la segunda es manual", () => {
    expect(
      gate((input) => {
        input.charges = [gateCharge({ id: "charge-a" }), gateCharge({ id: "charge-b", collectionMode: "manual" })];
      })
    ).toEqual({ allowed: false, reason: "charge_manual", classification: "final" });
  });

  it("cada cuota debe tener el pagador de la factura", () => {
    expect(
      gate((input) => {
        input.charges = [gateCharge({ id: "charge-a" }), gateCharge({ id: "charge-b", familyPayerId: "payer-b" })];
      })
    ).toEqual({ allowed: false, reason: "charge_payer_mismatch", classification: "final" });
    expect(
      gate((input) => {
        input.charges = [gateCharge({ familyPayerId: null })];
      })
    ).toMatchObject({ reason: "charge_payer_mismatch" });
  });

  it("cuota de otra familia", () => {
    expect(
      gate((input) => {
        input.charges = [gateCharge({ id: "charge-a" }), gateCharge({ id: "charge-b", familyId: "family-b" })];
      })
    ).toEqual({ allowed: false, reason: "charge_scope_mismatch", classification: "final" });
  });

  it("factura de otra familia", () => {
    expect(
      gate((input) => {
        input.invoice = { ...input.invoice, familyId: "family-b" };
      })
    ).toMatchObject({ reason: "charge_scope_mismatch", classification: "final" });
  });

  it("factura sin pagador: no hay autorización que valga", () => {
    expect(
      gate((input) => {
        input.invoice = { ...input.invoice, familyPayerId: null };
        input.charges = [gateCharge({ familyPayerId: null })];
      })
    ).toEqual({ allowed: false, reason: "authorization_missing", classification: "final" });
  });

  it.each<[string, (input: FamilyCollectionGateInput) => void, FamilyCollectionGateReason, "transient" | "final"]>([
    ["sin plan", (input) => { input.entitlement = null; }, "entitlement_missing", "transient"],
    [
      "plan gratuito",
      (input) => {
        input.entitlement = paidEntitlement({
          planCode: "free",
          source: "bootstrap",
          subscriptionId: null,
        });
      },
      "paid_plan_required",
      "transient",
    ],
    [
      "suscripción impagada",
      (input) => { input.subscription = paidSubscription({ providerStatus: "past_due" }); },
      "subscription_not_active",
      "transient",
    ],
    [
      "academia suspendida",
      (input) => { input.organization = { id: "org-a", status: "suspended" }; },
      "organization_not_active",
      "final",
    ],
    [
      "academia cerrada",
      (input) => { input.organization = { id: "org-a", status: "closed" }; },
      "organization_not_active",
      "final",
    ],
    [
      "la academia pasó la familia a manual",
      (input) => { input.preference = { ...input.preference, requestedMode: "manual" }; },
      "preference_manual",
      "final",
    ],
    [
      "cuenta sin cobros con tarjeta",
      (input) => {
        input.providerAccount = {
          ...input.providerAccount!,
          cardPaymentsCapabilityStatus: "inactive",
        };
      },
      "provider_not_ready",
      "final",
    ],
    [
      "la familia revocó el método",
      (input) => {
        input.authorization = {
          ...input.authorization!,
          status: "revoked",
          revokedAt: "2026-11-09T10:00:00.000Z",
        };
      },
      "authorization_inactive",
      "final",
    ],
    [
      "autorización de otro pagador",
      (input) => {
        input.authorization = { ...input.authorization!, familyPayerId: "payer-b" };
      },
      "authorization_scope_mismatch",
      "final",
    ],
    ["sin autorización", (input) => { input.authorization = null; }, "authorization_missing", "final"],
  ])("puerta existente: %s → %s", (_label, mutate, reason, classification) => {
    expect(gate(mutate)).toEqual({ allowed: false, reason, classification });
  });

  it("la puerta existente va antes que el pagador", () => {
    expect(
      gate((input) => {
        input.preference = { ...input.preference, requestedMode: "manual" };
        input.payer = null;
      })
    ).toMatchObject({ reason: "preference_manual" });
  });

  it.each<[string, (input: FamilyCollectionGateInput) => void, FamilyCollectionGateReason]>([
    ["sin pagador", (input) => { input.payer = null; }, "payer_missing"],
    [
      "otro pagador",
      (input) => { input.payer = { ...input.payer!, id: "payer-b" }; },
      "payer_missing",
    ],
    [
      "pagador de otra familia",
      (input) => { input.payer = { ...input.payer!, familyId: "family-b" }; },
      "payer_missing",
    ],
    [
      "pagador cerrado ayer",
      (input) => { input.payer = { ...input.payer!, endsOn: "2026-11-09" }; },
      "payer_not_current",
    ],
    [
      "pagador que empieza mañana",
      (input) => { input.payer = { ...input.payer!, startsOn: "2026-11-11" }; },
      "payer_not_current",
    ],
    [
      "tutor inactivo",
      (input) => { input.payer = { ...input.payer!, guardianActive: false }; },
      "payer_not_current",
    ],
    [
      "vínculo con la familia inactivo",
      (input) => { input.payer = { ...input.payer!, guardianLinkActive: false }; },
      "payer_not_current",
    ],
    [
      "tipo de método desconocido",
      (input) => {
        input.authorization = { ...input.authorization!, paymentMethodKind: null };
      },
      "payment_method_unknown",
    ],
    [
      "tipo de método no admitido",
      (input) => {
        input.authorization = { ...input.authorization!, paymentMethodKind: "paypal" };
      },
      "payment_method_unknown",
    ],
    [
      "sin método guardado",
      (input) => {
        input.authorization = { ...input.authorization!, paymentMethodReference: " " };
      },
      "payment_method_unknown",
    ],
    ["sin Customer", (input) => { input.customerReference = null; }, "payment_method_unknown"],
  ])("%s → %s (final)", (_label, mutate, reason) => {
    expect(gate(mutate)).toEqual({ allowed: false, reason, classification: "final" });
  });

  it("el último día del pagador todavía cobra", () => {
    expect(
      gate((input) => {
        input.payer = { ...input.payer!, endsOn: "2026-11-10" };
      })
    ).toMatchObject({ allowed: true });
  });

  it("domiciliación sin orden: método incompleto", () => {
    const input = sepaInput();
    input.authorization = { ...input.authorization!, mandateReference: null };
    expect(evaluateFamilyCollectionGate(input)).toEqual({
      allowed: false,
      reason: "payment_method_unknown",
      classification: "final",
    });
  });

  it("domiciliación con la capacidad SEPA inactiva en la cuenta", () => {
    const input = sepaInput();
    input.providerAccount = {
      ...input.providerAccount!,
      sepaDebitPaymentsCapabilityStatus: "inactive",
    };
    expect(evaluateFamilyCollectionGate(input)).toEqual({
      allowed: false,
      reason: "sepa_not_active",
      classification: "final",
    });
  });

  it("la tarjeta no necesita la capacidad SEPA", () => {
    expect(
      gate((input) => {
        input.providerAccount = {
          ...input.providerAccount!,
          sepaDebitPaymentsCapabilityStatus: "inactive",
        };
      })
    ).toMatchObject({ allowed: true });
  });

  it.each<[string, Date | string | null]>([
    ["nunca releída", null],
    ["releída hace más de una hora", new Date(gateNow.getTime() - ACCOUNT_FRESHNESS_MS - 1)],
    ["fecha ilegible", "no-es-fecha"],
  ])("cuenta %s → account_stale (pasajero)", (_label, lastSyncedAt) => {
    expect(
      gate((input) => {
        input.providerAccount = { ...input.providerAccount!, lastSyncedAt };
      })
    ).toEqual({ allowed: false, reason: "account_stale", classification: "transient" });
  });

  it("cuenta sin releer con la tarjeta inactiva: pasajero, nunca una cancelación", () => {
    expect(
      gate((input) => {
        input.providerAccount = {
          ...input.providerAccount!,
          cardPaymentsCapabilityStatus: "inactive",
          lastSyncedAt: new Date(gateNow.getTime() - 2 * ACCOUNT_FRESHNESS_MS),
        };
      })
    ).toEqual({ allowed: false, reason: "account_stale", classification: "transient" });
  });

  it("la cuenta sin releer va antes que la puerta existente, la moneda y la domiciliación", () => {
    const stale = new Date(gateNow.getTime() - 2 * ACCOUNT_FRESHNESS_MS);
    expect(
      gate((input) => {
        input.providerAccount = { ...input.providerAccount!, lastSyncedAt: stale };
        input.invoice = { ...input.invoice, currency: "USD" };
        input.preference = { ...input.preference, requestedMode: "manual" };
        input.charges = [gateCharge({ familyPayerId: "payer-b" })];
      })
    ).toMatchObject({ reason: "account_stale", classification: "transient" });
    const sepa = sepaInput();
    sepa.providerAccount = {
      ...sepa.providerAccount!,
      sepaDebitPaymentsCapabilityStatus: "inactive",
      lastSyncedAt: stale,
    };
    expect(evaluateFamilyCollectionGate(sepa)).toMatchObject({ reason: "account_stale" });
  });

  it("los cerrojos y el almacenamiento van antes que la cuenta sin releer", () => {
    expect(
      gate((input) => {
        input.storageAvailable = false;
        input.providerAccount = { ...input.providerAccount!, lastSyncedAt: null };
      })
    ).toMatchObject({ reason: "storage_missing" });
  });

  it("sin cuenta: lo decide la puerta existente", () => {
    expect(
      gate((input) => {
        input.providerAccount = null;
      })
    ).toEqual({ allowed: false, reason: "provider_not_ready", classification: "final" });
  });

  it("solo se cobra en euros", () => {
    expect(SUPPORTED_COLLECTION_CURRENCY).toBe("EUR");
  });

  it.each(["USD", "MXN", "eur", ""])("factura en %s → unsupported_currency (final)", (currency) => {
    expect(
      gate((input) => {
        input.invoice = { ...input.invoice, currency };
      })
    ).toEqual({ allowed: false, reason: "unsupported_currency", classification: "final" });
  });

  it("la moneda va antes que la puerta existente", () => {
    expect(
      gate((input) => {
        input.invoice = { ...input.invoice, currency: "USD" };
        input.preference = { ...input.preference, requestedMode: "manual" };
      })
    ).toMatchObject({ reason: "unsupported_currency" });
  });

  it("cuenta releída hace justo una hora: vale", () => {
    expect(
      gate((input) => {
        input.providerAccount = {
          ...input.providerAccount!,
          lastSyncedAt: new Date(gateNow.getTime() - ACCOUNT_FRESHNESS_MS),
        };
      })
    ).toMatchObject({ allowed: true });
  });

  it("sin cuotas en el reparto es un error de quien llama", () => {
    expect(() =>
      gate((input) => {
        input.charges = [];
      })
    ).toThrow(RangeError);
  });

  describe("recordatorio de pago ya enviado (reminder_sent)", () => {
    it("final: con un recordatorio enviado nunca se cobra, aunque todo lo demás deje pasar", () => {
      expect(REMINDER_SENT_REASON).toBe("reminder_sent");
      expect(gate((input) => { input.reminderSent = true; })).toEqual({
        allowed: false,
        reason: "reminder_sent",
        classification: "final",
      });
      expect(
        evaluateFamilyCollectionGate({ ...sepaInput(), reminderSent: true })
      ).toMatchObject({ allowed: false, reason: "reminder_sent" });
    });

    it("cabe en failure_code de la candidata (minúsculas, dígitos y guion bajo, hasta 64)", () => {
      expect(REMINDER_SENT_REASON).toMatch(/^[a-z0-9_]{1,64}$/);
    });

    it.each<[string, (input: FamilyCollectionGateInput) => void, FamilyCollectionGateReason]>([
      ["bandera apagada", (input) => { input.flagEnabled = false; }, "flag_off"],
      ["clave de Live", (input) => { input.environment = "live"; }, "live_not_released"],
      ["base de producción", (input) => { input.productionDatabase = true; }, "live_not_released"],
      ["sin almacenamiento", (input) => { input.storageAvailable = false; }, "storage_missing"],
    ])("va después de: %s → %s (pasajero, no se escribe nada)", (_label, mutate, reason) => {
      expect(
        gate((input) => {
          input.reminderSent = true;
          mutate(input);
        })
      ).toEqual({ allowed: false, reason, classification: "transient" });
    });

    it.each<[string, (input: FamilyCollectionGateInput) => void]>([
      [
        "cuenta sin releer",
        (input) => {
          input.providerAccount = { ...input.providerAccount!, lastSyncedAt: "2026-11-01T00:00:00.000Z" };
        },
      ],
      ["sin plan", (input) => { input.entitlement = null; }],
      ["suscripción impagada", (input) => { input.subscription = paidSubscription({ providerStatus: "past_due" }); }],
      ["otra moneda", (input) => { input.invoice = { ...input.invoice, currency: "MXN" }; }],
      ["la familia pasó a manual", (input) => { input.preference = { ...input.preference, requestedMode: "manual" }; }],
      ["sin autorización", (input) => { input.authorization = null; }],
      ["sin pagador", (input) => { input.payer = null; }],
    ])("va antes de: %s", (_label, mutate) => {
      expect(
        gate((input) => {
          input.reminderSent = true;
          mutate(input);
        })
      ).toEqual({ allowed: false, reason: "reminder_sent", classification: "final" });
    });
  });

  describe("domiciliación sin activar (D2, «Primero solo tarjeta»: sepa_not_enabled)", () => {
    /** Domiciliación completa con ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED apagada. */
    function sepaOff(mutate?: (input: FamilyCollectionGateInput) => void) {
      const input = sepaInput();
      input.sepaEnabled = false;
      mutate?.(input);
      return evaluateFamilyCollectionGate(input);
    }

    it("final: con la bandera de la domiciliación apagada nunca se cobra una domiciliación", () => {
      expect(SEPA_NOT_ENABLED_REASON).toBe("sepa_not_enabled");
      expect(sepaOff()).toEqual({ allowed: false, reason: "sepa_not_enabled", classification: "final" });
    });

    it("la tarjeta se cobra igual con la bandera de la domiciliación apagada", () => {
      expect(gate((input) => { input.sepaEnabled = false; })).toEqual({ allowed: true, paymentMethodKind: "card" });
    });

    it("con la bandera de la domiciliación encendida, la domiciliación se cobra como hoy", () => {
      expect(evaluateFamilyCollectionGate({ ...sepaInput(), sepaEnabled: true })).toEqual({
        allowed: true,
        paymentMethodKind: "sepa_debit",
      });
    });

    it("cabe en failure_code de la candidata (minúsculas, dígitos y guion bajo, hasta 64)", () => {
      expect(SEPA_NOT_ENABLED_REASON).toMatch(/^[a-z0-9_]{1,64}$/);
    });

    it.each<[string, (input: FamilyCollectionGateInput) => void, FamilyCollectionGateReason]>([
      ["bandera apagada", (input) => { input.flagEnabled = false; }, "flag_off"],
      ["clave de Live", (input) => { input.environment = "live"; }, "live_not_released"],
      ["base de producción", (input) => { input.productionDatabase = true; }, "live_not_released"],
      ["sin almacenamiento", (input) => { input.storageAvailable = false; }, "storage_missing"],
    ])("va después de: %s → %s (pasajero, no se escribe nada)", (_label, mutate, reason) => {
      expect(sepaOff(mutate)).toEqual({ allowed: false, reason, classification: "transient" });
    });

    it("va después de un recordatorio ya enviado (los dos son finales)", () => {
      expect(sepaOff((input) => { input.reminderSent = true; })).toMatchObject({ reason: "reminder_sent" });
    });

    it.each<[string, (input: FamilyCollectionGateInput) => void]>([
      [
        "cuenta sin releer",
        (input) => {
          input.providerAccount = { ...input.providerAccount!, lastSyncedAt: "2026-11-01T00:00:00.000Z" };
        },
      ],
      ["sin plan", (input) => { input.entitlement = null; }],
      ["suscripción impagada", (input) => { input.subscription = paidSubscription({ providerStatus: "past_due" }); }],
      ["otra moneda", (input) => { input.invoice = { ...input.invoice, currency: "MXN" }; }],
      ["la familia pasó a manual", (input) => { input.preference = { ...input.preference, requestedMode: "manual" }; }],
      ["sin pagador", (input) => { input.payer = null; }],
      ["sin orden de domiciliación", (input) => { input.authorization = { ...input.authorization!, mandateReference: null }; }],
      [
        "capacidad SEPA inactiva en la cuenta",
        (input) => {
          input.providerAccount = { ...input.providerAccount!, sepaDebitPaymentsCapabilityStatus: "inactive" };
        },
      ],
    ])("va antes de: %s (un motivo pasajero no lo retrasa)", (_label, mutate) => {
      expect(sepaOff(mutate)).toEqual({ allowed: false, reason: "sepa_not_enabled", classification: "final" });
    });

    it("sin autorización no hay domiciliación: manda el motivo de siempre", () => {
      expect(sepaOff((input) => { input.authorization = null; })).toMatchObject({ reason: "authorization_missing" });
    });
  });
});

describe("clase de cada motivo de la puerta", () => {
  const transient = [
    "account_stale",
    "automation_not_released",
    "entitlement_missing",
    "entitlement_not_effective",
    "environment_unknown",
    "flag_off",
    "live_not_released",
    "paid_plan_required",
    "storage_missing",
    "subscription_mismatch",
    "subscription_missing",
    "subscription_not_active",
    "subscription_period_not_current",
  ];

  it("son pasajeros exactamente la bandera, el entorno, el almacenamiento, la cuenta y el plan", () => {
    const actual = Object.entries(GATE_REASON_CLASSIFICATION)
      .filter(([, classification]) => classification === "transient")
      .map(([reason]) => reason)
      .sort();
    expect(actual).toEqual(transient);
  });

  it.each(Object.keys(GATE_REASON_CLASSIFICATION) as FamilyCollectionGateReason[])(
    "%s",
    (reason) => {
      expect(classifyGateReason(reason)).toBe(
        transient.includes(reason) ? "transient" : "final"
      );
    }
  );

  it("los motivos propios de la Fase 3 que no son pasajeros son finales", () => {
    for (const reason of [
      "reminder_sent",
      "sepa_not_enabled",
      "unsupported_currency",
      "charge_payer_mismatch",
      "payer_missing",
      "payer_not_current",
      "payment_method_unknown",
      "sepa_not_active",
      "preference_manual",
      "authorization_inactive",
      "organization_not_active",
    ] as const) {
      expect(classifyGateReason(reason)).toBe("final");
    }
  });
});

// ---------------------------------------------------------------------------
// Reintentos (D1: tarjeta, a 1, 3 y 7 días del primer intento)
// ---------------------------------------------------------------------------

describe("nextRetry", () => {
  // Primer intento: 07:00 del 10 en Madrid. Reintentos los días locales 11, 13 y 17.
  const first = new Date("2026-11-10T06:00:00.000Z");
  const day11 = new Date("2026-11-10T23:00:00.000Z");

  /** Fallo blando del intento `attemptNumber`, procesado en `at`. */
  function soft(input: { attemptNumber: number; first: string; at: string; timezone?: string }): Date | null {
    return nextRetry({
      kind: "card",
      attemptNumber: input.attemptNumber,
      code: "card_declined",
      declineCode: "insufficient_funds",
      firstAttemptClaimedAt: new Date(input.first),
      now: new Date(input.at),
      timezone: input.timezone ?? MADRID,
    });
  }

  /** La cadena entera: cada intento sale a las 00:30 locales del día de su reintento. */
  function chain(firstIso: string, timezone: string): Array<Date | null> {
    const retries: Array<Date | null> = [];
    let at = firstIso;
    for (let attemptNumber = 1; attemptNumber <= 4; attemptNumber += 1) {
      const retry = soft({ attemptNumber, first: firstIso, at, timezone });
      retries.push(retry);
      if (retry) at = new Date(retry.getTime() + 30 * 60 * 1000).toISOString();
    }
    return retries;
  }

  it("tres reintentos, a 1, 3 y 7 días del primer intento; cuatro intentos como mucho", () => {
    expect(CARD_RETRY_OFFSET_DAYS).toEqual([1, 3, 7]);
    expect(CARD_MAX_ATTEMPTS).toBe(4);
    // La tabla admite más números de intento que los que usa la tarjeta.
    expect(CARD_MAX_ATTEMPTS).toBeLessThanOrEqual(FAMILY_COLLECTION_MAX_ATTEMPTS_PER_INVOICE);
  });

  it("cadena completa 1 → 2 → 3 → 4: días 11, 13 y 17 a las 00:00 locales y después nada", () => {
    expect(chain("2026-11-10T06:00:00.000Z", MADRID)).toEqual([
      new Date("2026-11-10T23:00:00.000Z"),
      new Date("2026-11-12T23:00:00.000Z"),
      new Date("2026-11-16T23:00:00.000Z"),
      null,
    ]);
  });

  it("se cuenta desde el primer intento, no desde hoy ni desde el intento anterior", () => {
    // El intento 2 salió el 11 a las 20:00 y falló: el 3 es el 13 (día +3 del
    // primero), no el 14 (hoy + 3) ni el 12 (anterior + 1).
    expect(soft({ attemptNumber: 2, first: "2026-11-10T06:00:00.000Z", at: "2026-11-11T19:00:00.000Z" })).toEqual(
      new Date("2026-11-12T23:00:00.000Z")
    );
    // El 3 falló el 13 a las 23:30: el 4 sigue siendo el 17.
    expect(soft({ attemptNumber: 3, first: "2026-11-10T06:00:00.000Z", at: "2026-11-13T22:30:00.000Z" })).toEqual(
      new Date("2026-11-16T23:00:00.000Z")
    );
  });

  it("el primer intento a las 23:30 locales cuenta desde ese día local", () => {
    expect(soft({ attemptNumber: 1, first: "2026-11-10T22:30:00.000Z", at: "2026-11-10T22:30:00.000Z" })).toEqual(day11);
    // 00:30 del 11 en Madrid (23:30 UTC del 10): el día local ya es el 11 → 12.
    expect(soft({ attemptNumber: 1, first: "2026-11-10T23:30:00.000Z", at: "2026-11-10T23:30:00.000Z" })).toEqual(
      new Date("2026-11-11T23:00:00.000Z")
    );
  });

  it("si el día que tocaba ya llegó (el intento salió tarde), el reintento pasa a mañana", () => {
    // El intento 2 salió con retraso el 13 (día +3): el 3 no sale el mismo día, sino el 14.
    expect(soft({ attemptNumber: 2, first: "2026-11-10T06:00:00.000Z", at: "2026-11-13T07:00:00.000Z" })).toEqual(
      new Date("2026-11-13T23:00:00.000Z")
    );
    // El intento 3 salió el 18 (después del día +7): el 4, el 19.
    expect(soft({ attemptNumber: 3, first: "2026-11-10T06:00:00.000Z", at: "2026-11-18T07:00:00.000Z" })).toEqual(
      new Date("2026-11-18T23:00:00.000Z")
    );
  });

  it("cambio de mes: del 28 de noviembre a los días 29, 1 y 5 de diciembre", () => {
    expect(chain("2026-11-28T09:00:00.000Z", MADRID)).toEqual([
      new Date("2026-11-28T23:00:00.000Z"),
      new Date("2026-11-30T23:00:00.000Z"),
      new Date("2026-12-04T23:00:00.000Z"),
      null,
    ]);
  });

  it("cambio de año", () => {
    expect(chain("2026-12-30T12:00:00.000Z", MADRID)).toEqual([
      new Date("2026-12-30T23:00:00.000Z"),
      new Date("2027-01-01T23:00:00.000Z"),
      new Date("2027-01-05T23:00:00.000Z"),
      null,
    ]);
  });

  it("Madrid, cambio de hora de otoño (25-10-2026): las 00:00 locales de cada día, antes y después", () => {
    // Primer intento el jueves 22 (UTC+2). El domingo 25 empieza aún en UTC+2;
    // el jueves 29 ya en UTC+1.
    expect(chain("2026-10-22T09:00:00.000Z", MADRID)).toEqual([
      new Date("2026-10-22T22:00:00.000Z"),
      new Date("2026-10-24T22:00:00.000Z"),
      new Date("2026-10-28T23:00:00.000Z"),
      null,
    ]);
  });

  it("Madrid, cambio de hora de primavera (28-03-2027)", () => {
    expect(chain("2027-03-26T09:00:00.000Z", MADRID)).toEqual([
      new Date("2027-03-26T23:00:00.000Z"),
      new Date("2027-03-28T22:00:00.000Z"),
      new Date("2027-04-01T22:00:00.000Z"),
      null,
    ]);
  });

  it("Ciudad de México: el día local manda aunque en UTC ya sea el siguiente", () => {
    // 23:30 del 9 en México (05:30 UTC del 10): días 10, 12 y 16 (UTC-6).
    expect(chain("2026-11-10T05:30:00.000Z", MEXICO)).toEqual([
      new Date("2026-11-10T06:00:00.000Z"),
      new Date("2026-11-12T06:00:00.000Z"),
      new Date("2026-11-16T06:00:00.000Z"),
      null,
    ]);
  });

  it("el reintento sale en la ejecución de su día local, no en la del día anterior", () => {
    const retry = soft({ attemptNumber: 1, first: "2026-11-10T22:30:00.000Z", at: "2026-11-10T22:30:00.000Z" })!;
    const jobDay11 = new Date("2026-11-11T06:00:00.000Z");
    const jobDay10 = new Date("2026-11-10T06:00:00.000Z");
    expect(localCalendarDate(retry, MADRID)).toBe("2026-11-11");
    expect(retry.getTime() <= jobDay11.getTime()).toBe(true);
    expect(retry.getTime() <= jobDay10.getTime()).toBe(false);
  });

  it("lista exacta de rechazos blandos", () => {
    expect([...SOFT_DECLINE_CODES].sort()).toEqual([
      "approve_with_id",
      "card_velocity_exceeded",
      "do_not_honor",
      "generic_decline",
      "insufficient_funds",
      "issuer_not_available",
      "processing_error",
      "reenter_transaction",
      "try_again_later",
      "withdrawal_count_limit_exceeded",
    ]);
  });

  it("los blandos y los que nunca se reintentan no se solapan", () => {
    expect(SOFT_DECLINE_CODES.filter((code) => NEVER_RETRY_DECLINE_CODES.includes(code))).toEqual([]);
    expect([...NEVER_RETRY_DECLINE_CODES].sort()).toEqual([
      "authentication_required",
      "card_not_supported",
      "do_not_try_again",
      "expired_card",
      "fraudulent",
      "incorrect_number",
      "invalid_account",
      "invalid_number",
      "lost_card",
      "merchant_blacklist",
      "pickup_card",
      "stolen_card",
    ]);
  });

  it.each([...SOFT_DECLINE_CODES])("tarjeta rechazada por %s: reintento", (declineCode) => {
    for (const [attemptNumber, expected] of [
      [1, "2026-11-10T23:00:00.000Z"],
      [2, "2026-11-12T23:00:00.000Z"],
      [3, "2026-11-16T23:00:00.000Z"],
    ] as const) {
      expect(
        nextRetry({
          kind: "card",
          attemptNumber,
          code: "card_declined",
          declineCode,
          firstAttemptClaimedAt: first,
          now: first,
          timezone: MADRID,
        })
      ).toEqual(new Date(expected));
    }
  });

  it("error de procesamiento sin decline_code: reintento", () => {
    expect(
      nextRetry({
        kind: "card",
        attemptNumber: 1,
        code: "processing_error",
        declineCode: null,
        firstAttemptClaimedAt: first,
        now: first,
        timezone: MADRID,
      })
    ).toEqual(day11);
  });

  it.each([...NEVER_RETRY_DECLINE_CODES])("tarjeta rechazada por %s: nunca, en ningún intento", (declineCode) => {
    for (const attemptNumber of [1, 2, 3]) {
      expect(
        nextRetry({
          kind: "card",
          attemptNumber,
          code: "card_declined",
          declineCode,
          firstAttemptClaimedAt: first,
          now: first,
          timezone: MADRID,
        })
      ).toBeNull();
    }
  });

  it.each([...NEVER_RETRY_DECLINE_CODES])("código %s: nunca, aunque el decline_code sea blando", (code) => {
    expect(
      nextRetry({
        kind: "card",
        attemptNumber: 2,
        code,
        declineCode: "insufficient_funds",
        firstAttemptClaimedAt: first,
        now: first,
        timezone: MADRID,
      })
    ).toBeNull();
  });

  it.each([1, 2, 3])("el banco pide autenticación (code authentication_required, sin decline_code) en el intento %s: nunca", (attemptNumber) => {
    expect(
      nextRetry({
        kind: "card",
        attemptNumber,
        code: "authentication_required",
        declineCode: null,
        firstAttemptClaimedAt: first,
        now: first,
        timezone: MADRID,
      })
    ).toBeNull();
  });

  it("domiciliación: nunca", () => {
    expect(
      nextRetry({
        kind: "sepa_debit",
        attemptNumber: 1,
        code: "card_declined",
        declineCode: "insufficient_funds",
        firstAttemptClaimedAt: first,
        now: first,
        timezone: MADRID,
      })
    ).toBeNull();
  });

  it.each([4, 5, 0, -1, 1.5])("intento %s: sin reintento", (attemptNumber) => {
    expect(soft({ attemptNumber, first: "2026-11-10T06:00:00.000Z", at: "2026-11-17T06:00:00.000Z" })).toBeNull();
  });

  it("fecha del primer intento no válida: sin reintento", () => {
    expect(
      nextRetry({
        kind: "card",
        attemptNumber: 2,
        code: "card_declined",
        declineCode: "insufficient_funds",
        firstAttemptClaimedAt: new Date(Number.NaN),
        now: first,
        timezone: MADRID,
      })
    ).toBeNull();
  });

  it.each<[string | null, string | null]>([
    ["incorrect_cvc", null],
    ["card_declined", null],
    [null, null],
    ["payment_failed", null],
  ])("rechazo no previsto (%s, %s): nunca", (code, declineCode) => {
    expect(
      nextRetry({ kind: "card", attemptNumber: 1, code, declineCode, firstAttemptClaimedAt: first, now: first, timezone: MADRID })
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Resultado de Stripe
// ---------------------------------------------------------------------------

function snapshot(overrides: Partial<PaymentIntentSnapshot> = {}): PaymentIntentSnapshot {
  return {
    id: "pi_synthetic_a",
    status: "succeeded",
    lastErrorCode: null,
    lastDeclineCode: null,
    amountReceivedCents: null,
    currency: null,
    ...overrides,
  };
}

describe("mapPaymentIntent", () => {
  it.each([
    ["succeeded", "succeeded"],
    ["processing", "processing"],
    ["requires_capture", "processing"],
    ["requires_confirmation", "requires_confirmation"],
    ["estado_nuevo_de_stripe", "transient"],
  ])("cobro en %s → %s", (status, expected) => {
    expect(mapPaymentIntent(snapshot({ status }))).toBe(expected);
  });

  it("cobro rechazado: códigos del último error", () => {
    expect(
      mapPaymentIntent(
        snapshot({
          status: "requires_payment_method",
          lastErrorCode: "card_declined",
          lastDeclineCode: "insufficient_funds",
        })
      )
    ).toEqual({ failed: { code: "card_declined", declineCode: "insufficient_funds" } });
  });

  it("cobro pendiente de autenticación: fallo terminal en esta fase", () => {
    const outcome = mapPaymentIntent(snapshot({ status: "requires_action" }));
    expect(outcome).toEqual({ failed: { code: "authentication_required", declineCode: null } });
  });

  it("C3: cobro cancelado sin ningún error de pago: cerrado como canceled_in_stripe, nunca como fallo del banco", () => {
    expect(CANCELED_IN_STRIPE_CODE).toBe("canceled_in_stripe");
    expect(mapPaymentIntent(snapshot({ status: "canceled" }))).toBe("canceled_in_stripe");
    // Confirmar un cobro ya cancelado: el código de la llamada no es un rechazo del banco.
    expect(
      mapPaymentIntent({
        type: "invalid_request_error",
        code: "payment_intent_unexpected_state",
        declineCode: null,
        paymentIntent: snapshot({ status: "canceled" }),
      })
    ).toBe("canceled_in_stripe");
    expect(
      mapUnknownPaymentError({
        type: "StripeInvalidRequestError",
        rawType: "invalid_request_error",
        code: "payment_intent_unexpected_state",
        statusCode: 400,
        payment_intent: { id: "pi_synthetic_canceled", status: "canceled", last_payment_error: null },
      })
    ).toBe("canceled_in_stripe");
  });

  it("C3: cobro cancelado con un error de pago guardado: sigue siendo un fallo con sus códigos", () => {
    expect(
      mapPaymentIntent(snapshot({ status: "canceled", lastErrorCode: "card_declined", lastDeclineCode: "insufficient_funds" }))
    ).toEqual({ failed: { code: "card_declined", declineCode: "insufficient_funds" } });
    expect(mapPaymentIntent(snapshot({ status: "canceled", lastErrorCode: "card_declined" }))).toEqual({
      failed: { code: "card_declined", declineCode: null },
    });
    expect(
      mapPaymentIntent({
        type: "card_error",
        code: "card_declined",
        declineCode: "do_not_honor",
        paymentIntent: snapshot({ status: "canceled" }),
      })
    ).toEqual({ failed: { code: "card_declined", declineCode: "do_not_honor" } });
  });

  it("nunca guarda algo que no sea un código", () => {
    expect(
      mapPaymentIntent(
        snapshot({
          status: "requires_payment_method",
          lastErrorCode: "Your card was declined.",
          lastDeclineCode: "x".repeat(65),
        })
      )
    ).toEqual({ failed: { code: "payment_failed", declineCode: null } });
  });

  it("error de tarjeta al confirmar: códigos del error", () => {
    expect(
      mapPaymentIntent({
        code: "card_declined",
        declineCode: "stolen_card",
        paymentIntent: snapshot({
          status: "requires_payment_method",
          lastErrorCode: "card_declined",
          lastDeclineCode: "stolen_card",
        }),
      })
    ).toEqual({ failed: { code: "card_declined", declineCode: "stolen_card" } });
  });

  it("el banco pide autenticación al confirmar: fallo terminal", () => {
    const outcome = mapPaymentIntent({
      type: "card_error",
      code: "authentication_required",
      declineCode: "authentication_required",
      paymentIntent: snapshot({
        status: "requires_payment_method",
        lastErrorCode: "authentication_required",
      }),
    });
    expect(outcome).toEqual({
      failed: { code: "authentication_required", declineCode: "authentication_required" },
    });
    expect(typeof outcome === "object" && isAuthenticationRequiredFailure(outcome.failed)).toBe(
      true
    );
  });

  it("error con el cobro ya cobrado: manda el estado del cobro", () => {
    expect(
      mapPaymentIntent({
        code: "payment_intent_unexpected_state",
        declineCode: null,
        paymentIntent: snapshot({ status: "succeeded" }),
      })
    ).toBe("succeeded");
  });

  it("error sin el cobro: nunca se da por fallido", () => {
    expect(
      mapPaymentIntent({ code: "card_declined", declineCode: "insufficient_funds", paymentIntent: null })
    ).toBe("transient");
  });

  it("clave de idempotencia rechazada: conflicto", () => {
    expect(
      mapPaymentIntent({
        type: "idempotency_error",
        code: null,
        declineCode: null,
        paymentIntent: null,
      })
    ).toBe("idempotency_conflict");
  });

  it("clave de idempotencia en uso por otra petición: pasajero", () => {
    expect(
      mapPaymentIntent({
        type: "idempotency_error",
        code: "idempotency_key_in_use",
        declineCode: null,
        paymentIntent: null,
      })
    ).toBe("transient");
  });

  describe("errores tal como los lanza stripe-node", () => {
    it("error de tarjeta con su cobro", () => {
      expect(
        mapPaymentIntent({
          type: "StripeCardError",
          rawType: "card_error",
          code: "card_declined",
          decline_code: "",
          statusCode: 402,
          payment_intent: {
            id: "pi_synthetic_b",
            status: "requires_payment_method",
            last_payment_error: { code: "card_declined", decline_code: "generic_decline" },
          },
        })
      ).toEqual({ failed: { code: "card_declined", declineCode: "generic_decline" } });
    });

    it("error de idempotencia", () => {
      expect(
        mapPaymentIntent({
          type: "StripeIdempotencyError",
          rawType: "idempotency_error",
          statusCode: 400,
        })
      ).toBe("idempotency_conflict");
      expect(mapPaymentIntent({ rawType: "idempotency_error" })).toBe("idempotency_conflict");
    });

    it.each([
      ["conexión", { type: "StripeConnectionError" }],
      ["límite de peticiones", { type: "StripeRateLimitError", rawType: "invalid_request_error", code: "rate_limit", statusCode: 429 }],
      ["error interno", { type: "StripeAPIError", rawType: "api_error", statusCode: 500 }],
      ["permiso", { type: "StripePermissionError", statusCode: 403 }],
    ])("%s → pasajero", (_label, error) => {
      expect(mapPaymentIntent(error)).toBe("transient");
    });

    it("cualquier valor capturado", () => {
      expect(mapUnknownPaymentError(new Error("sin red"))).toBe("transient");
      expect(mapUnknownPaymentError("texto")).toBe("transient");
      expect(mapUnknownPaymentError(null)).toBe("transient");
      expect(
        mapUnknownPaymentError({ type: "StripeIdempotencyError", rawType: "idempotency_error" })
      ).toBe("idempotency_conflict");
    });
  });
});

describe("importe cobrado frente al del intento", () => {
  const expected = { amountCents: 4500, currency: "EUR" };

  it("cuadra solo con el mismo importe y en euros", () => {
    expect(receivedMatches({ amountCents: 4500, currency: "EUR" }, expected)).toBe(true);
  });

  it.each([
    ["otro importe", { amountCents: 4000, currency: "EUR" }],
    ["un céntimo más", { amountCents: 4501, currency: "EUR" }],
    ["nada cobrado", { amountCents: 0, currency: "EUR" }],
    ["otra moneda", { amountCents: 4500, currency: "USD" }],
    ["importe desconocido", { amountCents: null, currency: "EUR" }],
    ["moneda desconocida", { amountCents: 4500, currency: null }],
  ])("no cuadra: %s", (_label, received) => {
    expect(receivedMatches(received, expected)).toBe(false);
  });

  it("un intento que no es en euros nunca cuadra", () => {
    expect(receivedMatches({ amountCents: 4500, currency: "EUR" }, { amountCents: 4500, currency: "USD" })).toBe(false);
  });

  it("receivedOf lee el snapshot; sin snapshot o sin importe, desconocido", () => {
    expect(receivedOf(snapshot({ amountReceivedCents: 4500, currency: "EUR" }))).toEqual({
      amountCents: 4500,
      currency: "EUR",
    });
    expect(receivedOf(snapshot())).toEqual({ amountCents: null, currency: null });
    expect(receivedOf(null)).toEqual({ amountCents: null, currency: null });
    expect(AMOUNT_MISMATCH_REASON).toBe("amount_mismatch");
  });
});

describe("rechazos seguros al crear el cobro", () => {
  it.each([
    ["importe bajo el mínimo", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "amount_too_small", statusCode: 400 }, "amount_too_small"],
    ["cliente o método inexistente", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "resource_missing", statusCode: 400 }, "resource_missing"],
    ["cuenta de la academia no válida", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "account_invalid", statusCode: 400 }, "account_invalid"],
    ["método no activado", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "payment_method_unactivated", statusCode: 400 }, "payment_method_unactivated"],
    ["capacidad no activa", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "capability_not_active", statusCode: 400 }, "capability_not_active"],
  ])("%s: final con su código", (_label, error, code) => {
    expect(finalCreateErrorCode(error)).toBe(code);
    // Para el resto de llamadas sigue siendo pasajero: solo la creación lo decide.
    expect(mapUnknownPaymentError(error)).toBe("transient");
  });

  it("el código se lee igual en un Error del SDK", () => {
    const error = Object.assign(new Error("Mensaje sintético de Stripe"), {
      type: "StripeInvalidRequestError",
      rawType: "invalid_request_error",
      code: "resource_missing",
    });
    expect(finalCreateErrorCode(error)).toBe("resource_missing");
  });

  it.each([
    ["parámetro no válido", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "parameter_invalid_integer", statusCode: 400 }, "parameter_invalid_integer"],
    ["método de pago de otro cliente", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "payment_method_not_available", statusCode: 400 }, "payment_method_not_available"],
    ["código en mayúsculas", { rawType: "invalid_request_error", code: "Parameter_Unknown", statusCode: 400 }, "parameter_unknown"],
    ["sin código", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", statusCode: 400 }, INVALID_CREATE_REQUEST_CODE],
    ["código que no es un código", { rawType: "invalid_request_error", code: "Mensaje con espacios", statusCode: 400 }, INVALID_CREATE_REQUEST_CODE],
  ])("C4: cualquier otra petición rechazada (400 invalid_request_error) es final al crear: %s", (_label, error, code) => {
    expect(INVALID_CREATE_REQUEST_CODE).toBe("invalid_request");
    expect(finalCreateErrorCode(error)).toBe(code);
    // Fuera de la creación sigue siendo pasajero.
    expect(mapUnknownPaymentError(error)).toBe("transient");
  });

  it("C4: un Error del SDK con 400 y otro código también es final", () => {
    const error = Object.assign(new Error("Mensaje sintético de Stripe"), {
      type: "StripeInvalidRequestError",
      rawType: "invalid_request_error",
      code: "parameter_missing",
      statusCode: 400,
    });
    expect(finalCreateErrorCode(error)).toBe("parameter_missing");
  });

  it.each([
    ["idempotencia (400)", { type: "StripeIdempotencyError", rawType: "idempotency_error", statusCode: 400 }],
    ["clave de idempotencia en uso (400)", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "idempotency_key_in_use", statusCode: 400 }],
    ["clave de idempotencia en uso (409)", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "idempotency_key_in_use", statusCode: 409 }],
    ["bloqueo (400)", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "lock_timeout", statusCode: 400 }],
    ["límite de peticiones (400)", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "rate_limit", statusCode: 400 }],
    ["error interno (500)", { type: "StripeAPIError", rawType: "api_error", statusCode: 500 }],
    ["no disponible (503)", { type: "StripeAPIError", rawType: "api_error", statusCode: 503 }],
    ["autenticación sin código (401)", { type: "StripeAuthenticationError", rawType: "invalid_request_error", statusCode: 401 }],
    ["permiso sin código (403)", { type: "StripePermissionError", rawType: "invalid_request_error", statusCode: 403 }],
    ["otro tipo con 400", { type: "StripeCardError", rawType: "card_error", code: "card_declined", statusCode: 400 }],
  ])("C4: siguen siendo pasajeros al crear: %s", (_label, error) => {
    expect(finalCreateErrorCode(error)).toBeNull();
  });

  it.each([
    ["conexión", { type: "StripeConnectionError" }],
    ["límite de peticiones", { type: "StripeRateLimitError", rawType: "rate_limit_error", code: "rate_limit", statusCode: 429 }],
    ["error interno", { type: "StripeAPIError", rawType: "api_error", statusCode: 500 }],
    ["bloqueo", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "lock_timeout", statusCode: 429 }],
    ["permiso", { type: "StripePermissionError", statusCode: 403 }],
    ["idempotencia", { type: "StripeIdempotencyError", rawType: "idempotency_error" }],
    ["error de petición sin código HTTP 400", { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "parameter_invalid_integer" }],
    ["error propio del adaptador", new Error("FAMILY_COLLECTION_INVALID_AMOUNT")],
    ["texto", "resource_missing"],
    ["null", null],
  ])("%s: pasajero", (_label, error) => {
    expect(finalCreateErrorCode(error)).toBeNull();
  });

  it("con el cobro en el error manda su estado, nunca el código", () => {
    expect(
      finalCreateErrorCode({
        type: "StripeInvalidRequestError",
        rawType: "invalid_request_error",
        code: "resource_missing",
        payment_intent: { id: "pi_synthetic_d", status: "requires_payment_method" },
      })
    ).toBeNull();
  });
});

describe("mínimo de Stripe", () => {
  it("menos de 0,50 € no se cobra; 0,50 € sí", () => {
    expect(STRIPE_MINIMUM_AMOUNT_CENTS).toBe(50);
    expect(AMOUNT_BELOW_MINIMUM_CODE).toBe("amount_below_minimum");
    expect(isBelowCollectionMinimum(20)).toBe(true);
    expect(isBelowCollectionMinimum(49)).toBe(true);
    expect(isBelowCollectionMinimum(50)).toBe(false);
    expect(isBelowCollectionMinimum(4500)).toBe(false);
  });
});

describe("ayudas compartidas con el adaptador", () => {
  it("codeOf solo deja pasar códigos", () => {
    expect(codeOf("card_declined")).toBe("card_declined");
    expect(codeOf("Your card was declined.")).toBeNull();
    expect(codeOf("x".repeat(65))).toBeNull();
    expect(codeOf("")).toBeNull();
    expect(codeOf(42)).toBeNull();
    expect(codeOf(undefined)).toBeNull();
  });

  it("snapshotOfPaymentIntent: solo id, estado, códigos, importe cobrado y moneda", () => {
    expect(
      snapshotOfPaymentIntent({
        id: "pi_synthetic_c",
        status: "requires_payment_method",
        amount: 4500,
        amount_received: 0,
        currency: "eur",
        last_payment_error: {
          code: "card_declined",
          decline_code: "lost_card",
          message: "Mensaje sintético del banco",
          payment_method: { billing_details: { email: "familia@example.com" } },
        },
      })
    ).toEqual({
      id: "pi_synthetic_c",
      status: "requires_payment_method",
      lastErrorCode: "card_declined",
      lastDeclineCode: "lost_card",
      amountReceivedCents: 0,
      currency: "EUR",
    });
    expect(snapshotOfPaymentIntent({ id: "pi_synthetic_c", status: "succeeded" })).toEqual({
      id: "pi_synthetic_c",
      status: "succeeded",
      lastErrorCode: null,
      lastDeclineCode: null,
      amountReceivedCents: null,
      currency: null,
    });
  });

  it.each([
    ["importe negativo", { amount_received: -1, currency: "eur" }, null, "EUR"],
    ["importe con decimales", { amount_received: 45.5, currency: "eur" }, null, "EUR"],
    ["importe como texto", { amount_received: "4500", currency: "eur" }, null, "EUR"],
    ["moneda rara", { amount_received: 4500, currency: "euro" }, 4500, null],
    ["moneda que no es texto", { amount_received: 4500, currency: 978 }, 4500, null],
  ])("snapshotOfPaymentIntent descarta lo que no es un importe o una moneda (%s)", (_label, fields, amount, currency) => {
    expect(snapshotOfPaymentIntent({ id: "pi_synthetic_c", status: "succeeded", ...fields })).toMatchObject({
      amountReceivedCents: amount,
      currency,
    });
  });

  it.each([null, undefined, "pi_synthetic_c", { id: "", status: "succeeded" }, { id: "pi_synthetic_c" }])(
    "snapshotOfPaymentIntent sin id o estado → null (%s)",
    (value) => {
      expect(snapshotOfPaymentIntent(value)).toBeNull();
    }
  );

  it("collectionErrorOf prefiere el tipo de la API al nombre de la clase", () => {
    expect(
      collectionErrorOf({
        type: "StripeCardError",
        rawType: "card_error",
        code: "card_declined",
        decline_code: "",
      })
    ).toEqual({ type: "card_error", code: "card_declined", declineCode: null, paymentIntent: null });
    expect(collectionErrorOf({ type: "StripeConnectionError" })).toEqual({
      type: "StripeConnectionError",
      code: null,
      declineCode: null,
      paymentIntent: null,
    });
    expect(collectionErrorOf({})).toEqual({
      type: null,
      code: null,
      declineCode: null,
      paymentIntent: null,
    });
  });

  it("addLocalDays cruza meses, años y febrero bisiesto", () => {
    expect(addLocalDays("2026-11-10", 3)).toBe("2026-11-13");
    expect(addLocalDays("2026-11-29", 3)).toBe("2026-12-02");
    expect(addLocalDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addLocalDays("2028-02-27", 3)).toBe("2028-03-01");
    expect(addLocalDays("2027-02-27", 3)).toBe("2027-03-02");
    expect(() => addLocalDays("2026-11-31", 3)).toThrow(RangeError);
    expect(() => addLocalDays("2026-11-10", 1.5)).toThrow(RangeError);
  });

  it.each([
    ["Madrid en invierno", "2026-11-13", MADRID, "2026-11-12T23:00:00.000Z"],
    ["Madrid en verano", "2026-07-01", MADRID, "2026-06-30T22:00:00.000Z"],
    ["Madrid, día del cambio de primavera", "2027-03-28", MADRID, "2027-03-27T23:00:00.000Z"],
    ["Madrid, día siguiente al cambio de primavera", "2027-03-29", MADRID, "2027-03-28T22:00:00.000Z"],
    ["Madrid, día del cambio de otoño", "2026-10-25", MADRID, "2026-10-24T22:00:00.000Z"],
    ["Ciudad de México", "2026-11-12", MEXICO, "2026-11-12T06:00:00.000Z"],
  ])("startOfLocalDay: %s", (_label, localDate, timezone, expected) => {
    const start = startOfLocalDay(localDate, timezone);
    expect(start.toISOString()).toBe(expected);
    expect(localCalendarDate(start, timezone)).toBe(localDate);
    expect(localCalendarDate(new Date(start.getTime() - 1), timezone)).toBe(
      addLocalDays(localDate, -1)
    );
  });
});

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

describe("config del cobro automático", () => {
  it("la bandera solo se enciende con el texto exacto «true»", () => {
    expect(FAMILY_AUTOMATIC_COLLECTION_FLAG_ENV).toBe(
      "ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED"
    );
    vi.stubEnv(FAMILY_AUTOMATIC_COLLECTION_FLAG_ENV, "true");
    expect(isFamilyAutomaticCollectionFlagEnabled()).toBe(true);
    vi.stubEnv(FAMILY_AUTOMATIC_COLLECTION_FLAG_ENV, "TRUE");
    expect(isFamilyAutomaticCollectionFlagEnabled()).toBe(false);
    vi.stubEnv(FAMILY_AUTOMATIC_COLLECTION_FLAG_ENV, "1");
    expect(isFamilyAutomaticCollectionFlagEnabled()).toBe(false);
    vi.stubEnv(FAMILY_AUTOMATIC_COLLECTION_FLAG_ENV, "");
    expect(isFamilyAutomaticCollectionFlagEnabled()).toBe(false);
  });

  it("apagada si no existe la variable", () => {
    vi.stubEnv(FAMILY_AUTOMATIC_COLLECTION_FLAG_ENV, undefined);
    expect(isFamilyAutomaticCollectionFlagEnabled()).toBe(false);
  });

  it("la bandera de la domiciliación (D2) es aparte, apagada por defecto y solo con «true»", () => {
    expect(FAMILY_AUTOMATIC_SEPA_COLLECTION_FLAG_ENV).toBe("ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED");
    vi.stubEnv(FAMILY_AUTOMATIC_SEPA_COLLECTION_FLAG_ENV, undefined);
    expect(isFamilyAutomaticSepaCollectionFlagEnabled()).toBe(false);
    // La bandera general no la enciende.
    vi.stubEnv(FAMILY_AUTOMATIC_COLLECTION_FLAG_ENV, "true");
    expect(isFamilyAutomaticSepaCollectionFlagEnabled()).toBe(false);
    for (const value of ["TRUE", "1", "", "yes"]) {
      vi.stubEnv(FAMILY_AUTOMATIC_SEPA_COLLECTION_FLAG_ENV, value);
      expect(isFamilyAutomaticSepaCollectionFlagEnabled()).toBe(false);
    }
    vi.stubEnv(FAMILY_AUTOMATIC_SEPA_COLLECTION_FLAG_ENV, "true");
    expect(isFamilyAutomaticSepaCollectionFlagEnabled()).toBe(true);
  });

  it("reexporta los cerrojos de entorno de Conectar Stripe", () => {
    expect(resolveConnectEnvironment).toBe(connectConfig.resolveConnectEnvironment);
    expect(isProductionDatabase).toBe(connectConfig.isProductionDatabase);
  });
});
