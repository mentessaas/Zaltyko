import {
  evaluateCollectionEligibility,
  type CollectionEligibilityInput,
  type CollectionEligibilityReason,
} from "@/modules/billing/domain/collection-eligibility";

/**
 * Cobro automático de cuotas (Fase 3): puerta completa antes de cobrar una
 * factura. Función pura: no lee variables de entorno ni toca la base; quien
 * llama le pasa todo ya cargado y recién releído en el servidor.
 *
 * Orden (el primer motivo que falla es el que se devuelve):
 * 1. Bandera, entorno, cerrojos de Live y producción, almacenamiento.
 *    Después, un recordatorio de pago ya enviado (`reminder_sent`, final) y
 *    la domiciliación sin activar (`sepa_not_enabled`, final).
 * 2. Cuenta conectada releída hace poco (si hay cuenta): con datos viejos de la
 *    cuenta nunca se decide un motivo final.
 * 3. Moneda de la factura (solo EUR).
 * 4. La puerta existente (`evaluateCollectionEligibility`) para CADA cuota del
 *    reparto, y cada cuota con el pagador de la factura.
 * 5. Pagador vigente hoy, método de pago completo y domiciliación activa en la
 *    cuenta.
 *
 * Cada motivo es `transient` (no se escribe nada; se vuelve a mirar mañana) o
 * `final` (se escribe un intento `canceled` con el motivo y la cuota vuelve a
 * manual con recordatorios).
 */

export type FamilyCollectionGateReason =
  | "flag_off"
  | "environment_unknown"
  | "live_not_released"
  | "storage_missing"
  | "reminder_sent"
  | "sepa_not_enabled"
  | "unsupported_currency"
  | CollectionEligibilityReason
  | "charge_payer_mismatch"
  | "payer_missing"
  | "payer_not_current"
  | "payment_method_unknown"
  | "sepa_not_active"
  | "account_stale";

export type FamilyCollectionGateClassification = "transient" | "final";

/**
 * Clase de cada motivo. Son pasajeros la bandera, el entorno, los cerrojos,
 * el almacenamiento, la cuenta sin releer y los del plan de la academia (un
 * pago de la suscripción que llega tarde no debe pasar las cuotas a manual).
 * `automation_not_released` es la misma bandera vista por la puerta existente.
 * El resto es final.
 */
export const GATE_REASON_CLASSIFICATION: Readonly<
  Record<FamilyCollectionGateReason, FamilyCollectionGateClassification>
> = {
  flag_off: "transient",
  environment_unknown: "transient",
  live_not_released: "transient",
  storage_missing: "transient",
  account_stale: "transient",
  automation_not_released: "transient",
  // Plan de la academia (plan-eligibility.ts).
  entitlement_missing: "transient",
  paid_plan_required: "transient",
  entitlement_not_effective: "transient",
  subscription_missing: "transient",
  subscription_mismatch: "transient",
  subscription_not_active: "transient",
  subscription_period_not_current: "transient",
  // Finales.
  reminder_sent: "final",
  sepa_not_enabled: "final",
  unsupported_currency: "final",
  organization_not_active: "final",
  preference_manual: "final",
  preference_entitlement_stale: "final",
  charge_scope_mismatch: "final",
  charge_manual: "final",
  provider_scope_mismatch: "final",
  provider_environment_mismatch: "final",
  provider_api_generation_unsupported: "final",
  provider_charge_model_unsupported: "final",
  provider_not_ready: "final",
  authorization_missing: "final",
  authorization_scope_mismatch: "final",
  authorization_provider_mismatch: "final",
  authorization_inactive: "final",
  authorization_expired: "final",
  consent_incomplete: "final",
  charge_payer_mismatch: "final",
  payer_missing: "final",
  payer_not_current: "final",
  payment_method_unknown: "final",
  sepa_not_active: "final",
};

export function classifyGateReason(
  reason: FamilyCollectionGateReason
): FamilyCollectionGateClassification {
  return GATE_REASON_CLASSIFICATION[reason];
}

/**
 * Motivo final de una factura con un recordatorio de pago ya enviado para
 * alguna de sus cuotas abiertas: la familia pudo pagar por fuera, así que
 * nunca se cobra sola (ni el primer intento ni un reintento) y la cuota se
 * cobra a mano.
 */
export const REMINDER_SENT_REASON = "reminder_sent" satisfies FamilyCollectionGateReason;

/**
 * Motivo final de una factura cuyo pagador paga por domiciliación mientras la
 * domiciliación no se cobra sola (ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED
 * apagada, decisión de Elvis del 17-11-2026: «Primero solo tarjeta»). Nunca se
 * crea un cobro por domiciliación: la cuota se cobra a mano, con recordatorios.
 */
export const SEPA_NOT_ENABLED_REASON = "sepa_not_enabled" satisfies FamilyCollectionGateReason;

