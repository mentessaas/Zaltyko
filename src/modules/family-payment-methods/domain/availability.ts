import {
  evaluateAutomaticCollectionPlanEligibility,
  type EntitlementSnapshot,
  type SaasSubscriptionProjection,
} from "@/modules/billing/domain/plan-eligibility";

import type { PaymentMethodKind } from "./consent";

/**
 * Pago automático de cuotas (cobro automático, Fase 2): ¿puede esta persona
 * de esta familia guardar una tarjeta o domiciliar el pago ahora, y con qué
 * métodos? Función pura: no lee variables de entorno ni toca la base; quien
 * llama le pasa todo ya cargado.
 *
 * Los motivos se comprueban en este orden de prioridad; el primero que falla
 * es el que se devuelve.
 */
export type FamilyPaymentUnavailableReason =
  | "flag_off"
  | "environment_unknown"
  | "live_not_released"
  | "storage_missing"
  | "not_payer"
  | "account_not_ready"
  | "paid_plan_required";

export type FamilyPaymentMethodAvailability =
  | { available: true; kinds: PaymentMethodKind[] }
  | { available: false; reason: FamilyPaymentUnavailableReason };

/**
 * Misma forma que OrganizationPlanState (billing/application/plan-state.ts),
 * declarada aquí para que el dominio no dependa de la capa de aplicación.
 */
export interface FamilyPaymentPlanState {
  entitlement: EntitlementSnapshot | null;
  subscription: SaasSubscriptionProjection | null;
}

/** Fila de organization_payment_provider_accounts del entorno, ya cargada. */
export interface FamilyPaymentConnectedAccount {
  status: string;
  cardPaymentsCapabilityStatus: string;
  sepaDebitPaymentsCapabilityStatus: string;
}

/** La academia puede recibir tarjetas: cuenta activa y capacidad de tarjeta activa. */
function isAccountReady(account: FamilyPaymentConnectedAccount | null): boolean {
  if (account === null) return false;
  return account.status === "active" && account.cardPaymentsCapabilityStatus === "active";
}

export function evaluateFamilyPaymentMethodAvailability(input: {
  flagEnabled: boolean;
  environment: "test" | "live" | null;
  /** La base de este despliegue es la Supabase de producción. */
  productionDatabase: boolean;
  storageAvailable: boolean;
  /** La persona de la sesión es la pagadora vigente de la familia. */
  isPayer: boolean;
  account: FamilyPaymentConnectedAccount | null;
  planState: FamilyPaymentPlanState;
  organizationId: string;
  now?: Date;
}): FamilyPaymentMethodAvailability {
  if (!input.flagEnabled) return { available: false, reason: "flag_off" };
  if (input.environment === null) {
    return { available: false, reason: "environment_unknown" };
  }
  // Live y producción cerrados por código en esta fase, aunque la bandera
  // esté encendida: clave de Live, o una clave de test con la base de
  // producción (segundo cerrojo, independiente del prefijo de la clave).
  if (input.environment !== "test" || input.productionDatabase) {
    return { available: false, reason: "live_not_released" };
  }
  if (!input.storageAvailable) {
    return { available: false, reason: "storage_missing" };
  }
  // Solo la persona pagadora de la familia guarda el método de pago.
  if (!input.isPayer) return { available: false, reason: "not_payer" };
  if (!isAccountReady(input.account)) {
    return { available: false, reason: "account_not_ready" };
  }
  // Solo plan de pago vigente; la prueba (trialing) no cuenta.
  const plan = evaluateAutomaticCollectionPlanEligibility({
    organizationId: input.organizationId,
    entitlement: input.planState.entitlement,
    subscription: input.planState.subscription,
    now: input.now,
  });
  if (!plan.eligible) {
    return { available: false, reason: "paid_plan_required" };
  }
  // La tarjeta siempre; la domiciliación solo si Stripe la tiene activa.
  const kinds: PaymentMethodKind[] = ["card"];
  if (input.account?.sepaDebitPaymentsCapabilityStatus === "active") {
    kinds.push("sepa_debit");
  }
  return { available: true, kinds };
}
