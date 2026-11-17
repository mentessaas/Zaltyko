/**
 * Cobro automático de cuotas (Fase 3): modo de cobro con el que nace cada
 * cuota al emitir una factura.
 *
 * Una cuota nace `automatic` solo si se cumplen TODAS estas condiciones; si
 * no, nace `manual` (y sigue el camino de siempre: pago a mano y
 * recordatorios):
 * - la factura es mensual (las manuales siguen siempre en manual);
 * - la bandera ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED está encendida y
 *   los cerrojos de R11 están abiertos (clave de test y base que no es la de
 *   producción);
 * - existen las tablas de las fases 1, 2 y 3 (sin ellas nadie cobraría la
 *   cuota: se quedaría sin cobro y sin recordatorio);
 * - la academia tiene un plan de pago vigente y la familia pidió cobro
 *   automático sin un cambio real del plan después (las renovaciones del
 *   mismo plan no cuentan: loadPlanChangeRevision);
 * - el pagador de la factura tiene una autorización activa en la cuenta
 *   conectada de la academia;
 * - si esa autorización es una domiciliación, la domiciliación se cobra sola
 *   (ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED, apagada por defecto:
 *   «Primero solo tarjeta», Elvis, 17-11-2026). Si no, la cuota nace manual
 *   desde el principio y nunca espera un cobro que no va a llegar.
 *
 * La puerta completa se repite el día del cobro (evaluateFamilyCollectionGate):
 * esto solo decide con qué modo nace la cuota.
 *
 * Con la bandera apagada responde `manual` sin tocar la base, así que la
 * emisión hace exactamente las mismas consultas que antes de la Fase 3.
 */
import { sql } from "drizzle-orm";

import type { db } from "@/db";
import {
  loadOrganizationPlanState,
  loadPlanChangeRevision,
} from "@/modules/billing/application/plan-state";
import { isPreferenceRevisionCurrent } from "@/modules/billing/domain/collection-eligibility";
import { evaluateAutomaticCollectionPlanEligibility } from "@/modules/billing/domain/plan-eligibility";
import {
  isFamilyAutomaticCollectionFlagEnabled,
  isFamilyAutomaticSepaCollectionFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { findActiveAuthorization } from "@/modules/family-payment-methods/infrastructure/family-payment-store";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import { findConnectAccountForOrganization } from "@/modules/payments-connect/infrastructure/connect-account-store";

export type ChargeCollectionMode = "manual" | "automatic";

/** Tipo de factura: solo las mensuales pueden nacer en automático. */
export type InvoiceCollectionKind = "monthly" | "other";

/**
 * Bandera encendida y cerrojos de R11 abiertos: solo clave de test y nunca
 * contra la base de producción. Solo lee variables de entorno.
 */
export function isFamilyAutomaticCollectionOpen(): boolean {
  return (
    isFamilyAutomaticCollectionFlagEnabled() &&
    resolveConnectEnvironment() === "test" &&
    !isProductionDatabase()
  );
}

type Executor = Pick<typeof db, "execute">;

export async function getChargeCollectionModeSnapshot(input: {
  executor: Executor;
  organizationId: string;
  familyId: string;
  /** Pagador de la factura: la autorización tiene que ser suya. */
  familyPayerId?: string | null;
  /** Sin indicar, la factura no es mensual y la cuota nace manual. */
  invoiceKind?: InvoiceCollectionKind;
  now?: Date;
}): Promise<ChargeCollectionMode> {
  if (input.invoiceKind !== "monthly") return "manual";
  if (!isFamilyAutomaticCollectionOpen()) return "manual";
  if (!input.familyPayerId) return "manual";

  const executor = input.executor;
  const [collectionStorage, paymentMethodsStorage, connectStorage] = await Promise.all([
    isFamilyCollectionStorageAvailable(executor),
    isFamilyPaymentMethodsStorageAvailable(executor),
    isConnectOnboardingStorageAvailable(executor),
  ]);
  if (!collectionStorage || !paymentMethodsStorage || !connectStorage) return "manual";

  const now = input.now ?? new Date();
  const planState = await loadOrganizationPlanState(executor, input.organizationId);
  const plan = evaluateAutomaticCollectionPlanEligibility({
    organizationId: input.organizationId,
    entitlement: planState.entitlement,
    subscription: planState.subscription,
    now,
  });
  if (!plan.eligible) return "manual";

  const preference = await executor.execute(sql`
    select requested_mode::text as "requestedMode",
           entitlement_revision as "entitlementRevision"
      from zaltyko.family_collection_preferences
     where organization_id = ${input.organizationId}::uuid
       and family_id = ${input.familyId}::uuid
     limit 1
  `);
  const stored = preference.rows[0] as
    | { requestedMode?: unknown; entitlementRevision?: unknown }
    | undefined;
  if (!stored || stored.requestedMode !== "automatic") return "manual";
  if (stored.entitlementRevision === null || stored.entitlementRevision === undefined) {
    return "manual";
  }
  // Una renovación del mismo plan no invalida la preferencia; un cambio real
  // del plan después de guardarla, sí (misma regla que la puerta del cobro).
  const planChangeRevision = await loadPlanChangeRevision(executor, input.organizationId);
  if (
    !isPreferenceRevisionCurrent({
      preferenceRevision: Number(stored.entitlementRevision),
      currentRevision: plan.entitlementRevision,
      planChangeRevision,
    })
  ) {
    return "manual";
  }

  const account = await findConnectAccountForOrganization(executor, input.organizationId, "test");
  if (!account) return "manual";
  const authorization = await findActiveAuthorization(executor, {
    organizationId: input.organizationId,
    accountRowId: account.id,
    familyPayerId: input.familyPayerId,
  });
  if (!authorization || authorization.familyId !== input.familyId) return "manual";
  // Domiciliación sin activar: la cuota nace manual (pago a mano y recordatorios).
  if (authorization.paymentMethodKind === "sepa_debit" && !isFamilyAutomaticSepaCollectionFlagEnabled()) {
    return "manual";
  }

  return "automatic";
}