/** Única moneda que se cobra sola: el libro guarda `EUR` y Stripe recibe `eur`. */
export const SUPPORTED_COLLECTION_CURRENCY = "EUR";

/** La cuenta conectada debe haberse releído en Stripe en la última hora. */
export const ACCOUNT_FRESHNESS_MS = 60 * 60 * 1000;

export type CollectionPaymentMethodKind = "card" | "sepa_debit";

export interface FamilyCollectionGateCharge {
  id: string;
  organizationId: string;
  familyId: string;
  familyPayerId: string | null;
  collectionMode: "manual" | "automatic";
}

export type FamilyCollectionGateAccount = NonNullable<
  CollectionEligibilityInput["providerAccount"]
> & {
  sepaDebitPaymentsCapabilityStatus: string;
  lastSyncedAt: Date | string | null;
};

export type FamilyCollectionGateAuthorization = NonNullable<
  CollectionEligibilityInput["authorization"]
> & {
  /** `card` o `sepa_debit`; null en filas anteriores a la Fase 2. */
  paymentMethodKind: string | null;
  paymentMethodReference: string;
  mandateReference: string | null;
};

export interface FamilyCollectionGatePayer {
  id: string;
  organizationId: string;
  familyId: string;
  /** `family_payers.starts_on` / `ends_on` (YYYY-MM-DD, ambos incluidos). */
  startsOn: string;
  endsOn: string | null;
  /** `guardians.is_active`. */
  guardianActive: boolean;
  /** `family_guardians.is_active` del tutor en la familia. */
  guardianLinkActive: boolean;
}

export interface FamilyCollectionGateInput {
  flagEnabled: boolean;
  environment: "test" | "live" | null;
  /** La base de este despliegue es la Supabase de producción. */
  productionDatabase: boolean;
  /** Las tablas de la Fase 3 (y de las fases 1 y 2) existen. */
  storageAvailable: boolean;
  /**
   * Ya se envió (o se está enviando) un recordatorio de pago de alguna cuota
   * abierta de la factura (readReminderSent en family-collection-store.ts).
   */
  reminderSent: boolean;
  /**
   * La domiciliación se cobra sola (ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED).
   * Apagada, una autorización por domiciliación nunca deja cobrar.
   */
  sepaEnabled: boolean;
  organization: CollectionEligibilityInput["organization"];
  entitlement: CollectionEligibilityInput["entitlement"];
  subscription: CollectionEligibilityInput["subscription"];
  preference: CollectionEligibilityInput["preference"];
  /**
   * Revisión del último cambio real del plan (loadPlanChangeRevision): una
   * renovación del mismo plan no invalida la preferencia automática. Con
   * `null` se exige la revisión vigente exacta.
   */
  planChangeRevision: number | null;
  invoice: {
    organizationId: string;
    familyId: string;
    familyPayerId: string | null;
    /** `invoices.currency` (ISO en mayúsculas). */
    currency: string;
  };
  /** Las cuotas del reparto que se va a cobrar (`planInvoiceCollection`). */
  charges: readonly FamilyCollectionGateCharge[];
  providerAccount: FamilyCollectionGateAccount | null;
  /** Autorización activa del pagador de la factura en la cuenta de la academia. */
  authorization: FamilyCollectionGateAuthorization | null;
  /** Customer de Stripe de esa autorización (`cus_…`), si hay exactamente uno. */
  customerReference: string | null;
  payer: FamilyCollectionGatePayer | null;
  /** Hoy en la zona de la sede (YYYY-MM-DD). */
  todayLocal: string;
  now: Date;
}

export type FamilyCollectionGateResult =
  | { allowed: true; paymentMethodKind: CollectionPaymentMethodKind }
  | {
      allowed: false;
      reason: FamilyCollectionGateReason;
      classification: FamilyCollectionGateClassification;
    };

function deny(reason: FamilyCollectionGateReason): FamilyCollectionGateResult {
  return { allowed: false, reason, classification: classifyGateReason(reason) };
}

