/**
 * Cobro automático de cuotas (Fase 3): lecturas de las pantallas
 * (family-collection-reads.ts). Las decisiones puras (estado de la familia,
 * fila de la academia, motivos en palabras sencillas) y las puertas: con la
 * bandera apagada, sin tablas o sin permiso no se lee nada. Base simulada;
 * solo datos sintéticos.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  execute: vi.fn(),
  selectRows: [] as unknown[],
}));

vi.mock("@/db", () => ({
  db: {
    execute: holder.execute,
    select: () => ({
      from: () => ({
        where: async () => holder.selectRows,
      }),
    }),
  },
}));
vi.mock("@/modules/billing/application/charge-collection-mode", () => ({
  areFamilyCollectionLocksOpen: vi.fn(),
  isFamilyAutomaticCollectionOpen: vi.fn(),
}));
vi.mock("@/modules/family-collection/application/storage", () => ({
  isFamilyCollectionStorageAvailable: vi.fn(),
  isFamilyCollectionEventsStorageAvailable: vi.fn(),
  isPaymentRemindersTablePresent: vi.fn(),
}));
vi.mock("@/modules/family-collection/application/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/family-collection/application/config")>()),
  // Fase 4 (Tarea 5): la confirmación desde el portal, cerrada salvo que el test la abra.
  isFamilyPaymentConfirmationOpen: vi.fn(() => false),
}));
vi.mock("@/modules/family-payment-methods/application/storage", () => ({
  isFamilyPaymentMethodsStorageAvailable: vi.fn(),
}));
vi.mock("@/modules/payments-connect/application/storage", () => ({
  isConnectOnboardingStorageAvailable: vi.fn(),
}));
vi.mock("@/modules/family-portal/application/family-portal-access", () => ({
  resolveFamilyPortalAccess: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));
vi.mock("@/modules/billing/application/plan-state", () => ({
  loadOrganizationPlanState: vi.fn(),
  loadPlanChangeRevision: vi.fn(),
}));
vi.mock("@/modules/billing/domain/plan-eligibility", () => ({
  evaluateAutomaticCollectionPlanEligibility: vi.fn(),
}));

import {
  areFamilyCollectionLocksOpen,
  isFamilyAutomaticCollectionOpen,
} from "@/modules/billing/application/charge-collection-mode";
import { loadOrganizationPlanState, loadPlanChangeRevision } from "@/modules/billing/application/plan-state";
import { evaluateAutomaticCollectionPlanEligibility } from "@/modules/billing/domain/plan-eligibility";
import {
  automaticCollectionBlocker,
  failureReasonText,
  familyAutomaticFeeStatusOf,
  familyNoticeStateOf,
  getFamilyAutomaticCollectionModes,
  getFamilyAutomaticFeeStatuses,
  getOwnerAutomaticCollections,
  getOwnerFamilyCollectionSwitches,
  ownerAutomaticCollectionItemOf,
  ownerDisputeStateOf,
  ownerDisputeText,
  ownerRefundText,
  refundNoticeText,
  reviewReasonText,
  sortByFeeMonth,
  type OwnerAutomaticCollectionItem,
  type OwnerCollectionRow,
} from "@/modules/family-collection/application/family-collection-reads";
import { isFamilyPaymentConfirmationOpen } from "@/modules/family-collection/application/config";
import {
  isFamilyCollectionEventsStorageAvailable,
  isFamilyCollectionStorageAvailable,
  isPaymentRemindersTablePresent,
} from "@/modules/family-collection/application/storage";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";
import {
  familyAutomaticFeeText,
  formatCalendarDate,
  formatMoney,
} from "@/modules/family-portal/domain/family-portal-presentation";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const USER_ID = "91000000-0000-4000-8000-000000000101";
const ORGANIZATION_ID = "91000000-0000-4000-8000-000000000001";
const FAMILY_ID = "91000000-0000-4000-8000-000000000301";
const OTHER_FAMILY_ID = "91000000-0000-4000-8000-000000000302";
const INVOICE_ID = "91000000-0000-4000-8000-000000000401";
const TZ = "Europe/Madrid";
// 17 nov 2026, 10:00 en Madrid.
const NOW = new Date("2026-11-17T09:00:00.000Z");
const dialect = new PgDialect();

function ownerScope(overrides: Partial<OwnerScope["member"]> = {}, aggregate = true): OwnerScope {
  return {
    organization: { id: ORGANIZATION_ID, name: "Club Sintético", defaultCurrency: "EUR" },
    member: { id: "91000000-0000-4000-8000-000000000201", role: "owner", locationScopeMode: "all", ...overrides },
    locations: [],
    selectedLocationId: null,
    canViewOrganizationAggregate: aggregate,
  };
}

function familyInput(overrides: Partial<Parameters<typeof familyAutomaticFeeStatusOf>[0]> = {}) {
  return {
    invoiceStatus: "issued",
    hasAutomaticCharge: true,
    nextDueAt: "2026-11-20T22:59:59.999Z",
    timezone: TZ,
    collectionDayOfMonth: null,
    last: null,
    blocker: null,
    ...overrides,
  };
}

function ownerRow(overrides: Partial<OwnerCollectionRow> = {}): OwnerCollectionRow {
  return {
    invoiceId: INVOICE_ID,
    invoiceReference: "CUO-2026-11-001",
    invoiceStatus: "issued",
    payerName: "Lucía Sintética",
    currency: "EUR",
    timezone: TZ,
    collectionDayOfMonth: null,
    nextDueAt: "2026-11-20T22:59:59.999Z",
    openAutomaticCents: 4500,
    blocker: null,
    attemptsExhausted: false,
    attempt: null,
    ...overrides,
  };
}

function attempt(overrides: Partial<NonNullable<OwnerCollectionRow["attempt"]>> = {}) {
  return {
    status: "succeeded",
    amountCents: 4500,
    failureCode: null,
    declineCode: null,
    nextRetryAt: null,
    completedAt: new Date("2026-11-05T08:00:00.000Z"),
    // Tocado hace una hora: dentro de las 24 h sin cambios.
    updatedAt: new Date("2026-11-17T08:00:00.000Z"),
    // Reclamado hace 12 días: dentro de los 15 días de un cobro en curso.
    claimedAt: new Date("2026-11-05T08:00:00.000Z"),
    resumeCount: 0,
    allocationStatus: "allocated",
    hasReviewNotice: false,
    reviewReason: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  holder.execute.mockReset();
  holder.selectRows = [];
  vi.mocked(areFamilyCollectionLocksOpen).mockReturnValue(true);
  vi.mocked(isFamilyAutomaticCollectionOpen).mockReturnValue(true);
  vi.mocked(isFamilyCollectionStorageAvailable).mockResolvedValue(true);
  vi.mocked(isFamilyCollectionEventsStorageAvailable).mockResolvedValue(true);
  vi.mocked(isFamilyPaymentConfirmationOpen).mockReturnValue(false);
  vi.mocked(isPaymentRemindersTablePresent).mockResolvedValue(true);
  vi.mocked(isFamilyPaymentMethodsStorageAvailable).mockResolvedValue(true);
  vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(true);
  vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope());
  // Plan de pago vigente (revisión 5) sin cambio real del plan.
  vi.mocked(loadOrganizationPlanState).mockResolvedValue({ entitlement: null, subscription: null } as never);
  vi.mocked(evaluateAutomaticCollectionPlanEligibility).mockReturnValue({
    eligible: true,
    reason: null,
    entitlementRevision: 5,
  });
  vi.mocked(loadPlanChangeRevision).mockResolvedValue(null);
});

const eligiblePlan = { eligible: true as const, reason: null, entitlementRevision: 5 };
const prerequisites = {
  plan: eligiblePlan,
  planChangeRevision: null,
  preferenceMode: "automatic",
  preferenceRevision: 5,
  hasActiveAuthorization: true,
};

describe("¿puede llegar todavía el cobro automático? (como la puerta)", () => {
  it("con plan, preferencia vigente y autorización activa: sí", () => {
    expect(automaticCollectionBlocker(prerequisites)).toBeNull();
  });

  it("tarjeta revocada después de emitir la cuota: authorization_missing", () => {
    expect(automaticCollectionBlocker({ ...prerequisites, hasActiveAuthorization: false })).toBe(
      "authorization_missing"
    );
  });

  it("interruptor apagado (preferencia manual o nunca guardada): preference_manual", () => {
    expect(automaticCollectionBlocker({ ...prerequisites, preferenceMode: "manual" })).toBe("preference_manual");
    expect(automaticCollectionBlocker({ ...prerequisites, preferenceMode: null })).toBe("preference_manual");
  });

  it("cambio real del plan después de guardarla: preference_entitlement_stale; una renovación no", () => {
    expect(
      automaticCollectionBlocker({ ...prerequisites, preferenceRevision: 3, planChangeRevision: 4 })
    ).toBe("preference_entitlement_stale");
    expect(
      automaticCollectionBlocker({ ...prerequisites, preferenceRevision: 3, planChangeRevision: 2 })
    ).toBeNull();
  });

  it("sin plan de pago: el motivo del plan", () => {
    expect(
      automaticCollectionBlocker({ ...prerequisites, plan: { eligible: false, reason: "paid_plan_required" } })
    ).toBe("paid_plan_required");
  });

  it("recordatorio de pago ya enviado: reminder_sent (la puerta lo cancelará), antes que cualquier otro motivo", () => {
    expect(automaticCollectionBlocker({ ...prerequisites, reminderSent: true })).toBe("reminder_sent");
    expect(
      automaticCollectionBlocker({
        ...prerequisites,
        reminderSent: true,
        plan: { eligible: false, reason: "paid_plan_required" },
        hasActiveAuthorization: false,
      })
    ).toBe("reminder_sent");
    expect(automaticCollectionBlocker({ ...prerequisites, reminderSent: false })).toBeNull();
    expect(failureReasonText({ failureCode: "reminder_sent", declineCode: null })).toBe(
      "Ya se avisó a la familia con un recordatorio de pago. Se cobra a mano."
    );
  });

  it("el portal no promete el reintento ni el primer cobro tras un recordatorio", () => {
    const blocker = automaticCollectionBlocker({ ...prerequisites, reminderSent: true });
    expect(
      familyAutomaticFeeStatusOf(
        familyInput({
          blocker,
          last: { status: "failed", nextRetryAt: new Date("2026-11-18T23:00:00.000Z"), completedAt: null },
        }),
        NOW
      )
    ).toBeNull();
    expect(familyAutomaticFeeStatusOf(familyInput({ blocker }), NOW)).toBeNull();
  });
});

describe("estado del cobro automático para la familia (puro)", () => {
  it("sin intento: la fecha de cobro prevista con el día de vencimiento", () => {
    expect(familyAutomaticFeeStatusOf(familyInput(), NOW)).toEqual({ kind: "scheduled", date: "2026-11-20" });
  });

  it("con día fijo, el día de cobro de la academia (nunca antes del vencimiento)", () => {
    expect(familyAutomaticFeeStatusOf(familyInput({ collectionDayOfMonth: 28 }), NOW)).toEqual({
      kind: "scheduled",
      date: "2026-11-28",
    });
    expect(familyAutomaticFeeStatusOf(familyInput({ collectionDayOfMonth: 5 }), NOW)).toEqual({
      kind: "scheduled",
      date: "2026-11-20",
    });
  });

  it("sin intento y con la fecha pasada: en curso dentro del margen y «no se pudo» después", () => {
    expect(
      familyAutomaticFeeStatusOf(familyInput({ nextDueAt: "2026-11-15T22:59:59.999Z" }), NOW)
    ).toEqual({ kind: "in_progress" });
    expect(
      familyAutomaticFeeStatusOf(familyInput({ nextDueAt: "2026-11-10T22:59:59.999Z" }), NOW)
    ).toEqual({ kind: "not_collected" });
  });

  it.each(["claimed", "created", "processing"])("intento %s: cobro en curso", (status) => {
    expect(
      familyAutomaticFeeStatusOf(familyInput({ last: { status, nextRetryAt: null, completedAt: null } }), NOW)
    ).toEqual({ kind: "in_progress" });
  });

  it("cobrada: el día del cobro en la zona de la sede", () => {
    expect(
      familyAutomaticFeeStatusOf(
        familyInput({
          invoiceStatus: "paid",
          last: { status: "succeeded", nextRetryAt: null, completedAt: new Date("2026-11-04T23:30:00.000Z") },
        }),
        NOW
      )
    ).toEqual({ kind: "collected", date: "2026-11-05" });
  });

  it("fallida con reintento: se cobrará el día del reintento", () => {
    expect(
      familyAutomaticFeeStatusOf(
        familyInput({
          last: { status: "failed", nextRetryAt: new Date("2026-11-19T23:00:00.000Z"), completedAt: NOW },
        }),
        NOW
      )
    ).toEqual({ kind: "scheduled", date: "2026-11-20" });
  });

  it("reintento con la fecha pasada: en curso dentro de la espera y «no se pudo» después (nunca una fecha pasada)", () => {
    const failedWithRetry = (retry: string) =>
      familyInput({ last: { status: "failed", nextRetryAt: new Date(retry), completedAt: NOW } });
    expect(familyAutomaticFeeStatusOf(failedWithRetry("2026-11-14T23:00:00.000Z"), NOW)).toEqual({
      kind: "in_progress",
    });
    expect(familyAutomaticFeeStatusOf(failedWithRetry("2026-11-09T23:00:00.000Z"), NOW)).toEqual({
      kind: "not_collected",
    });
  });

  it.each([
    ["tarjeta revocada después de emitir la cuota", "authorization_missing"],
    ["interruptor apagado", "preference_manual"],
    ["cambio de plan", "preference_entitlement_stale"],
  ])("%s: la familia no ve ninguna promesa de cobro", (_label, blocker) => {
    expect(familyAutomaticFeeStatusOf(familyInput({ blocker }), NOW)).toBeNull();
    expect(
      familyAutomaticFeeStatusOf(
        familyInput({
          blocker,
          last: { status: "failed", nextRetryAt: new Date("2026-11-19T23:00:00.000Z"), completedAt: NOW },
        }),
        NOW
      )
    ).toBeNull();
  });

  it("un cobro ya en curso o hecho no depende de la autorización de hoy", () => {
    expect(
      familyAutomaticFeeStatusOf(
        familyInput({ blocker: "authorization_missing", last: { status: "processing", nextRetryAt: null, completedAt: null } }),
        NOW
      )
    ).toEqual({ kind: "in_progress" });
  });

  it.each(["failed", "canceled"])("%s sin reintento: no se pudo cobrar", (status) => {
    expect(
      familyAutomaticFeeStatusOf(familyInput({ last: { status, nextRetryAt: null, completedAt: NOW } }), NOW)
    ).toEqual({ kind: "not_collected" });
  });

  it("cerrada porque pasó la ventana de cobro: «no se pudo cobrar», sin fecha ni promesa", () => {
    expect(
      familyAutomaticFeeStatusOf(
        familyInput({ nextDueAt: "2026-11-02T22:59:59.999Z", last: { status: "canceled", nextRetryAt: null, completedAt: NOW } }),
        NOW
      )
    ).toEqual({ kind: "not_collected" });
  });

  it("cancelada porque la domiciliación todavía no se cobra sola: no enseña nada (nunca se intentó)", () => {
    expect(
      familyAutomaticFeeStatusOf(
        familyInput({
          last: { status: "canceled", nextRetryAt: null, completedAt: NOW, failureCode: "sepa_not_enabled" },
        }),
        NOW
      )
    ).toBeNull();
    // Otro motivo de cierre sí se cuenta.
    expect(
      familyAutomaticFeeStatusOf(
        familyInput({ last: { status: "canceled", nextRetryAt: null, completedAt: NOW, failureCode: "reminder_sent" } }),
        NOW
      )
    ).toEqual({ kind: "not_collected" });
  });

  it("cancelada y pagada a mano: no enseña nada", () => {
    expect(
      familyAutomaticFeeStatusOf(
        familyInput({ invoiceStatus: "paid", last: { status: "canceled", nextRetryAt: null, completedAt: NOW } }),
        NOW
      )
    ).toBeNull();
  });

  it("cuota manual sin intento o zona ilegible: nada", () => {
    expect(familyAutomaticFeeStatusOf(familyInput({ hasAutomaticCharge: false }), NOW)).toBeNull();
    expect(familyAutomaticFeeStatusOf(familyInput({ timezone: "Zona/Inventada" }), NOW)).toBeNull();
  });

  it("los textos son los del plan y no llevan jerga", () => {
    const texts = [
      familyAutomaticFeeText({ kind: "scheduled", date: "2026-12-05" }),
      familyAutomaticFeeText({ kind: "in_progress" }),
      familyAutomaticFeeText({ kind: "collected", date: "2026-11-05" }),
      familyAutomaticFeeText({ kind: "not_collected" }),
    ];
    expect(texts[0]).toMatch(/^Se cobrará automáticamente el 5 dic\.? 2026$/);
    expect(texts[1]).toBe("Cobro en curso");
    expect(texts[2]).toMatch(/^Cobrada automáticamente el 5 nov\.? 2026$/);
    expect(texts[3]).toBe("No se pudo cobrar automáticamente; tu academia te dirá cómo pagarla");
    expect(texts.join(" ")).not.toMatch(/stripe|payment|intent|webhook|connect|decline/i);
  });
});

describe("motivos en palabras sencillas", () => {
  it("traduce los códigos del banco y de la puerta, sin enseñarlos", () => {
    expect(failureReasonText({ failureCode: "card_declined", declineCode: "insufficient_funds" })).toBe(
      "No había saldo suficiente."
    );
    expect(failureReasonText({ failureCode: "authentication_required", declineCode: null })).toBe(
      "El banco pide que la familia confirme el pago."
    );
    expect(failureReasonText({ failureCode: "authorization_inactive", declineCode: null })).toBe(
      "La familia ya no tiene un método de pago activo."
    );
    expect(failureReasonText({ failureCode: "manual_payment", declineCode: null })).toBe(
      "Se registró un pago a mano."
    );
    expect(failureReasonText({ failureCode: "codigo_desconocido", declineCode: "otro_codigo" })).toBe(
      "No se pudo cobrar automáticamente."
    );
    expect(reviewReasonText("multiple_payments")).toBe("Hay más de un cobro para esta cuota. Compruébalo en Stripe.");
    // Fase 4: cobro tardío (D10) y el hermano que se canceló por él.
    expect(reviewReasonText("duplicate_collection")).toBe(
      "Esta cuota se cobró dos veces. Devuelve uno desde tu panel de Stripe."
    );
    expect(reviewReasonText("late_success_pending")).toBe(
      "Stripe cobró tarde esta cuota; lo registraremos cuando el banco resuelva el otro cobro."
    );
    // Tarea M: plazo de la familia pasado y Stripe no deja leer ni cancelar el cobro.
    expect(reviewReasonText("requires_action_unreadable")).toBe(
      "Pasó el plazo para que la familia confirmara el pago y no podemos ver su resultado. Compruébalo en Stripe."
    );
    expect(failureReasonText({ failureCode: "late_success_elsewhere", declineCode: null, status: "canceled" })).toBe(
      "Se canceló porque un cobro anterior de esta cuota se completó."
    );
    expect(failureReasonText({ failureCode: "paid_plan_required", declineCode: null })).toBe(
      "Tu plan no incluye el cobro automático de cuotas."
    );
    expect(failureReasonText({ failureCode: "account_stale", declineCode: null })).toBe(
      "No pudimos comprobar tu cuenta de Stripe a tiempo."
    );
    // Solo suspendida o cerrada: una academia en prueba sí cobra (17-11-2026).
    expect(failureReasonText({ failureCode: "organization_not_active", declineCode: null, status: "canceled" })).toBe(
      "La academia está suspendida o cerrada."
    );
    expect(reviewReasonText("motivo_nuevo")).toBe("El cobro necesita una comprobación. Compruébalo en Stripe.");
    expect(failureReasonText({ failureCode: "collection_window_expired", declineCode: null })).toBe(
      "No se pudo intentar el cobro a tiempo. Se cobra a mano."
    );
  });

  it("recordatorio ya enviado: se cobra a mano porque ya se avisó a la familia, sin códigos", () => {
    const text = "Ya se avisó a la familia con un recordatorio de pago. Se cobra a mano.";
    expect(failureReasonText({ status: "canceled", failureCode: "reminder_sent", declineCode: null })).toBe(text);
    // Cierra un reintento: manda sobre el rechazo anterior.
    expect(
      failureReasonText({ status: "canceled", failureCode: "reminder_sent", declineCode: "insufficient_funds" })
    ).toBe(text);
  });

  it("un cierre canceled enseña su propio motivo, no el del rechazo anterior", () => {
    for (const [code, text] of [
      ["canceled_by_academy", "Lo canceló la academia."],
      ["manual_payment", "Se registró un pago a mano."],
      ["reviewed_by_academy", "La academia lo revisó y lo cerró."],
      // C1: cerrado sin poder saber si se cobró (texto exacto para la academia).
      [
        "reviewed_unverifiable",
        "Comprueba en tu panel de Stripe si se cobró; si se cobró, regístralo como pago manual.",
      ],
      // C3: cancelado en Stripe sin error de pago (nunca «el banco lo rechazó»).
      ["canceled_in_stripe", "El cobro se canceló en Stripe. Se cobra a mano."],
      ["collection_window_expired", "No se pudo intentar el cobro a tiempo. Se cobra a mano."],
      ["authorization_missing", "La familia ya no tiene un método de pago activo."],
    ] as const) {
      expect(failureReasonText({ status: "canceled", failureCode: code, declineCode: "insufficient_funds" }), code).toBe(text);
    }
    // Un fallo sigue enseñando el rechazo del banco.
    expect(failureReasonText({ status: "failed", failureCode: "card_declined", declineCode: "insufficient_funds" })).toBe(
      "No había saldo suficiente."
    );
  });

  it("lo que Stripe no deja cobrar se explica sin códigos y dice que se cobra a mano", () => {
    const below = "Lo que queda por pagar es menos de 0,50 €, el mínimo que admite Stripe. Se cobra a mano.";
    const notActive = "Este tipo de pago no está activado en tu cuenta de Stripe. Se cobra a mano.";
    for (const [code, text] of [
      ["amount_below_minimum", below],
      ["amount_too_small", below],
      ["resource_missing", "Stripe ya no tiene el método de pago de la familia. Se cobra a mano."],
      ["account_invalid", "Tu cuenta de Stripe no está lista para cobrar. Se cobra a mano."],
      ["payment_method_unactivated", notActive],
      ["capability_not_active", notActive],
      // C4: petición rechazada al crear sin código.
      ["invalid_request", "Stripe no aceptó crear el cobro. Se cobra a mano."],
    ] as const) {
      expect(failureReasonText({ status: "canceled", failureCode: code, declineCode: null }), code).toBe(text);
    }
    // C4: con otro código de petición rechazada, el texto genérico (nunca el código).
    expect(failureReasonText({ status: "canceled", failureCode: "parameter_invalid_integer", declineCode: null })).toBe(
      "No se pudo cobrar automáticamente."
    );
    expect(reviewReasonText("amount_mismatch")).toBe(
      "Stripe cobró un importe distinto al de esta cuota y no lo hemos registrado. Compruébalo en Stripe."
    );
  });
});

describe("fila de la academia (pura)", () => {
  it.each([
    "paid_plan_required",
    "entitlement_missing",
    "entitlement_not_effective",
    "subscription_missing",
    "subscription_mismatch",
    "subscription_not_active",
    "subscription_period_not_current",
    "plan_changed",
    "authorization_changed",
    "requires_action",
    "account_stale",
  ])("el motivo %s tiene su propia frase sencilla", (code) => {
    const text = failureReasonText({ failureCode: code, declineCode: null });
    expect(text).not.toBe("No se pudo cobrar automáticamente.");
    expect(text).not.toContain(code);
    expect(text).not.toMatch(/_/);
  });

  it.each(["idempotency_conflict", "intent_mismatch", "payment_conflict", "created_without_claim"])(
    "el aviso de revisión %s tiene su propia frase sencilla",
    (code) => {
      const text = reviewReasonText(code);
      expect(text).not.toBe("El cobro necesita una comprobación. Compruébalo en Stripe.");
      expect(text).not.toMatch(/_/);
    }
  );

  it("tarjeta revocada después de emitir: «Se cobrará a mano» con el motivo", () => {
    expect(
      ownerAutomaticCollectionItemOf(ownerRow({ blocker: "authorization_missing" }), NOW, "2026-11")
    ).toMatchObject({
      state: "manual",
      date: "2026-11-20",
      reason: "La familia ya no tiene un método de pago activo.",
      canCancel: false,
    });
  });

  it("interruptor apagado con un reintento pendiente: «Se cobrará a mano», y aún se puede cancelar", () => {
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({
          blocker: "preference_manual",
          attempt: attempt({
            status: "failed",
            declineCode: "insufficient_funds",
            nextRetryAt: new Date("2026-11-19T23:00:00.000Z"),
            allocationStatus: null,
          }),
        }),
        NOW,
        "2026-11"
      )
    ).toMatchObject({
      state: "manual",
      reason: "No había saldo suficiente. La familia pasó a cobro manual.",
      canCancel: true,
    });
  });

  it("reintento con la fecha pasada: en curso dentro de la espera y fallido después", () => {
    const row = (retry: string) =>
      ownerRow({
        attempt: attempt({
          status: "failed",
          declineCode: "insufficient_funds",
          nextRetryAt: new Date(retry),
          completedAt: new Date("2026-11-05T08:00:00.000Z"),
          allocationStatus: null,
        }),
      });
    expect(ownerAutomaticCollectionItemOf(row("2026-11-14T23:00:00.000Z"), NOW, "2026-11")).toMatchObject({
      state: "in_progress",
      date: "2026-11-15",
    });
    expect(ownerAutomaticCollectionItemOf(row("2026-11-09T23:00:00.000Z"), NOW, "2026-11")).toMatchObject({
      state: "failed",
      date: "2026-11-05",
      reason: "No había saldo suficiente.",
    });
  });

  it("D3: el primer fallo con reintento sale como incidencia con su motivo y si la familia está avisada", () => {
    const failedRow = (familyNotice: OwnerCollectionRow["familyNotice"]) =>
      ownerRow({
        familyNotice,
        attempt: attempt({
          status: "failed",
          failureCode: "card_declined",
          declineCode: "insufficient_funds",
          // 00:00 del 18-11 en Madrid.
          nextRetryAt: new Date("2026-11-17T23:00:00.000Z"),
          completedAt: new Date("2026-11-17T08:00:00.000Z"),
          allocationStatus: null,
        }),
      });
    expect(ownerAutomaticCollectionItemOf(failedRow("sent"), NOW, "2026-11")).toMatchObject({
      state: "retry_scheduled",
      date: "2026-11-18",
      reason: "No había saldo suficiente.",
      canCancel: true,
      familyNotice: "sent",
    });
    expect(ownerAutomaticCollectionItemOf(failedRow("not_sent"), NOW, "2026-11")).toMatchObject({
      state: "retry_scheduled",
      familyNotice: "not_sent",
    });
    expect(ownerAutomaticCollectionItemOf(failedRow(undefined), NOW, "2026-11")).toMatchObject({
      state: "retry_scheduled",
      familyNotice: null,
    });
    // Ya cobrada en un reintento: el aviso deja de importar.
    expect(
      ownerAutomaticCollectionItemOf(ownerRow({ familyNotice: "sent", attempt: attempt() }), NOW, "2026-11")
    ).toMatchObject({ state: "collected", familyNotice: null });
  });

  it("D3: el resultado guardado del aviso se traduce para la academia", () => {
    expect(familyNoticeStateOf("sent")).toBe("sent");
    expect(familyNoticeStateOf("no_email")).toBe("not_sent");
    expect(familyNoticeStateOf("not_delivered")).toBe("not_sent");
    for (const outcome of ["invoice_closed", "superseded", "organization_inactive", "otro", null]) {
      expect(familyNoticeStateOf(outcome)).toBeNull();
    }
  });

  it("sin intento: se cobrará el día previsto, sin acciones", () => {
    expect(ownerAutomaticCollectionItemOf(ownerRow(), NOW, "2026-11")).toMatchObject({
      state: "scheduled",
      date: "2026-11-20",
      amountCents: 4500,
      reason: null,
      needsReview: false,
      canCancel: false,
      canMarkReviewed: false,
      manualPaymentBlocked: false,
    });
  });

  it("sin intento y de otro mes: no sale", () => {
    expect(ownerAutomaticCollectionItemOf(ownerRow({ nextDueAt: "2026-12-02T22:59:59.999Z" }), NOW, "2026-11")).toBeNull();
  });

  it("sin intento, del mes anterior y aún en su espera: sale (se sigue cobrando)", () => {
    // 2 dic en Madrid; el cobro era el 30 nov y la espera dura 3 días.
    const now = new Date("2026-12-02T09:00:00.000Z");
    expect(
      ownerAutomaticCollectionItemOf(ownerRow({ nextDueAt: "2026-11-30T12:00:00.000Z" }), now, "2026-12")
    ).toMatchObject({ state: "in_progress", date: "2026-11-30" });
  });

  it("sin intento, del mes anterior y pasada su espera: no sale", () => {
    const now = new Date("2026-12-05T09:00:00.000Z");
    expect(
      ownerAutomaticCollectionItemOf(ownerRow({ nextDueAt: "2026-11-30T12:00:00.000Z" }), now, "2026-12")
    ).toBeNull();
  });

  it("sin intento, sede por detrás de la academia cerca de medianoche: sale con el mes de la sede", () => {
    // 00:30 del 1 dic en Madrid (mes de la lista: diciembre) = 23:30 del 30 nov en Canarias.
    const now = new Date("2026-11-30T23:30:00.000Z");
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({ timezone: "Atlantic/Canary", nextDueAt: "2026-11-30T12:00:00.000Z" }),
        now,
        "2026-12"
      )
    ).toMatchObject({ state: "scheduled", date: "2026-11-30" });
  });

  it("sin intento, sede por detrás de la academia y cuota ya pasada de su espera: no se cuela", () => {
    // 00:30 del 1 dic en Madrid (mes de la lista: diciembre) = 23:30 del 30 nov en Canarias.
    const now = new Date("2026-11-30T23:30:00.000Z");
    // Cobro el 20 nov en Canarias: fuera de su espera de tres días.
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({ timezone: "Atlantic/Canary", nextDueAt: "2026-11-20T12:00:00.000Z" }),
        now,
        "2026-12"
      )
    ).toBeNull();
    // Cobro el 28 nov en Canarias: aún en su espera, sale (se sigue cobrando).
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({ timezone: "Atlantic/Canary", nextDueAt: "2026-11-28T12:00:00.000Z" }),
        now,
        "2026-12"
      )
    ).toMatchObject({ state: "in_progress", date: "2026-11-28" });
  });

  it("sin intento y pasado el margen: no se cobró, se cobra a mano", () => {
    expect(
      ownerAutomaticCollectionItemOf(ownerRow({ nextDueAt: "2026-11-02T22:59:59.999Z" }), NOW, "2026-11")
    ).toMatchObject({ state: "not_attempted", reason: "No se pudo intentar el cobro a tiempo. Se cobra a mano." });
  });

  it("fallida con reintento: motivo sencillo, fecha del reintento y se puede cancelar", () => {
    const item = ownerAutomaticCollectionItemOf(
      ownerRow({
        attempt: attempt({
          status: "failed",
          failureCode: "card_declined",
          declineCode: "insufficient_funds",
          nextRetryAt: new Date("2026-11-19T23:00:00.000Z"),
          allocationStatus: null,
        }),
      }),
      NOW,
      "2026-11"
    );
    expect(item).toMatchObject({
      state: "retry_scheduled",
      date: "2026-11-20",
      reason: "No había saldo suficiente.",
      canCancel: true,
      canMarkReviewed: false,
      manualPaymentBlocked: false,
    });
    expect(JSON.stringify(item)).not.toMatch(/insufficient_funds|card_declined/);
  });

  it("creada con aviso de revisión: se puede cancelar y marcar como revisada; bloquea el pago a mano", () => {
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({
          attempt: attempt({
            status: "created",
            completedAt: null,
            allocationStatus: null,
            hasReviewNotice: true,
            reviewReason: "multiple_payments",
          }),
        }),
        NOW,
        "2026-11"
      )
    ).toMatchObject({
      state: "in_progress",
      needsReview: true,
      canCancel: true,
      canMarkReviewed: true,
      manualPaymentBlocked: true,
      reason: "Hay más de un cobro para esta cuota. Compruébalo en Stripe.",
    });
  });

  it("C1: Stripe cobró otro importe (aviso amount_mismatch): «Marcar como revisado» sí (lo cierra sin registrarlo), cancelar no", () => {
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({
          attempt: attempt({
            status: "created",
            completedAt: null,
            allocationStatus: null,
            hasReviewNotice: true,
            reviewReason: "amount_mismatch",
          }),
        }),
        NOW,
        "2026-11"
      )
    ).toMatchObject({
      state: "in_progress",
      needsReview: true,
      canCancel: false,
      canMarkReviewed: true,
      manualPaymentBlocked: true,
      reason: "Stripe cobró un importe distinto al de esta cuota y no lo hemos registrado. Compruébalo en Stripe.",
    });
  });

  it("reanudaciones agotadas sin aviso: necesita revisión", () => {
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({ attempt: attempt({ status: "claimed", completedAt: null, allocationStatus: null, resumeCount: 3 }) }),
        NOW,
        "2026-11"
      )
    ).toMatchObject({
      state: "in_progress",
      canCancel: false,
      canMarkReviewed: true,
      reason: "No pudimos confirmar el resultado del cobro. Compruébalo en Stripe.",
    });
  });

  it("panel de la academia lista un intento requires_action como en curso", () => {
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({ attempt: attempt({ status: "requires_action", completedAt: null, allocationStatus: null }) }),
        NOW,
        "2026-11"
      )
    ).toMatchObject({
      state: "in_progress",
      needsReview: false,
      // Cancelar lo cancela en Stripe antes de cerrarlo, como un cobro creado.
      canCancel: true,
      canMarkReviewed: false,
      manualPaymentBlocked: true,
    });
    // Para la familia, también en curso.
    expect(
      familyAutomaticFeeStatusOf(
        familyInput({
          last: { status: "requires_action", completedAt: null, nextRetryAt: null, failureCode: null },
        }),
        NOW
      )
    ).toEqual({ kind: "in_progress" });
  });

  describe("Tarea 5: la familia tiene que confirmar el pago con su banco", () => {
    // Plazo: final del 18-11 en Madrid (NOW es el 17-11).
    const DEADLINE = new Date("2026-11-18T22:59:59.999Z");
    const PASSED = new Date("2026-11-16T22:59:59.999Z");
    const waiting = { status: "requires_action", completedAt: null, nextRetryAt: null, failureCode: null };

    it("familia: con plazo y a tiempo, action_required con el último día; sin plazo o pasado, en curso", () => {
      expect(
        familyAutomaticFeeStatusOf(familyInput({ last: { ...waiting, actionDeadlineAt: DEADLINE } }), NOW)
      ).toEqual({ kind: "action_required", deadline: "2026-11-18" });
      // El cobro ya salió: aunque la puerta ya no dejara cobrar otro, se puede confirmar este.
      expect(
        familyAutomaticFeeStatusOf(
          familyInput({ blocker: "reminder_sent", last: { ...waiting, actionDeadlineAt: DEADLINE } }),
          NOW
        )
      ).toEqual({ kind: "action_required", deadline: "2026-11-18" });
      // Plazo pasado (el proceso diario aún no lo cerró) o sin plazo leído: nunca una fecha pasada.
      expect(
        familyAutomaticFeeStatusOf(familyInput({ last: { ...waiting, actionDeadlineAt: PASSED } }), NOW)
      ).toEqual({ kind: "in_progress" });
      expect(
        familyAutomaticFeeStatusOf(familyInput({ last: { ...waiting, actionDeadlineAt: null } }), NOW)
      ).toEqual({ kind: "in_progress" });
      expect(familyAutomaticFeeText({ kind: "action_required", deadline: "2026-11-18" })).toMatch(
        /^Tu banco pide que confirmes este pago\. Puedes hacerlo hasta el 18 nov\.? 2026\.$/
      );
    });

    it("panel de la academia: texto de espera con la fecha (estado action_required)", () => {
      expect(
        ownerAutomaticCollectionItemOf(
          ownerRow({
            attempt: attempt({ status: "requires_action", completedAt: null, allocationStatus: null, actionDeadlineAt: DEADLINE }),
          }),
          NOW,
          "2026-11"
        )
      ).toMatchObject({
        state: "action_required",
        date: "2026-11-18",
        needsReview: false,
        canCancel: true,
        manualPaymentBlocked: true,
      });
      // Pasado el plazo, en curso hasta que el proceso diario lo cierre.
      expect(
        ownerAutomaticCollectionItemOf(
          ownerRow({
            attempt: attempt({ status: "requires_action", completedAt: null, allocationStatus: null, actionDeadlineAt: PASSED }),
          }),
          NOW,
          "2026-11"
        )
      ).toMatchObject({ state: "in_progress", date: null, canCancel: true });
    });
  });

  it("en el banco: ni cancelar ni revisar", () => {
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({ attempt: attempt({ status: "processing", completedAt: null, allocationStatus: null }) }),
        NOW,
        "2026-11"
      )
    ).toMatchObject({ state: "processing", canCancel: false, canMarkReviewed: false, manualPaymentBlocked: true });
  });

  it("cobrada con un reparto que no cuadra: necesita revisión sin acción de cierre", () => {
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({ attempt: attempt({ allocationStatus: "needs_review" }) }),
        NOW,
        "2026-11"
      )
    ).toMatchObject({
      state: "collected",
      date: "2026-11-05",
      needsReview: true,
      canMarkReviewed: false,
      reason: "Se cobró, pero no se pudo repartir entre las cuotas. Revisa los pagos de esta familia.",
    });
  });

  it("cancelada por la academia: motivo sencillo", () => {
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({ attempt: attempt({ status: "canceled", failureCode: "canceled_by_academy", allocationStatus: null }) }),
        NOW,
        "2026-11"
      )
    ).toMatchObject({ state: "canceled", reason: "Lo canceló la academia.", canCancel: false });
  });

  it("reintento cancelado por la academia: su motivo, no el rechazo que conserva", () => {
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({
          attempt: attempt({
            status: "canceled",
            failureCode: "canceled_by_academy",
            declineCode: "insufficient_funds",
            allocationStatus: null,
          }),
        }),
        NOW,
        "2026-11"
      )
    ).toMatchObject({ state: "canceled", reason: "Lo canceló la academia." });
  });

  it("cerrada porque pasó la ventana de cobro: no se cobró automáticamente y se cobra a mano", () => {
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({
          attempt: attempt({
            status: "canceled",
            failureCode: "collection_window_expired",
            completedAt: new Date("2026-11-10T06:00:00.000Z"),
            allocationStatus: null,
          }),
        }),
        NOW,
        "2026-11"
      )
    ).toMatchObject({
      state: "not_attempted",
      date: "2026-11-10",
      reason: "No se pudo intentar el cobro a tiempo. Se cobra a mano.",
      needsReview: false,
      canCancel: false,
      canMarkReviewed: false,
      manualPaymentBlocked: false,
    });
  });

  it("abierto más de 24 h sin cambios y sin aviso: se puede marcar como revisado", () => {
    const open = (status: string, updatedAt: string) =>
      ownerAutomaticCollectionItemOf(
        ownerRow({
          attempt: attempt({ status, completedAt: null, allocationStatus: null, updatedAt: new Date(updatedAt) }),
        }),
        NOW,
        "2026-11"
      );
    // 25 h sin cambios.
    expect(open("created", "2026-11-16T08:00:00.000Z")).toMatchObject({
      state: "in_progress",
      needsReview: true,
      canMarkReviewed: true,
      reason: "El cobro lleva más de un día sin avanzar. Compruébalo en Stripe.",
    });
    expect(open("claimed", "2026-11-16T08:00:00.000Z")).toMatchObject({ canMarkReviewed: true });
    // 23 h: todavía no.
    expect(open("created", "2026-11-16T10:00:00.000Z")).toMatchObject({ canMarkReviewed: false, needsReview: false });
    // En el banco: no por `updated_at` (la domiciliación tarda días), solo
    // pasados 15 días desde que se reclamó.
    expect(open("processing", "2026-11-10T08:00:00.000Z")).toMatchObject({ canMarkReviewed: false });
  });

  it("en curso más de 15 días: sin aviso sigue en el banco y sin botón; con el aviso processing_unreadable, se puede revisar", () => {
    const processing = (claimedAt: string, overrides: Partial<NonNullable<OwnerCollectionRow["attempt"]>> = {}) =>
      ownerAutomaticCollectionItemOf(
        ownerRow({
          attempt: attempt({
            status: "processing",
            completedAt: null,
            allocationStatus: null,
            updatedAt: new Date(claimedAt),
            claimedAt: new Date(claimedAt),
            ...overrides,
          }),
        }),
        NOW,
        "2026-11"
      );
    // 16 días sin aviso: el proceso diario lo lee y sigue en curso. «Marcar
    // como revisado» respondería que no se puede cancelar: no se ofrece.
    expect(processing("2026-11-01T09:00:00.000Z")).toMatchObject({
      state: "processing",
      needsReview: false,
      canMarkReviewed: false,
      canCancel: false,
      manualPaymentBlocked: true,
      reason: "La domiciliación sigue en el banco.",
    });
    // 16 días y el aviso de que Stripe no deja leerlo: se puede revisar.
    expect(
      processing("2026-11-01T09:00:00.000Z", { hasReviewNotice: true, reviewReason: "processing_unreadable" })
    ).toMatchObject({
      state: "processing",
      needsReview: true,
      canMarkReviewed: true,
      reason: "El cobro lleva más de 15 días en curso y no podemos ver su resultado. Compruébalo en Stripe.",
    });
    // 16 días con las reanudaciones agotadas: se puede revisar, con su motivo.
    expect(processing("2026-11-01T09:00:00.000Z", { resumeCount: 3 })).toMatchObject({
      canMarkReviewed: true,
      reason: "No pudimos confirmar el resultado del cobro. Compruébalo en Stripe.",
    });
    // 14 días: todavía no.
    expect(processing("2026-11-03T09:00:00.000Z")).toMatchObject({
      canMarkReviewed: false,
      needsReview: false,
      reason: "La domiciliación está en el banco; tarda unos días.",
    });
    // Con el aviso del proceso diario, el mismo texto aunque falte la fecha.
    expect(
      processing("2026-11-03T09:00:00.000Z", {
        claimedAt: null,
        hasReviewNotice: true,
        reviewReason: "processing_unreadable",
      })
    ).toMatchObject({
      canMarkReviewed: true,
      reason: "El cobro lleva más de 15 días en curso y no podemos ver su resultado. Compruébalo en Stripe.",
    });
  });

  it("factura sin más intentos (aviso attempts_exhausted): necesita revisión, se cobra a mano y no promete el reintento", () => {
    expect(
      ownerAutomaticCollectionItemOf(
        ownerRow({
          attemptsExhausted: true,
          attempt: attempt({
            status: "failed",
            declineCode: "insufficient_funds",
            nextRetryAt: new Date("2026-11-19T23:00:00.000Z"),
            allocationStatus: null,
          }),
        }),
        NOW,
        "2026-11"
      )
    ).toMatchObject({
      state: "failed",
      needsReview: true,
      canMarkReviewed: false,
      reason: "No había saldo suficiente. Esta cuota ya no admite más intentos automáticos. Se cobra a mano.",
    });
  });
});

describe("puertas de las lecturas", () => {
  it("familia: con la bandera apagada solo enseña «Cobro en curso» de los cobros en marcha", async () => {
    vi.mocked(isFamilyAutomaticCollectionOpen).mockReturnValue(false);
    vi.mocked(resolveFamilyPortalAccess).mockResolvedValue({
      academies: [{ organizationId: ORGANIZATION_ID, feeFamilyIds: [FAMILY_ID] }],
    } as unknown as Awaited<ReturnType<typeof resolveFamilyPortalAccess>>);
    const base = {
      invoiceStatus: "issued",
      timezone: TZ,
      collectionDayOfMonth: null,
      hasAutomaticCharge: true,
      nextDueAt: "2026-11-20T22:59:59.999Z",
      preferenceMode: "automatic",
      preferenceRevision: 5,
      hasActiveAuthorization: true,
      lastNextRetryAt: null,
      lastCompletedAt: null,
    };
    const ids = [
      INVOICE_ID,
      "91000000-0000-4000-8000-000000000402",
      "91000000-0000-4000-8000-000000000403",
      "91000000-0000-4000-8000-000000000404",
      "91000000-0000-4000-8000-000000000405",
      "91000000-0000-4000-8000-000000000406",
    ];
    holder.execute.mockResolvedValue({
      rows: [
        // SEPA en el banco: la relectura diaria sigue con la bandera apagada.
        { ...base, invoiceId: ids[0], lastStatus: "processing" },
        { ...base, invoiceId: ids[1], lastStatus: "claimed" },
        { ...base, invoiceId: ids[2], lastStatus: "created" },
        // Con la bandera apagada no se promete ninguna fecha ni un reintento.
        { ...base, invoiceId: ids[3], lastStatus: null },
        { ...base, invoiceId: ids[4], lastStatus: "failed", lastNextRetryAt: "2026-11-18T23:00:00.000Z" },
        { ...base, invoiceId: ids[5], lastStatus: "succeeded", lastCompletedAt: "2026-11-16T09:00:00.000Z" },
      ],
    });

    const statuses = await getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: ids, now: NOW });

    expect(statuses).toEqual({
      [ids[0]]: { kind: "in_progress" },
      [ids[1]]: { kind: "in_progress" },
      [ids[2]]: { kind: "in_progress" },
    });
    expect(familyAutomaticFeeText(statuses[ids[0]]!)).toBe("Cobro en curso");
    // Misma guarda del portal; sin leer el plan de la academia.
    expect(holder.execute).toHaveBeenCalledTimes(1);
    const query = dialect.sqlToQuery(holder.execute.mock.calls[0][0] as SQL);
    expect(query.params).toEqual(expect.arrayContaining([USER_ID, ORGANIZATION_ID, FAMILY_ID]));
    expect(query.sql).toContain("fp_g.auth_user_id");
    expect(query.sql).toContain("zaltyko.family_collection_attempts");
    expect(loadOrganizationPlanState).not.toHaveBeenCalled();
  });

  it("familia: con la bandera apagada y sin las tablas de la Fase 3 no lee nada", async () => {
    vi.mocked(isFamilyAutomaticCollectionOpen).mockReturnValue(false);
    vi.mocked(isFamilyCollectionStorageAvailable).mockResolvedValue(false);

    await expect(getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: [INVOICE_ID] })).resolves.toEqual({});
    expect(resolveFamilyPortalAccess).not.toHaveBeenCalled();
    expect(holder.execute).not.toHaveBeenCalled();
  });

  it("familia: sin las tablas de la Fase 3 no resuelve el acceso", async () => {
    vi.mocked(isFamilyCollectionStorageAvailable).mockResolvedValue(false);

    await expect(getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: [INVOICE_ID] })).resolves.toEqual({});
    expect(resolveFamilyPortalAccess).not.toHaveBeenCalled();
  });

  it("familia: la consulta repite la guarda del portal con el usuario de la sesión y solo sus familias", async () => {
    vi.mocked(resolveFamilyPortalAccess).mockResolvedValue({
      academies: [
        { organizationId: ORGANIZATION_ID, feeFamilyIds: [FAMILY_ID] },
        { organizationId: "91000000-0000-4000-8000-000000000002", feeFamilyIds: [] },
      ],
    } as unknown as Awaited<ReturnType<typeof resolveFamilyPortalAccess>>);
    holder.execute.mockResolvedValue({
      rows: [
        {
          invoiceId: INVOICE_ID,
          invoiceStatus: "issued",
          timezone: TZ,
          collectionDayOfMonth: null,
          hasAutomaticCharge: true,
          nextDueAt: "2026-11-20T22:59:59.999Z",
          preferenceMode: "automatic",
          preferenceRevision: 5,
          hasActiveAuthorization: true,
          lastStatus: null,
          lastNextRetryAt: null,
          lastCompletedAt: null,
        },
      ],
    });

    const statuses = await getFamilyAutomaticFeeStatuses({
      userId: USER_ID,
      invoiceIds: [INVOICE_ID, "no-es-un-id"],
      now: NOW,
    });

    expect(statuses).toEqual({ [INVOICE_ID]: { kind: "scheduled", date: "2026-11-20" } });
    // Una sola academia con familias que paga: una sola consulta.
    expect(holder.execute).toHaveBeenCalledTimes(1);
    const query = dialect.sqlToQuery(holder.execute.mock.calls[0][0] as SQL);
    expect(query.params).toEqual(expect.arrayContaining([USER_ID, ORGANIZATION_ID, INVOICE_ID, FAMILY_ID]));
    expect(query.params).not.toContain("no-es-un-id");
    expect(query.sql).toContain("fp_g.auth_user_id");
    expect(query.sql).toContain("fp_p.starts_on");
    expect(query.sql).toContain("zaltyko.family_collection_attempts");
    expect(query.sql).toContain("zaltyko.family_payment_authorizations");
    expect(query.sql).toContain("zaltyko.family_collection_preferences");
  });

  it("Tarea 5 — familia: el plazo solo se lee con la confirmación abierta; si no, «Cobro en curso»", async () => {
    vi.mocked(resolveFamilyPortalAccess).mockResolvedValue({
      academies: [{ organizationId: ORGANIZATION_ID, feeFamilyIds: [FAMILY_ID] }],
    } as unknown as Awaited<ReturnType<typeof resolveFamilyPortalAccess>>);
    const attemptId = "91000000-0000-4000-8000-000000000601";
    const payerId = "91000000-0000-4000-8000-000000000701";
    const row = {
      invoiceId: INVOICE_ID,
      familyId: FAMILY_ID,
      invoiceStatus: "issued",
      timezone: TZ,
      collectionDayOfMonth: null,
      hasAutomaticCharge: true,
      nextDueAt: "2026-11-15T22:59:59.999Z",
      preferenceMode: "automatic",
      preferenceRevision: 5,
      hasActiveAuthorization: true,
      lastAttemptId: attemptId,
      lastFamilyPayerId: payerId,
      lastStatus: "requires_action",
      lastNextRetryAt: null,
      lastCompletedAt: null,
    };
    const viewerPayer = (familyPayerId: string) => ({
      rows: [{ guardianId: "91000000-0000-4000-8000-000000000801", familyPayerId }],
    });

    vi.mocked(isFamilyPaymentConfirmationOpen).mockReturnValue(true);
    holder.execute
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce(viewerPayer(payerId))
      .mockResolvedValueOnce({ rows: [{ actionDeadlineAt: "2026-11-18T22:59:59.999Z" }] });
    await expect(
      getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: [INVOICE_ID], now: NOW })
    ).resolves.toEqual({ [INVOICE_ID]: { kind: "action_required", deadline: "2026-11-18" } });
    const familyQuery = dialect.sqlToQuery(holder.execute.mock.calls[0][0] as SQL);
    expect(familyQuery.sql).toContain(`as "lastAttemptId"`);
    expect(familyQuery.sql).toContain(`as "lastFamilyPayerId"`);
    // Ola final (B1): la pagadora de la sesión, con la misma regla que la confirmación (resolveFamilyPayer).
    const payerQuery = dialect.sqlToQuery(holder.execute.mock.calls[1][0] as SQL);
    expect(payerQuery.sql).toContain("g.auth_user_id");
    expect(payerQuery.params).toEqual(expect.arrayContaining([USER_ID, ORGANIZATION_ID, FAMILY_ID]));
    // La lectura del plazo es la del almacén (C2), con la academia y el intento.
    const deadlineQuery = dialect.sqlToQuery(holder.execute.mock.calls[2][0] as SQL);
    expect(deadlineQuery.sql).toContain("status = 'requires_action'");
    expect(deadlineQuery.params).toEqual(expect.arrayContaining([ORGANIZATION_ID, attemptId]));
    expect(isFamilyCollectionEventsStorageAvailable).toHaveBeenCalledTimes(1);

    // Ola final (B1): otra pagadora vigente de la familia (la academia la
    // cambió dentro de la ventana) → «Cobro en curso», sin leer el plazo.
    holder.execute.mockReset();
    holder.execute
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce(viewerPayer("91000000-0000-4000-8000-000000000702"));
    await expect(
      getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: [INVOICE_ID], now: NOW })
    ).resolves.toEqual({ [INVOICE_ID]: { kind: "in_progress" } });
    expect(holder.execute).toHaveBeenCalledTimes(2);
    // Un intento sin persona pagadora guardada: tampoco, y sin consultar nada más.
    holder.execute.mockReset();
    holder.execute.mockResolvedValueOnce({ rows: [{ ...row, lastFamilyPayerId: null }] });
    await expect(
      getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: [INVOICE_ID], now: NOW })
    ).resolves.toEqual({ [INVOICE_ID]: { kind: "in_progress" } });
    expect(holder.execute).toHaveBeenCalledTimes(1);

    // Sin la forma "phase4": en curso y sin leer el plazo.
    holder.execute.mockReset();
    vi.mocked(isFamilyCollectionEventsStorageAvailable).mockResolvedValue(false);
    holder.execute.mockResolvedValueOnce({ rows: [row] });
    await expect(
      getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: [INVOICE_ID], now: NOW })
    ).resolves.toEqual({ [INVOICE_ID]: { kind: "in_progress" } });
    expect(holder.execute).toHaveBeenCalledTimes(1);

    // Con una bandera apagada o fuera de la clave de prueba: ni la forma ni el plazo.
    holder.execute.mockReset();
    vi.mocked(isFamilyCollectionEventsStorageAvailable).mockClear();
    vi.mocked(isFamilyPaymentConfirmationOpen).mockReturnValue(false);
    holder.execute.mockResolvedValueOnce({ rows: [row] });
    await expect(
      getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: [INVOICE_ID], now: NOW })
    ).resolves.toEqual({ [INVOICE_ID]: { kind: "in_progress" } });
    expect(holder.execute).toHaveBeenCalledTimes(1);
    expect(isFamilyCollectionEventsStorageAvailable).not.toHaveBeenCalled();
  });

  it("familia: tarjeta revocada o interruptor apagado tras emitir la cuota → nada", async () => {
    vi.mocked(resolveFamilyPortalAccess).mockResolvedValue({
      academies: [{ organizationId: ORGANIZATION_ID, feeFamilyIds: [FAMILY_ID] }],
    } as unknown as Awaited<ReturnType<typeof resolveFamilyPortalAccess>>);
    const base = {
      invoiceStatus: "issued",
      timezone: TZ,
      collectionDayOfMonth: null,
      hasAutomaticCharge: true,
      nextDueAt: "2026-11-20T22:59:59.999Z",
      lastStatus: null,
      lastNextRetryAt: null,
      lastCompletedAt: null,
    };
    const second = "91000000-0000-4000-8000-000000000402";
    holder.execute.mockResolvedValue({
      rows: [
        { ...base, invoiceId: INVOICE_ID, preferenceMode: "automatic", preferenceRevision: 5, hasActiveAuthorization: false },
        { ...base, invoiceId: second, preferenceMode: "manual", preferenceRevision: 5, hasActiveAuthorization: true },
      ],
    });

    await expect(
      getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: [INVOICE_ID, second], now: NOW })
    ).resolves.toEqual({});
  });

  it("familia: sin las tablas de las Fases 1 o 2 no lee nada", async () => {
    vi.mocked(isFamilyPaymentMethodsStorageAvailable).mockResolvedValue(false);

    await expect(getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: [INVOICE_ID] })).resolves.toEqual({});
    expect(resolveFamilyPortalAccess).not.toHaveBeenCalled();
  });

  it("academia: con los cerrojos de R11 cerrados (Live o producción) no resuelve ni el alcance", async () => {
    vi.mocked(areFamilyCollectionLocksOpen).mockReturnValue(false);
    vi.mocked(isFamilyAutomaticCollectionOpen).mockReturnValue(false);

    await expect(getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID })).resolves.toBeNull();
    expect(resolveOwnerScope).not.toHaveBeenCalled();
    expect(holder.execute).not.toHaveBeenCalled();
  });

  describe("academia: con la bandera apagada, solo los cobros en marcha", () => {
    const row = (index: number, attemptStatus: string, extra: Record<string, unknown> = {}) => ({
      invoiceId: `91000000-0000-4000-8000-00000000050${index}`,
      invoiceReference: `CUO-2026-11-00${index}`,
      invoiceStatus: "issued",
      currency: "EUR",
      timezone: TZ,
      payerName: null,
      collectionDayOfMonth: null,
      nextDueAt: "2026-11-10T22:59:59.999Z",
      openAutomaticCents: "4500",
      attemptStatus,
      attemptAmountCents: "4500",
      failureCode: null,
      declineCode: null,
      nextRetryAt: null,
      completedAt: null,
      attemptUpdatedAt: "2026-11-17T08:00:00.000Z",
      attemptClaimedAt: "2026-11-16T08:00:00.000Z",
      resumeCount: 0,
      allocationStatus: null,
      reviewReason: null,
      hasReviewNotice: false,
      ...extra,
    });

    beforeEach(() => {
      vi.mocked(isFamilyAutomaticCollectionOpen).mockReturnValue(false);
    });

    it("enseña los intentos en marcha, con «Marcar como revisado» si procede, sin leer el plan", async () => {
      holder.execute.mockResolvedValueOnce({ rows: [{ timezone: TZ }] }).mockResolvedValueOnce({
        rows: [
          row(1, "created", { hasReviewNotice: true, reviewReason: "multiple_payments" }),
          row(2, "claimed"),
          // Por si la consulta trajera otra cosa: con la bandera apagada no sale.
          row(3, "failed", { failureCode: "card_declined", declineCode: "insufficient_funds", completedAt: "2026-11-16T08:00:00.000Z" }),
        ],
      });

      const view = await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });

      // La pantalla lo dice en el título («Cobros automáticos en curso»).
      expect(view?.inProgressOnly).toBe(true);
      expect(view?.items).toEqual([
        expect.objectContaining({
          invoiceReference: "CUO-2026-11-001",
          state: "in_progress",
          canMarkReviewed: true,
          manualPaymentBlocked: true,
        }),
        expect.objectContaining({
          invoiceReference: "CUO-2026-11-002",
          state: "in_progress",
          canMarkReviewed: false,
          manualPaymentBlocked: true,
        }),
      ]);
      expect(resolveOwnerScope).toHaveBeenCalled();
      expect(loadOrganizationPlanState).not.toHaveBeenCalled();
      expect(isPaymentRemindersTablePresent).not.toHaveBeenCalled();
      const query = dialect.sqlToQuery(holder.execute.mock.calls[1][0] as SQL);
      expect(query.sql).toMatch(/with candidates as/);
      // Sin cuotas sin intento: solo facturas con un intento en marcha.
      expect(query.sql).not.toMatch(/union\s+select c\.invoice_id/);
      // Los estados abiertos van como parámetros (FAMILY_COLLECTION_OPEN_STATUSES), con requires_action.
      expect(query.sql).toMatch(/and la\.status in \(\$\d+, \$\d+, \$\d+, \$\d+\)\s+order by/);
      expect(query.params).toEqual(expect.arrayContaining(["claimed", "created", "processing", "requires_action"]));
    });

    it("sin ningún cobro en marcha: nada (null)", async () => {
      holder.execute.mockResolvedValueOnce({ rows: [{ timezone: TZ }] }).mockResolvedValueOnce({ rows: [] });

      await expect(
        getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW })
      ).resolves.toBeNull();
    });

    it("sigue siendo solo para propiedad o administración con todas las sedes", async () => {
      vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope({ role: "manager" }));

      await expect(getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID })).resolves.toBeNull();
      expect(holder.execute).not.toHaveBeenCalled();
    });
  });

  it("academia: con la bandera encendida lee si ya salió un recordatorio (solo si existe su tabla)", async () => {
    holder.execute.mockResolvedValueOnce({ rows: [{ timezone: TZ }] }).mockResolvedValueOnce({ rows: [] });
    await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });
    const withTable = dialect.sqlToQuery(holder.execute.mock.calls[1][0] as SQL);
    expect(withTable.sql).toContain("zaltyko.payment_reminders r");
    expect(withTable.sql).toContain(`as "reminderSent"`);

    holder.execute.mockReset();
    vi.mocked(isPaymentRemindersTablePresent).mockResolvedValue(false);
    holder.execute.mockResolvedValueOnce({ rows: [{ timezone: TZ }] }).mockResolvedValueOnce({ rows: [] });
    await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });
    const withoutTable = dialect.sqlToQuery(holder.execute.mock.calls[1][0] as SQL);
    expect(withoutTable.sql).not.toContain("zaltyko.payment_reminders");
    expect(withoutTable.sql).toContain(`false as "reminderSent"`);
  });

  it("Tarea 5 — academia: lee el plazo del intento que espera a la familia y lo enseña", async () => {
    vi.mocked(isFamilyPaymentConfirmationOpen).mockReturnValue(true);
    const attemptId = "91000000-0000-4000-8000-000000000611";
    holder.execute
      .mockResolvedValueOnce({ rows: [{ timezone: TZ }] })
      .mockResolvedValueOnce({
        rows: [
          {
            invoiceId: INVOICE_ID,
            invoiceReference: "CUO-2026-11-001",
            invoiceStatus: "issued",
            currency: "EUR",
            timezone: TZ,
            payerName: null,
            collectionDayOfMonth: null,
            nextDueAt: "2026-11-15T22:59:59.999Z",
            openAutomaticCents: "4500",
            preferenceMode: "automatic",
            preferenceRevision: 5,
            hasActiveAuthorization: true,
            activeAuthorizationKind: "card",
            reminderSent: false,
            attemptId,
            attemptStatus: "requires_action",
            attemptAmountCents: "4500",
            failureCode: null,
            declineCode: null,
            nextRetryAt: null,
            completedAt: null,
            attemptUpdatedAt: "2026-11-16T08:00:00.000Z",
            attemptClaimedAt: "2026-11-16T08:00:00.000Z",
            resumeCount: 0,
            allocationStatus: null,
            reviewReason: null,
            hasReviewNotice: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ actionDeadlineAt: "2026-11-18T22:59:59.999Z" }] });

    const view = await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });

    expect(view?.items).toEqual([
      expect.objectContaining({ state: "action_required", date: "2026-11-18", canCancel: true, manualPaymentBlocked: true }),
    ]);
    const listQuery = dialect.sqlToQuery(holder.execute.mock.calls[1][0] as SQL);
    expect(listQuery.sql).toContain(`as "attemptId"`);
    const deadlineQuery = dialect.sqlToQuery(holder.execute.mock.calls[2][0] as SQL);
    expect(deadlineQuery.sql).toContain("status = 'requires_action'");
    expect(deadlineQuery.params).toEqual(expect.arrayContaining([ORGANIZATION_ID, attemptId]));

    // M1: con la confirmación cerrada (bandera de eventos, cerrojos o sin la forma
    // "phase4"), la academia lo ve en curso, como la familia, y no se lee el plazo.
    const listRows = await holder.execute.mock.results[1]!.value;
    for (const close of [
      () => vi.mocked(isFamilyPaymentConfirmationOpen).mockReturnValue(false),
      () => vi.mocked(isFamilyCollectionEventsStorageAvailable).mockResolvedValue(false),
    ]) {
      vi.mocked(isFamilyPaymentConfirmationOpen).mockReturnValue(true);
      vi.mocked(isFamilyCollectionEventsStorageAvailable).mockResolvedValue(true);
      close();
      holder.execute.mockReset();
      holder.execute.mockResolvedValueOnce({ rows: [{ timezone: TZ }] }).mockResolvedValueOnce(listRows);

      const closed = await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });

      expect(closed?.items).toEqual([
        expect.objectContaining({ state: "in_progress", date: null, canCancel: true, manualPaymentBlocked: true }),
      ]);
      expect(holder.execute).toHaveBeenCalledTimes(2);
    }
  });

  it("academia: un recordatorio ya enviado se ve como «se cobra a mano» en un reintento pendiente", async () => {
    holder.execute.mockResolvedValueOnce({ rows: [{ timezone: TZ }] }).mockResolvedValueOnce({
      rows: [
        {
          invoiceId: INVOICE_ID,
          invoiceReference: "CUO-2026-11-001",
          invoiceStatus: "issued",
          currency: "EUR",
          timezone: TZ,
          payerName: null,
          collectionDayOfMonth: null,
          nextDueAt: "2026-11-15T22:59:59.999Z",
          openAutomaticCents: "4500",
          preferenceMode: "automatic",
          preferenceRevision: 5,
          hasActiveAuthorization: true,
          activeAuthorizationKind: "card",
          reminderSent: true,
          attemptStatus: "failed",
          attemptAmountCents: "4500",
          failureCode: "card_declined",
          declineCode: "insufficient_funds",
          nextRetryAt: "2026-11-18T23:00:00.000Z",
          completedAt: "2026-11-16T08:00:00.000Z",
          resumeCount: 0,
          allocationStatus: null,
          reviewReason: null,
          hasReviewNotice: false,
        },
      ],
    });

    const view = await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });

    expect(view?.items).toEqual([
      expect.objectContaining({
        state: "manual",
        date: "2026-11-19",
        reason: "No había saldo suficiente. Ya se avisó a la familia con un recordatorio de pago. Se cobra a mano.",
      }),
    ]);
  });

  it.each([
    ["una administración con sedes elegidas", { role: "admin" as const, locationScopeMode: "selected" as const }],
    ["un mánager", { role: "manager" as const }],
  ])("academia: %s no ve la lista", async (_label, member) => {
    vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope(member));

    await expect(getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID })).resolves.toBeNull();
    expect(holder.execute).not.toHaveBeenCalled();
  });

  it("academia: sin las tablas de la Fase 3, nada", async () => {
    vi.mocked(isFamilyCollectionStorageAvailable).mockResolvedValue(false);

    await expect(getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID })).resolves.toBeNull();
    expect(holder.execute).not.toHaveBeenCalled();
  });

  it("academia: lee el mes de la zona de la academia y traduce las filas", async () => {
    holder.execute
      .mockResolvedValueOnce({ rows: [{ timezone: TZ }] })
      .mockResolvedValueOnce({
        rows: [
          {
            invoiceId: INVOICE_ID,
            invoiceReference: "CUO-2026-11-001",
            invoiceStatus: "issued",
            currency: "EUR",
            timezone: TZ,
            payerName: "Lucía Sintética",
            collectionDayOfMonth: null,
            nextDueAt: null,
            openAutomaticCents: "0",
            attemptStatus: "failed",
            attemptAmountCents: "4500",
            failureCode: "card_declined",
            declineCode: "stolen_card",
            nextRetryAt: null,
            completedAt: "2026-11-05T08:00:00.000Z",
            resumeCount: 0,
            allocationStatus: null,
            reviewReason: null,
            hasReviewNotice: false,
          },
        ],
      });

    const view = await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });

    expect(view).toEqual({
      month: "2026-11",
      truncated: false,
      items: [
        expect.objectContaining({
          state: "failed",
          amountCents: 4500,
          reason: "La tarjeta figura como perdida o robada.",
          canCancel: false,
        }),
      ],
    });
    const query = dialect.sqlToQuery(holder.execute.mock.calls[1][0] as SQL);
    expect(query.params).toContain(ORGANIZATION_ID);
    expect(query.sql).toContain("zaltyko.outbox_events");
    // Acotada: parte de las facturas candidatas de la ventana, no de todo el historial.
    expect(query.sql).toMatch(/with candidates as/);
    expect(query.sql).toMatch(/from \(select distinct invoice_id from candidates\) k/);
    expect(query.params).toContain("family_collection.needs_review");
    // D3: el resultado del aviso a la familia, por factura.
    expect(query.params).toContain("family_collection.family_failure_notice_result");
    expect(query.sql).toContain("e.payload ->> 'invoiceId' = i.id::text");
  });

  it("academia: el aviso enviado a la familia llega a la fila del primer fallo", async () => {
    holder.execute.mockResolvedValueOnce({ rows: [{ timezone: TZ }] }).mockResolvedValueOnce({
      rows: [
        {
          invoiceId: INVOICE_ID,
          invoiceReference: "CUO-2026-11-001",
          invoiceStatus: "issued",
          currency: "EUR",
          timezone: TZ,
          payerName: null,
          collectionDayOfMonth: null,
          nextDueAt: null,
          openAutomaticCents: "0",
          attemptStatus: "failed",
          attemptAmountCents: "4500",
          failureCode: "authentication_required",
          declineCode: "authentication_required",
          nextRetryAt: null,
          completedAt: "2026-11-17T08:00:00.000Z",
          resumeCount: 0,
          allocationStatus: null,
          reviewReason: null,
          hasReviewNotice: false,
          familyNoticeOutcome: "sent",
        },
      ],
    });
    const view = await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });
    expect(view?.items).toEqual([
      expect.objectContaining({
        state: "failed",
        reason: "El banco pide que la familia confirme el pago.",
        familyNotice: "sent",
      }),
    ]);
  });

  describe("Tarea 11 — academia: el mes de cada cuota", () => {
    /** Fila de la consulta con un intento fallido (siempre sale) y el periodo de su cuota. */
    const feeRow = (index: number, servicePeriodStart: string | null) => ({
      invoiceId: `91000000-0000-4000-8000-00000000070${index}`,
      invoiceReference: `MENSUAL-20270${index}-000${index}`,
      servicePeriodStart,
      invoiceStatus: "issued",
      currency: "EUR",
      timezone: TZ,
      payerName: null,
      collectionDayOfMonth: null,
      nextDueAt: null,
      openAutomaticCents: "0",
      attemptStatus: "failed",
      attemptAmountCents: "4500",
      failureCode: "card_declined",
      declineCode: "insufficient_funds",
      nextRetryAt: null,
      completedAt: "2026-11-05T08:00:00.000Z",
      resumeCount: 0,
      allocationStatus: null,
      reviewReason: null,
      hasReviewNotice: false,
    });

    it("la consulta lee el primer día del periodo más antiguo de las cuotas automáticas de la factura", async () => {
      holder.execute.mockResolvedValueOnce({ rows: [{ timezone: TZ }] }).mockResolvedValueOnce({ rows: [] });
      await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });
      const query = dialect.sqlToQuery(holder.execute.mock.calls[1][0] as SQL);
      expect(query.sql).toMatch(
        /select to_char\(min\(c\.service_period_start\), 'YYYY-MM-DD'\)\s+from zaltyko\.charges c\s+where c\.organization_id = i\.organization_id\s+and c\.invoice_id = i\.id\s+and c\.collection_mode::text = 'automatic'\s+\) as "servicePeriodStart"/
      );
    });

    it("cada cobro lleva el periodo de su cuota y la lista se ordena por mes de la cuota", async () => {
      holder.execute.mockResolvedValueOnce({ rows: [{ timezone: TZ }] }).mockResolvedValueOnce({
        rows: [feeRow(2, "2027-02-01"), feeRow(4, null), feeRow(1, "2027-01-01"), feeRow(3, "2026-12-01")],
      });

      const view = await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });

      expect(view?.month).toBe("2026-11");
      expect(view?.items.map((item) => [item.invoiceReference, item.servicePeriodStart])).toEqual([
        ["MENSUAL-202703-0003", "2026-12-01"],
        ["MENSUAL-202701-0001", "2027-01-01"],
        ["MENSUAL-202702-0002", "2027-02-01"],
        ["MENSUAL-202704-0004", null],
      ]);
      // Solo cambia el orden: el estado y el importe de cada fila siguen igual.
      for (const item of view?.items ?? []) {
        expect(item).toMatchObject({ state: "failed", amountCents: 4500 });
      }
    });

    it("la fila pura pasa el periodo tal cual (null si no lo hay)", () => {
      expect(
        ownerAutomaticCollectionItemOf(ownerRow({ servicePeriodStart: "2027-02-01" }), NOW, "2026-11")
      ).toMatchObject({ servicePeriodStart: "2027-02-01", invoiceReference: "CUO-2026-11-001", state: "scheduled" });
      expect(ownerAutomaticCollectionItemOf(ownerRow(), NOW, "2026-11")).toMatchObject({ servicePeriodStart: null });
    });

    it("sortByFeeMonth: por mes, sin periodo al final y estable dentro del mismo mes", () => {
      const item = (invoiceId: string, servicePeriodStart: string | null) =>
        ({ invoiceId, servicePeriodStart }) as OwnerAutomaticCollectionItem;
      const input = [
        item("a", "2027-01-01"),
        item("b", null),
        item("c", "2026-12-15"),
        item("d", "2027-01-01"),
        item("e", "2026-12-01"),
      ];
      expect(sortByFeeMonth(input).map((entry) => entry.invoiceId)).toEqual(["c", "e", "a", "d", "b"]);
      // No toca la lista recibida.
      expect(input.map((entry) => entry.invoiceId)).toEqual(["a", "b", "c", "d", "e"]);
    });
  });

  describe("academia: límite de la lista", () => {
    /** Fila de la consulta con un intento fallido: siempre sale en la lista. */
    const shownRow = (index: number) => ({
      invoiceId: `91000000-0000-4000-8000-${String(100000000000 + index)}`,
      invoiceReference: `CUO-2026-11-${String(index).padStart(4, "0")}`,
      invoiceStatus: "issued",
      currency: "EUR",
      timezone: TZ,
      payerName: null,
      collectionDayOfMonth: null,
      nextDueAt: null,
      openAutomaticCents: "0",
      attemptStatus: "failed",
      attemptAmountCents: "4500",
      failureCode: "card_declined",
      declineCode: "insufficient_funds",
      nextRetryAt: null,
      completedAt: "2026-11-05T08:00:00.000Z",
      resumeCount: 0,
      allocationStatus: null,
      reviewReason: null,
      hasReviewNotice: false,
    });
    /** Fila sin intento del mes anterior y fuera de su espera: no sale. */
    const pastRow = (index: number) => ({
      ...shownRow(index),
      nextDueAt: "2026-10-20T12:00:00.000Z",
      openAutomaticCents: "4500",
      attemptStatus: null,
      attemptAmountCents: null,
      failureCode: null,
      declineCode: null,
      completedAt: null,
    });
    const range = (from: number, count: number) => Array.from({ length: count }, (_, offset) => from + offset);
    const read = async (rows: unknown[]) => {
      holder.execute.mockResolvedValueOnce({ rows: [{ timezone: TZ }] }).mockResolvedValueOnce({ rows });
      const view = await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });
      const query = dialect.sqlToQuery(holder.execute.mock.calls[1][0] as SQL);
      return { view, query };
    };

    it("pide hasta 501 filas a la base", async () => {
      const { query } = await read([shownRow(1)]);
      expect(query.sql).toMatch(/limit \$\d+\s*$/);
      expect(query.params[query.params.length - 1]).toBe(501);
    });

    it("las filas que no salen no quitan sitio: se filtra antes de cortar a 100", async () => {
      // 150 cuotas ya pasadas del mes anterior delante de 100 que sí salen.
      const { view } = await read([...range(1, 150).map(pastRow), ...range(151, 100).map(shownRow)]);
      expect(view?.items).toHaveLength(100);
      expect(view?.items[0]).toMatchObject({ invoiceReference: "CUO-2026-11-0151", state: "failed" });
      expect(view?.truncated).toBe(false);
    });

    it("con más de 100 que salen, enseña 100 y avisa de que hay más", async () => {
      const { view } = await read([pastRow(1), ...range(2, 101).map(shownRow)]);
      expect(view?.items).toHaveLength(100);
      expect(view?.truncated).toBe(true);
    });

    it("si la base devuelve más de 500 filas, avisa de que hay más aunque salgan pocas", async () => {
      const { view } = await read([...range(1, 500).map(pastRow), shownRow(501)]);
      expect(view?.items).toEqual([]);
      expect(view?.truncated).toBe(true);
    });
  });

  it("interruptores: solo propiedad o administración con todas las sedes", async () => {
    vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope({ role: "admin" }, false));

    await expect(
      getOwnerFamilyCollectionSwitches({ userId: USER_ID, organizationId: ORGANIZATION_ID, familyIds: [FAMILY_ID] })
    ).resolves.toBeNull();
    expect(loadOrganizationPlanState).not.toHaveBeenCalled();
  });

  it("interruptores: con la bandera apagada no resuelve el alcance", async () => {
    vi.mocked(isFamilyAutomaticCollectionOpen).mockReturnValue(false);

    await expect(
      getOwnerFamilyCollectionSwitches({ userId: USER_ID, organizationId: ORGANIZATION_ID, familyIds: [FAMILY_ID] })
    ).resolves.toBeNull();
    expect(resolveOwnerScope).not.toHaveBeenCalled();
  });

  it("interruptores: encendido si lo pidió y sigue valiendo; apagado y por confirmar tras un cambio de plan", async () => {
    vi.mocked(loadOrganizationPlanState).mockResolvedValue({ entitlement: null, subscription: null } as never);
    vi.mocked(evaluateAutomaticCollectionPlanEligibility).mockReturnValue({
      eligible: true,
      reason: null,
      entitlementRevision: 5,
    });
    vi.mocked(loadPlanChangeRevision).mockResolvedValue(4);
    holder.selectRows = [
      { familyId: FAMILY_ID, requestedMode: "automatic", version: 2, entitlementRevision: 4 },
      { familyId: OTHER_FAMILY_ID, requestedMode: "automatic", version: 3, entitlementRevision: 3 },
    ];
    const third = "91000000-0000-4000-8000-000000000303";

    const switches = await getOwnerFamilyCollectionSwitches({
      userId: USER_ID,
      organizationId: ORGANIZATION_ID,
      familyIds: [FAMILY_ID, OTHER_FAMILY_ID, third],
    });

    expect(switches).toEqual({
      available: true,
      families: {
        [FAMILY_ID]: { automatic: true, version: 2, requiresConfirmation: false },
        [OTHER_FAMILY_ID]: { automatic: false, version: 3, requiresConfirmation: true },
        [third]: { automatic: false, version: 0, requiresConfirmation: false },
      },
    });
  });

  it("interruptores: sin plan de pago, no disponibles y apagados", async () => {
    vi.mocked(loadOrganizationPlanState).mockResolvedValue({ entitlement: null, subscription: null } as never);
    vi.mocked(evaluateAutomaticCollectionPlanEligibility).mockReturnValue({
      eligible: false,
      reason: "paid_plan_required",
    });
    holder.selectRows = [{ familyId: FAMILY_ID, requestedMode: "automatic", version: 2, entitlementRevision: 4 }];

    await expect(
      getOwnerFamilyCollectionSwitches({ userId: USER_ID, organizationId: ORGANIZATION_ID, familyIds: [FAMILY_ID] })
    ).resolves.toEqual({
      available: false,
      families: { [FAMILY_ID]: { automatic: false, version: 2, requiresConfirmation: false } },
    });
    expect(loadPlanChangeRevision).not.toHaveBeenCalled();
  });
});

