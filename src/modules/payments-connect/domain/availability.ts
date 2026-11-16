import {
  evaluateAutomaticCollectionPlanEligibility,
  type EntitlementSnapshot,
  type SaasSubscriptionProjection,
} from "@/modules/billing/domain/plan-eligibility";

/**
 * Conectar Stripe (cobro automático de cuotas, Fase 1): ¿puede esta persona
 * de esta academia conectar su cuenta ahora? Función pura: no lee variables
 * de entorno ni toca la base; quien llama le pasa todo ya cargado.
 *
 * Los motivos se comprueban en este orden de prioridad; el primero que falla
 * es el que se devuelve.
 */
export type ConnectUnavailableReason =
  | "flag_off"
  | "environment_unknown"
  | "live_not_released"
  | "storage_missing"
  | "role_not_allowed"
  | "country_not_supported"
  | "paid_plan_required";

export type ConnectAvailability =
  | { available: true; environment: "test" }
  | { available: false; reason: ConnectUnavailableReason };

/**
 * Misma forma que OrganizationPlanState (billing/application/plan-state.ts),
 * declarada aquí para que el dominio no dependa de la capa de aplicación.
 */
export interface ConnectPlanState {
  entitlement: EntitlementSnapshot | null;
  subscription: SaasSubscriptionProjection | null;
}

/** En esta fase solo academias de España. */
const SUPPORTED_COUNTRY_CODES: ReadonlySet<string> = new Set(["ES"]);

/** Propiedad, o administración con acceso a todas las sedes. */
function isRoleAllowed(member: { role: string; locationScopeMode: string }): boolean {
  if (member.role === "owner") return true;
  return member.role === "admin" && member.locationScopeMode === "all";
}

export function evaluateConnectAvailability(input: {
  flagEnabled: boolean;
  environment: "test" | "live" | null;
  /** La base de este despliegue es la Supabase de producción. */
  productionDatabase: boolean;
  storageAvailable: boolean;
  member: { role: string; locationScopeMode: string };
  countryCode: string;
  planState: ConnectPlanState;
  organizationId: string;
  now?: Date;
}): ConnectAvailability {
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
  if (!isRoleAllowed(input.member)) {
    return { available: false, reason: "role_not_allowed" };
  }
  if (!SUPPORTED_COUNTRY_CODES.has(input.countryCode)) {
    return { available: false, reason: "country_not_supported" };
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
  return { available: true, environment: "test" };
}
