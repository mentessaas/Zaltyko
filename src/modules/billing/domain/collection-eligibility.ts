import {
  evaluateAutomaticCollectionPlanEligibility,
  type EntitlementSnapshot,
  type SaasSubscriptionProjection,
} from "@/modules/billing/domain/plan-eligibility";
import { isOperatingOrganizationStatus } from "@/modules/organizations/domain/organization-status";

export type CollectionEligibilityReason =
  | "organization_not_active"
  | "entitlement_missing"
  | "paid_plan_required"
  | "entitlement_not_effective"
  | "subscription_missing"
  | "subscription_mismatch"
  | "subscription_not_active"
  | "subscription_period_not_current"
  | "preference_manual"
  | "preference_entitlement_stale"
  | "charge_scope_mismatch"
  | "charge_manual"
  | "provider_scope_mismatch"
  | "provider_environment_mismatch"
  | "provider_api_generation_unsupported"
  | "provider_charge_model_unsupported"
  | "provider_not_ready"
  | "authorization_missing"
  | "authorization_scope_mismatch"
  | "authorization_provider_mismatch"
  | "authorization_inactive"
  | "authorization_expired"
  | "consent_incomplete"
  | "automation_not_released";

export interface CollectionEligibilityInput {
  organization: {
    id: string;
    status: "trial" | "active" | "suspended" | "closed";
  };
  entitlement: EntitlementSnapshot | null;
  subscription: SaasSubscriptionProjection | null;
  preference: {
    organizationId: string;
    familyId: string;
    requestedMode: "manual" | "automatic";
    entitlementRevision: number | null;
  };
  charge: {
    organizationId: string;
    familyId: string;
    familyPayerId: string | null;
    collectionMode: "manual" | "automatic";
  };
  processorEnvironment: "test" | "live";
  providerAccount: {
    id: string;
    organizationId: string;
    processor: string;
    environment: "test" | "live";
    accountsApiGeneration: number;
    chargeModel: string;
    status: string;
    cardPaymentsCapabilityStatus: string;
  } | null;
  authorization: {
    organizationId: string;
    familyId: string;
    familyPayerId: string;
    paymentProviderAccountId: string;
    status: "pending" | "active" | "revoked" | "expired";
    consentVersion: string | null;
    consentEvidenceReference: string | null;
    consentEvidenceSha256: string | null;
    consentedAt: Date | string | null;
    consentedByGuardianId: string | null;
    validUntil: Date | string | null;
    revokedAt: Date | string | null;
  } | null;
  /**
   * Revisión del último cambio real del plan (código de plan, tipo de origen,
   * suscripción, prueba o contrato distintos), calculada en el servidor con
   * loadPlanChangeRevision. Las renovaciones del mismo plan no la mueven.
   * Sin ella (o si no es coherente) se exige la revisión vigente exacta.
   */
  planChangeRevision?: number | null;
  runtimeEnabled: boolean;
  now?: Date;
}

export type CollectionEligibility =
  | { eligible: true; reason: null }
  | { eligible: false; reason: CollectionEligibilityReason };

function isBeforeOrAt(value: Date | string | null, now: Date): boolean {
  if (value === null) return false;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() <= now.getTime();
}

function isFuture(value: Date | string | null, now: Date): boolean {
  if (value === null) return true;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() > now.getTime();
}

/**
 * ¿Sigue valiendo una preferencia de cobro guardada con `preferenceRevision`?
 * Sí mientras no haya habido un cambio real del plan después de guardarla:
 * `planChangeRevision <= preferenceRevision <= currentRevision`. Una
 * renovación (periodo nuevo del mismo plan, origen y suscripción o contrato)
 * sube la revisión vigente pero no `planChangeRevision`.
 *
 * Sin `planChangeRevision`, o si no está entre 1 y la vigente, se exige la
 * revisión vigente exacta (comportamiento anterior, más estricto).
 */
export function isPreferenceRevisionCurrent(input: {
  preferenceRevision: number | null;
  currentRevision: number;
  planChangeRevision?: number | null;
}): boolean {
  const preference = input.preferenceRevision;
  if (preference === null || !Number.isInteger(preference)) return false;
  const change = input.planChangeRevision;
  const validChange =
    typeof change === "number" &&
    Number.isInteger(change) &&
    change >= 1 &&
    change <= input.currentRevision;
  const since = validChange ? change : input.currentRevision;
  return preference >= since && preference <= input.currentRevision;
}