describe("domiciliación sin activar (D2, «Primero solo tarjeta»): ninguna pantalla promete el cobro", () => {
  const SEPA_FLAG = "ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED";
  const SEPA_TEXT = "Por ahora la domiciliación no se cobra sola. Se cobra a mano.";

  it("bloqueo: con la bandera de la domiciliación apagada (o sin indicar), sepa_not_enabled antes que el plan", () => {
    const sepa = { ...prerequisites, activeAuthorizationKind: "sepa_debit" };
    expect(automaticCollectionBlocker(sepa)).toBe("sepa_not_enabled");
    expect(automaticCollectionBlocker({ ...sepa, sepaEnabled: false })).toBe("sepa_not_enabled");
    expect(
      automaticCollectionBlocker({ ...sepa, sepaEnabled: false, plan: { eligible: false, reason: "paid_plan_required" } })
    ).toBe("sepa_not_enabled");
    // Encendida, la domiciliación puede llegar como hoy.
    expect(automaticCollectionBlocker({ ...sepa, sepaEnabled: true })).toBeNull();
    // La tarjeta no depende de esta bandera.
    expect(automaticCollectionBlocker({ ...prerequisites, activeAuthorizationKind: "card", sepaEnabled: false })).toBeNull();
  });

  it("la familia no ve ninguna fecha de cobro; la academia ve «Se cobrará a mano» con una frase sencilla", () => {
    expect(familyAutomaticFeeStatusOf(familyInput({ blocker: "sepa_not_enabled" }), NOW)).toBeNull();
    expect(
      familyAutomaticFeeStatusOf(
        familyInput({
          blocker: "sepa_not_enabled",
          last: { status: "failed", nextRetryAt: new Date("2026-11-18T23:00:00.000Z"), completedAt: null },
        }),
        NOW
      )
    ).toBeNull();
    expect(ownerAutomaticCollectionItemOf(ownerRow({ blocker: "sepa_not_enabled" }), NOW, "2026-11")).toMatchObject({
      state: "manual",
      date: "2026-11-20",
      reason: SEPA_TEXT,
      canCancel: false,
      manualPaymentBlocked: false,
    });
    // Un intento cerrado por la puerta con ese motivo.
    expect(failureReasonText({ status: "canceled", failureCode: "sepa_not_enabled", declineCode: null })).toBe(SEPA_TEXT);
    expect(SEPA_TEXT).not.toMatch(/_/);
  });

  it("portal: la cuota de quien domicilia no promete el cobro; con la bandera encendida, sí (como hoy)", async () => {
    vi.mocked(resolveFamilyPortalAccess).mockResolvedValue({
      academies: [{ organizationId: ORGANIZATION_ID, feeFamilyIds: [FAMILY_ID] }],
    } as unknown as Awaited<ReturnType<typeof resolveFamilyPortalAccess>>);
    holder.execute.mockResolvedValue({
      rows: [
        {
          invoiceId: INVOICE_ID,
          invoiceStatus: "issued",
          timezone: TZ,
          collectionDayOfMonth: null,
          hasAutomaticCharge: true,
          nextDueAt: "2026-11-20T22:59:59.999Z",
          preferenceMode: "automatic",
          preferenceRevision: 5,
          hasActiveAuthorization: true,
          activeAuthorizationKind: "sepa_debit",
          lastStatus: null,
          lastNextRetryAt: null,
          lastCompletedAt: null,
        },
      ],
    });

    try {
      vi.stubEnv(SEPA_FLAG, "false");
      await expect(
        getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: [INVOICE_ID], now: NOW })
      ).resolves.toEqual({});
      const query = dialect.sqlToQuery(holder.execute.mock.calls[0][0] as SQL);
      expect(query.sql).toContain('as "activeAuthorizationKind"');

      vi.stubEnv(SEPA_FLAG, "true");
      await expect(
        getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: [INVOICE_ID], now: NOW })
      ).resolves.toEqual({ [INVOICE_ID]: { kind: "scheduled", date: "2026-11-20" } });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("portal: una domiciliación ya en el banco sigue diciendo «Cobro en curso» con la bandera apagada", async () => {
    vi.mocked(resolveFamilyPortalAccess).mockResolvedValue({
      academies: [{ organizationId: ORGANIZATION_ID, feeFamilyIds: [FAMILY_ID] }],
    } as unknown as Awaited<ReturnType<typeof resolveFamilyPortalAccess>>);
    holder.execute.mockResolvedValue({
      rows: [
        {
          invoiceId: INVOICE_ID,
          invoiceStatus: "issued",
          timezone: TZ,
          collectionDayOfMonth: null,
          hasAutomaticCharge: true,
          nextDueAt: "2026-11-20T22:59:59.999Z",
          preferenceMode: "automatic",
          preferenceRevision: 5,
          hasActiveAuthorization: true,
          activeAuthorizationKind: "sepa_debit",
          lastStatus: "processing",
          lastNextRetryAt: null,
          lastCompletedAt: null,
        },
      ],
    });

    await expect(
      getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: [INVOICE_ID], now: NOW })
    ).resolves.toEqual({ [INVOICE_ID]: { kind: "in_progress" } });
  });
});

