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
  isFamilyAutomaticCollectionOpen: vi.fn(),
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

import { isFamilyAutomaticCollectionOpen } from "@/modules/billing/application/charge-collection-mode";
import { loadOrganizationPlanState, loadPlanChangeRevision } from "@/modules/billing/application/plan-state";
import { evaluateAutomaticCollectionPlanEligibility } from "@/modules/billing/domain/plan-eligibility";
import {
  automaticCollectionBlocker,
  failureReasonText,
  familyAutomaticFeeStatusOf,
  getFamilyAutomaticFeeStatuses,
  getOwnerAutomaticCollections,
  getOwnerFamilyCollectionSwitches,
  ownerAutomaticCollectionItemOf,
  reviewReasonText,
  type OwnerCollectionRow,
} from "@/modules/family-collection/application/family-collection-reads";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";
import { familyAutomaticFeeText } from "@/modules/family-portal/domain/family-portal-presentation";
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
  vi.mocked(isFamilyAutomaticCollectionOpen).mockReturnValue(true);
  vi.mocked(isFamilyCollectionStorageAvailable).mockResolvedValue(true);
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
    expect(failureReasonText({ failureCode: "paid_plan_required", declineCode: null })).toBe(
      "Tu plan no incluye el cobro automático de cuotas."
    );
    expect(failureReasonText({ failureCode: "account_stale", declineCode: null })).toBe(
      "No pudimos comprobar tu cuenta de Stripe a tiempo."
    );
    expect(reviewReasonText("motivo_nuevo")).toBe("El cobro necesita una comprobación. Compruébalo en Stripe.");
    expect(failureReasonText({ failureCode: "collection_window_expired", declineCode: null })).toBe(
      "No se pudo intentar el cobro a tiempo. Se cobra a mano."
    );
  });

  it("un cierre canceled enseña su propio motivo, no el del rechazo anterior", () => {
    for (const [code, text] of [
      ["canceled_by_academy", "Lo canceló la academia."],
      ["manual_payment", "Se registró un pago a mano."],
      ["reviewed_by_academy", "La academia lo revisó y lo cerró."],
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

  it("en curso más de 15 días desde que se reclamó y sin aviso: se puede marcar como revisado, con su motivo", () => {
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
    // 16 días.
    expect(processing("2026-11-01T09:00:00.000Z")).toMatchObject({
      state: "processing",
      needsReview: true,
      canMarkReviewed: true,
      canCancel: false,
      reason: "El cobro lleva más de 15 días en curso y no podemos ver su resultado. Compruébalo en Stripe.",
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
  it("familia: con la bandera apagada no lee nada", async () => {
    vi.mocked(isFamilyAutomaticCollectionOpen).mockReturnValue(false);

    await expect(getFamilyAutomaticFeeStatuses({ userId: USER_ID, invoiceIds: [INVOICE_ID] })).resolves.toEqual({});
    expect(isFamilyCollectionStorageAvailable).not.toHaveBeenCalled();
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

  it("academia: con la bandera apagada no resuelve ni el alcance", async () => {
    vi.mocked(isFamilyAutomaticCollectionOpen).mockReturnValue(false);

    await expect(getOwnerAutomaticCollections({ userId: USER_ID, organizationId: ORGANIZATION_ID })).resolves.toBeNull();
    expect(resolveOwnerScope).not.toHaveBeenCalled();
    expect(holder.execute).not.toHaveBeenCalled();
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