function isBlank(value: string | null | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isPaymentMethodKind(value: string | null): value is CollectionPaymentMethodKind {
  return value === "card" || value === "sepa_debit";
}

function isAccountFresh(lastSyncedAt: Date | string | null, now: Date): boolean {
  if (lastSyncedAt === null) return false;
  const time = (lastSyncedAt instanceof Date ? lastSyncedAt : new Date(lastSyncedAt)).getTime();
  if (!Number.isFinite(time)) return false;
  return now.getTime() - time <= ACCOUNT_FRESHNESS_MS;
}

export function evaluateFamilyCollectionGate(
  input: FamilyCollectionGateInput
): FamilyCollectionGateResult {
  if (input.charges.length === 0) {
    throw new RangeError("La puerta del cobro necesita al menos una cuota del reparto.");
  }

  // 1. Bandera, entorno y cerrojos (R11): solo clave de test y nunca con la
  // base de producción, aunque la bandera esté encendida.
  if (!input.flagEnabled) return deny("flag_off");
  if (input.environment === null) return deny("environment_unknown");
  if (input.environment !== "test" || input.productionDatabase) {
    return deny("live_not_released");
  }
  if (!input.storageAvailable) return deny("storage_missing");

  // Recordatorio de pago ya enviado: con el cobro abierto los recordatorios
  // esperan a que pase la espera, así que si salió uno la familia pudo pagar
  // por fuera (p. ej. con la bandera apagada, que no retiene un reintento
  // pendiente). Nunca se cobra solo: final, sin depender de la cuenta ni del
  // plan. Va después de la bandera: con ella apagada no se escribe nada.
  if (input.reminderSent) return deny(REMINDER_SENT_REASON);

  // Domiciliación sin activar: el pagador paga por domiciliación y la
  // domiciliación todavía no se cobra sola. Nunca se crea un cobro por
  // domiciliación; final, para que la cuota pase a manual con recordatorios
  // (no se queda esperando un cobro que no va a llegar). Solo mira el tipo de
  // la autorización: nunca deja pasar nada, así que no depende de la cuenta ni
  // del plan, y un motivo pasajero no la retrasa.
  if (!input.sepaEnabled && input.authorization?.paymentMethodKind === "sepa_debit") {
    return deny(SEPA_NOT_ENABLED_REASON);
  }

  // 2. Cuenta sin releer: pasajero, antes de cualquier motivo que dependa de
  // sus datos (capacidades, estado), para que una foto vieja de la cuenta
  // nunca cancele una cuota. Sin cuenta, la puerta existente da
  // `provider_not_ready`.
  if (input.providerAccount !== null && !isAccountFresh(input.providerAccount.lastSyncedAt, input.now)) {
    return deny("account_stale");
  }

  // 3. Solo se cobra en euros. Otra moneda es final: la cuota vuelve a manual.
  if (input.invoice.currency !== SUPPORTED_COLLECTION_CURRENCY) {
    return deny("unsupported_currency");
  }

  // 4. La puerta existente para cada cuota del reparto. Cada cuota debe tener
  // el pagador de la factura: la autorización es la de ese pagador.
  if (
    input.invoice.organizationId !== input.organization.id ||
    input.invoice.familyId !== input.preference.familyId
  ) {
    return deny("charge_scope_mismatch");
  }
  for (const charge of input.charges) {
    if (charge.familyPayerId !== input.invoice.familyPayerId) {
      return deny("charge_payer_mismatch");
    }
    const eligibility = evaluateCollectionEligibility({
      organization: input.organization,
      entitlement: input.entitlement,
      subscription: input.subscription,
      preference: input.preference,
      planChangeRevision: input.planChangeRevision,
      charge: {
        organizationId: charge.organizationId,
        familyId: charge.familyId,
        familyPayerId: input.invoice.familyPayerId,
        collectionMode: charge.collectionMode,
      },
      // Los cerrojos de arriba solo dejan pasar el entorno de test.
      processorEnvironment: "test",
      providerAccount: input.providerAccount,
      authorization: input.authorization,
      runtimeEnabled: input.flagEnabled,
      now: input.now,
    });
    if (!eligibility.eligible) return deny(eligibility.reason);
  }

  // 5. Pagador vigente hoy: fila de family_payers abierta, tutor y vínculo activos.
  const payer = input.payer;
  if (
    payer === null ||
    input.invoice.familyPayerId === null ||
    payer.id !== input.invoice.familyPayerId ||
    payer.organizationId !== input.organization.id ||
    payer.familyId !== input.invoice.familyId
  ) {
    return deny("payer_missing");
  }
  if (
    payer.startsOn > input.todayLocal ||
    (payer.endsOn !== null && payer.endsOn < input.todayLocal) ||
    !payer.guardianActive ||
    !payer.guardianLinkActive
  ) {
    return deny("payer_not_current");
  }

  // Método de pago completo: tipo conocido, método, Customer y, en
  // domiciliación, la orden (mandato).
  const authorization = input.authorization;
  const account = input.providerAccount;
  if (authorization === null || account === null) {
    // Inalcanzable: la puerta existente ya lo exige.
    return deny(authorization === null ? "authorization_missing" : "provider_not_ready");
  }
  const kind = authorization.paymentMethodKind;
  if (
    !isPaymentMethodKind(kind) ||
    isBlank(authorization.paymentMethodReference) ||
    isBlank(input.customerReference) ||
    (kind === "sepa_debit" && isBlank(authorization.mandateReference))
  ) {
    return deny("payment_method_unknown");
  }
  if (kind === "sepa_debit" && account.sepaDebitPaymentsCapabilityStatus !== "active") {
    return deny("sepa_not_active");
  }

  return { allowed: true, paymentMethodKind: kind };
}