describe("portal: qué familias se cobran solas (tarjeta «Pago automático»)", () => {
  const access = (familyIds: string[]) =>
    ({
      academies: [{ organizationId: ORGANIZATION_ID, feeFamilyIds: familyIds }],
    }) as unknown as Awaited<ReturnType<typeof resolveFamilyPortalAccess>>;

  it("con la bandera apagada (o los cerrojos cerrados): cerrado, sin leer nada", async () => {
    vi.mocked(isFamilyAutomaticCollectionOpen).mockReturnValue(false);

    await expect(getFamilyAutomaticCollectionModes({ userId: USER_ID, now: NOW })).resolves.toEqual({
      open: false,
      automaticFamilies: {},
    });
    expect(resolveFamilyPortalAccess).not.toHaveBeenCalled();
    expect(loadOrganizationPlanState).not.toHaveBeenCalled();
  });

  it("sin las tablas: cerrado", async () => {
    vi.mocked(isFamilyCollectionStorageAvailable).mockResolvedValue(false);

    await expect(getFamilyAutomaticCollectionModes({ userId: USER_ID, now: NOW })).resolves.toEqual({
      open: false,
      automaticFamilies: {},
    });
    expect(resolveFamilyPortalAccess).not.toHaveBeenCalled();
  });

  it("abierto: solo las familias con la preferencia automática vigente; a mano o tras un cambio de plan, no", async () => {
    vi.mocked(resolveFamilyPortalAccess).mockResolvedValue(access([FAMILY_ID, OTHER_FAMILY_ID]));
    vi.mocked(loadPlanChangeRevision).mockResolvedValue(4);
    holder.selectRows = [
      { familyId: FAMILY_ID, requestedMode: "automatic", entitlementRevision: 4 },
      // Guardada antes del cambio real de plan: hay que volver a confirmarla.
      { familyId: OTHER_FAMILY_ID, requestedMode: "automatic", entitlementRevision: 3 },
    ];

    await expect(getFamilyAutomaticCollectionModes({ userId: USER_ID, now: NOW })).resolves.toEqual({
      open: true,
      automaticFamilies: { [ORGANIZATION_ID]: [FAMILY_ID] },
    });
    expect(resolveFamilyPortalAccess).toHaveBeenCalledWith({ userId: USER_ID, now: NOW });
  });

  it("abierto con la familia a mano: abierto, pero ninguna familia en automático", async () => {
    vi.mocked(resolveFamilyPortalAccess).mockResolvedValue(access([FAMILY_ID]));
    holder.selectRows = [{ familyId: FAMILY_ID, requestedMode: "manual", entitlementRevision: 5 }];

    await expect(getFamilyAutomaticCollectionModes({ userId: USER_ID, now: NOW })).resolves.toEqual({
      open: true,
      automaticFamilies: {},
    });
  });

  it("abierto sin plan de pago: ninguna familia en automático y sin leer las preferencias", async () => {
    vi.mocked(resolveFamilyPortalAccess).mockResolvedValue(access([FAMILY_ID]));
    vi.mocked(evaluateAutomaticCollectionPlanEligibility).mockReturnValue({
      eligible: false,
      reason: "paid_plan_required",
    });
    holder.selectRows = [{ familyId: FAMILY_ID, requestedMode: "automatic", entitlementRevision: 5 }];

    await expect(getFamilyAutomaticCollectionModes({ userId: USER_ID, now: NOW })).resolves.toEqual({
      open: true,
      automaticFamilies: {},
    });
    expect(loadPlanChangeRevision).not.toHaveBeenCalled();
  });

  it("una fila de una familia que la cuenta no ve nunca cuenta", async () => {
    vi.mocked(resolveFamilyPortalAccess).mockResolvedValue(access([FAMILY_ID]));
    holder.selectRows = [{ familyId: OTHER_FAMILY_ID, requestedMode: "automatic", entitlementRevision: 5 }];

    await expect(getFamilyAutomaticCollectionModes({ userId: USER_ID, now: NOW })).resolves.toEqual({
      open: true,
      automaticFamilies: {},
    });
  });
});