/**
 * Runtime gate for a future collection worker. Every input is loaded and
 * revalidated server-side immediately before the attempt; UI state is not authority.
 *
 * La academia debe estar operativa: en prueba (`trial`) o activa. Toda
 * academia nace `trial` y nada la pasa a `active`, así que exigir `active`
 * dejaba sin cobro a todas (arreglo del 17-11-2026). Suspendida o cerrada:
 * `organization_not_active`. El requisito de pago lo decide solo el plan
 * (evaluateAutomaticCollectionPlanEligibility: plan de pago vigente; la
 * prueba no cuenta), no el estado de la academia.
 */
export function evaluateCollectionEligibility(
  input: CollectionEligibilityInput
): CollectionEligibility {
  const now = input.now ?? new Date();
  if (!isOperatingOrganizationStatus(input.organization.status)) {
    return { eligible: false, reason: "organization_not_active" };
  }

  const plan = evaluateAutomaticCollectionPlanEligibility({
    organizationId: input.organization.id,
    entitlement: input.entitlement,
    subscription: input.subscription,
    now,
  });
  if (!plan.eligible) return plan;
  if (input.preference.organizationId !== input.organization.id) {
    return { eligible: false, reason: "charge_scope_mismatch" };
  }
  if (input.preference.requestedMode !== "automatic") {
    return { eligible: false, reason: "preference_manual" };
  }
  if (
    !isPreferenceRevisionCurrent({
      preferenceRevision: input.preference.entitlementRevision,
      currentRevision: plan.entitlementRevision,
      planChangeRevision: input.planChangeRevision,
    })
  ) {
    return { eligible: false, reason: "preference_entitlement_stale" };
  }
  if (
    input.charge.organizationId !== input.organization.id ||
    input.charge.familyId !== input.preference.familyId
  ) {
    return { eligible: false, reason: "charge_scope_mismatch" };
  }
  if (input.charge.collectionMode !== "automatic") {
    return { eligible: false, reason: "charge_manual" };
  }
  const providerAccount = input.providerAccount;
  if (!providerAccount) {
    return { eligible: false, reason: "provider_not_ready" };
  }
  if (providerAccount.organizationId !== input.organization.id) {
    return { eligible: false, reason: "provider_scope_mismatch" };
  }
  if (providerAccount.environment !== input.processorEnvironment) {
    return { eligible: false, reason: "provider_environment_mismatch" };
  }
  if (providerAccount.accountsApiGeneration !== 2) {
    return {
      eligible: false,
      reason: "provider_api_generation_unsupported",
    };
  }
  if (providerAccount.chargeModel !== "direct") {
    return { eligible: false, reason: "provider_charge_model_unsupported" };
  }
  if (
    providerAccount.processor !== "stripe" ||
    providerAccount.status !== "active" ||
    providerAccount.cardPaymentsCapabilityStatus !== "active"
  ) {
    return { eligible: false, reason: "provider_not_ready" };
  }
  if (!input.charge.familyPayerId || !input.authorization) {
    return { eligible: false, reason: "authorization_missing" };
  }
  if (
    input.authorization.organizationId !== input.organization.id ||
    input.authorization.familyId !== input.charge.familyId ||
    input.authorization.familyPayerId !== input.charge.familyPayerId
  ) {
    return { eligible: false, reason: "authorization_scope_mismatch" };
  }
  if (input.authorization.paymentProviderAccountId !== providerAccount.id) {
    return { eligible: false, reason: "authorization_provider_mismatch" };
  }
  if (
    input.authorization.status !== "active" ||
    input.authorization.revokedAt !== null
  ) {
    return { eligible: false, reason: "authorization_inactive" };
  }
  if (!isFuture(input.authorization.validUntil, now)) {
    return { eligible: false, reason: "authorization_expired" };
  }
  if (
    !input.authorization.consentVersion?.trim() ||
    !input.authorization.consentEvidenceReference?.trim() ||
    !input.authorization.consentEvidenceSha256 ||
    !/^[a-f0-9]{64}$/.test(input.authorization.consentEvidenceSha256) ||
    !isBeforeOrAt(input.authorization.consentedAt, now) ||
    !input.authorization.consentedByGuardianId
  ) {
    return { eligible: false, reason: "consent_incomplete" };
  }
  if (!input.runtimeEnabled) {
    return { eligible: false, reason: "automation_not_released" };
  }
  return { eligible: true, reason: null };
}