describe("cuota devuelta desde el panel de Stripe (Fase 4, Tarea 6)", () => {
  it("D1: sigue cobrada y se marca «Devuelta: {importe} el {fecha} (desde tu panel de Stripe)», con el día de la sede", () => {
    const item = ownerAutomaticCollectionItemOf(
      ownerRow({
        attempt: attempt({
          refundedCents: 3500,
          // 00:30 del 7-12 en Madrid.
          lastRefundedAt: new Date("2026-12-06T23:30:00.000Z"),
        }),
      }),
      NOW,
      "2026-11"
    );
    expect(item).toMatchObject({ state: "collected", needsReview: false, canCancel: false, canMarkReviewed: false });
    expect(item?.refundText).toBe(
      `Devuelta: ${formatMoney(3500, "EUR")} el ${formatCalendarDate("2026-12-07")} (desde tu panel de Stripe)`
    );
    expect(item?.refundText).toBe(ownerRefundText({ amountCents: 3500, currency: "EUR", date: "2026-12-07" }));
    expect(item?.refundNotice).toBeUndefined();
  });

  it("sin devoluciones no hay marca, y un intento que no está cobrado nunca sale «Devuelta»", () => {
    const collected = ownerAutomaticCollectionItemOf(ownerRow({ attempt: attempt() }), NOW, "2026-11");
    expect(collected).not.toHaveProperty("refundText");
    expect(collected).not.toHaveProperty("refundNotice");
    const failed = ownerAutomaticCollectionItemOf(
      ownerRow({
        attempt: attempt({
          status: "failed",
          failureCode: "card_declined",
          completedAt: new Date("2026-11-10T08:00:00.000Z"),
          allocationStatus: null,
          refundedCents: 3500,
          lastRefundedAt: new Date("2026-11-12T08:00:00.000Z"),
          refundIssue: { reason: "refund_unallocated", amountCents: 3500 },
        }),
      }),
      NOW,
      "2026-11"
    );
    expect(failed).not.toHaveProperty("refundText");
    expect(failed).not.toHaveProperty("refundNotice");
  });

  it("devolución que no se pudo anotar o que Stripe anuló: aviso con su importe", () => {
    const item = ownerAutomaticCollectionItemOf(
      ownerRow({ attempt: attempt({ refundIssue: { reason: "refund_unallocated", amountCents: 3500 } }) }),
      NOW,
      "2026-11"
    );
    expect(item?.refundNotice).toBe(
      `Stripe devolvió ${formatMoney(3500, "EUR")} de un cobro que Zaltyko no pudo repartir entre cuotas; revísalo`
    );
    expect(refundNoticeText({ reason: "refund_reversed", amountCents: 1000, currency: "EUR" })).toBe(
      `Stripe anuló una devolución de ${formatMoney(1000, "EUR")} que Zaltyko ya tenía anotada; revísalo en tu panel de Stripe`
    );
    expect(refundNoticeText({ reason: "refunded", amountCents: 1000, currency: "EUR" })).toBeNull();
    expect(ownerRefundText({ amountCents: 1000, currency: "EUR", date: null })).toBe(
      `Devuelta: ${formatMoney(1000, "EUR")} (desde tu panel de Stripe)`
    );
  });
});

describe("disputas y devoluciones del banco en el panel de la academia (Fase 4, Tarea 7)", () => {
  const dispute = (overrides: Partial<NonNullable<OwnerCollectionRow["dispute"]>> = {}) => ({
    status: "needs_response",
    amountCents: 4500,
    // 23:59:59 del 24-12 en Madrid.
    evidenceDueAt: new Date("2026-12-24T22:59:59.000Z"),
    reversed: false,
    paymentMethodKind: "card" as const,
    ...overrides,
  });

  it("D4: abierta → la cuota sigue cobrada y la academia ve el plazo con el día de la sede", () => {
    const item = ownerAutomaticCollectionItemOf(ownerRow({ attempt: attempt(), dispute: dispute() }), NOW, "2026-11");
    expect(item).toMatchObject({ state: "collected", needsReview: false, disputeState: "open" });
    expect(item?.disputeText).toBe(
      `En disputa: responde desde tu panel de Stripe antes del ${formatCalendarDate("2026-12-24")}`
    );
    // Una disputa no es una devolución de la academia: no sale «Devuelta».
    expect(item).not.toHaveProperty("refundText");
  });

  it("estados: ganada, perdida (D3), devuelta por el banco (D2), sin anotar y ganada después de perderla", () => {
    const amount = formatMoney(4500, "EUR");
    const cases: Array<[Partial<NonNullable<OwnerCollectionRow["dispute"]>>, string, string, boolean]> = [
      [{ status: "won", evidenceDueAt: null }, "won", "Disputa ganada", false],
      [{ status: "warning_closed" }, "won", "Disputa ganada", false],
      [{ status: "lost", reversed: true }, "lost", `Disputa perdida. El banco devolvió el dinero a la familia (${amount})`, false],
      [
        { status: "lost", reversed: true, paymentMethodKind: "sepa_debit" },
        "returned",
        `El banco devolvió el dinero a la familia (${amount}). Se ha creado una cuota pendiente por el importe devuelto`,
        false,
      ],
      [
        { status: "needs_response", reversed: true, paymentMethodKind: "sepa_debit" },
        "returned",
        `El banco devolvió el dinero a la familia (${amount}). Se ha creado una cuota pendiente por el importe devuelto`,
        false,
      ],
      [
        { status: "lost", reversed: false },
        "unallocated",
        `Hay una disputa de ${amount} que Zaltyko no pudo anotar en las cuotas; revísala en tu panel de Stripe`,
        true,
      ],
      [
        { status: "won", reversed: true },
        "reinstated",
        `Disputa ganada después de anotarla como perdida (${amount}); revísalo en tu panel de Stripe`,
        true,
      ],
    ];
    for (const [overrides, state, text, review] of cases) {
      const row = dispute(overrides);
      expect(ownerDisputeStateOf(row), JSON.stringify(overrides)).toBe(state);
      const item = ownerAutomaticCollectionItemOf(ownerRow({ attempt: attempt(), dispute: row }), NOW, "2026-11");
      expect(item?.disputeText, JSON.stringify(overrides)).toBe(text);
      expect(item?.needsReview, JSON.stringify(overrides)).toBe(review);
    }
    expect(ownerDisputeText({ state: "open", amountCents: 4500, currency: "EUR", date: null })).toBe(
      "En disputa: responde desde tu panel de Stripe"
    );
  });

  it("Tarea M (punto 8): domiciliación devuelta y después ganada → recuerda anular la cuota nueva (nunca se anula sola)", () => {
    const amount = formatMoney(4500, "EUR");
    const base = `El banco reintegró el dinero que había devuelto (${amount}). Anula la cuota pendiente que se creó si ya no se debe`;
    const cases: Array<[boolean | null | undefined, string]> = [
      [true, `${base}: todavía no tiene ningún pago`],
      [false, `${base}; ya tiene algún pago, revísalo antes`],
      [null, base],
      [undefined, base],
    ];
    for (const [returnedInvoiceUnpaid, text] of cases) {
      const row = dispute({ status: "won", reversed: true, paymentMethodKind: "sepa_debit", returnedInvoiceUnpaid });
      expect(ownerDisputeStateOf(row)).toBe("reinstated");
      const item = ownerAutomaticCollectionItemOf(ownerRow({ attempt: attempt(), dispute: row }), NOW, "2026-11");
      expect(item?.disputeText, String(returnedInvoiceUnpaid)).toBe(text);
      // La academia lo revisa: sigue marcada para revisar.
      expect(item?.needsReview).toBe(true);
      expect(text).not.toMatch(/_|dispute|chargeback|webhook|intent/i);
    }
    // Tarjeta: el texto de siempre (D3: no hay cuota nueva).
    expect(
      ownerDisputeText({
        state: "reinstated",
        amountCents: 4500,
        currency: "EUR",
        date: null,
        paymentMethodKind: "card",
        returnedInvoiceUnpaid: true,
      })
    ).toBe(`Disputa ganada después de anotarla como perdida (${amount}); revísalo en tu panel de Stripe`);
  });

  it("ola final (B4): si la academia ya anuló la cuota nueva, el aviso de anularla desaparece y no queda para revisar", () => {
    const amount = formatMoney(4500, "EUR");
    const row = dispute({
      status: "won",
      reversed: true,
      paymentMethodKind: "sepa_debit",
      returnedInvoiceUnpaid: null,
      returnedInvoiceVoid: true,
    });
    expect(ownerDisputeStateOf(row)).toBe("reinstated");
    const item = ownerAutomaticCollectionItemOf(ownerRow({ attempt: attempt(), dispute: row }), NOW, "2026-11");
    expect(item?.disputeText).toBe(`El banco reintegró el dinero que había devuelto (${amount})`);
    expect(item?.disputeText).not.toMatch(/Anula/);
    expect(item?.needsReview).toBe(false);
    // Tarjeta: el texto de siempre, aunque llegara la marca.
    expect(
      ownerDisputeText({
        state: "reinstated",
        amountCents: 4500,
        currency: "EUR",
        date: null,
        paymentMethodKind: "card",
        returnedInvoiceVoid: true,
      })
    ).toBe(`Disputa ganada después de anotarla como perdida (${amount}); revísalo en tu panel de Stripe`);
  });

  it("Tarea M (punto 8): la consulta lee si la cuota nueva de la disputa tiene algún pago", async () => {
    holder.execute.mockResolvedValueOnce({ rows: [{ timezone: TZ }] }).mockResolvedValueOnce({ rows: [] });

    await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });

    const query = dialect.sqlToQuery(holder.execute.mock.calls[1][0] as SQL);
    expect(query.sql).toContain("'returnedInvoiceUnpaid'");
    expect(query.params).toEqual(expect.arrayContaining(["family-collection-return:"]));
    // Ola final (B4): y si la academia ya la anuló (factura void), sin pedir que la anule.
    expect(query.sql).toContain("'returnedInvoiceVoid'");
    expect(query.sql).toContain("when ri.status::text = 'void' then null");
  });

  it("sin disputa no hay marca; los textos no llevan jerga de Stripe", () => {
    const item = ownerAutomaticCollectionItemOf(ownerRow({ attempt: attempt() }), NOW, "2026-11");
    expect(item).not.toHaveProperty("disputeState");
    expect(item).not.toHaveProperty("disputeText");
    for (const state of ["open", "won", "lost", "returned", "unallocated", "reinstated"] as const) {
      const text = ownerDisputeText({ state, amountCents: 4500, currency: "EUR", date: "2026-12-24" });
      expect(text, state).not.toMatch(/_|dispute|chargeback|webhook|intent/i);
    }
  });

  it("la lista incluye las cuotas con una disputa abierta o que cambió este mes, y lee la última disputa", async () => {
    holder.execute.mockResolvedValueOnce({ rows: [{ timezone: TZ }] }).mockResolvedValueOnce({ rows: [] });

    await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });

    const query = dialect.sqlToQuery(holder.execute.mock.calls[1][0] as SQL);
    expect(query.sql).toContain("from zaltyko.family_collection_disputes d");
    expect(query.sql).toMatch(/union\s+select da\.invoice_id/);
    expect(query.sql).toContain(`as "dispute"`);
    // «Devuelta» no cuenta las filas de una disputa.
    expect(query.params).toEqual(expect.arrayContaining(["dispute_lost", "sepa_returned"]));

    // Sin la forma "phase4" no se nombra la tabla de disputas.
    holder.execute.mockReset();
    vi.mocked(isFamilyCollectionEventsStorageAvailable).mockResolvedValue(false);
    holder.execute.mockResolvedValueOnce({ rows: [{ timezone: TZ }] }).mockResolvedValueOnce({ rows: [] });
    await getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID, now: NOW });
    const withoutTable = dialect.sqlToQuery(holder.execute.mock.calls[1][0] as SQL);
    expect(withoutTable.sql).not.toContain("family_collection_disputes");
  });
});
