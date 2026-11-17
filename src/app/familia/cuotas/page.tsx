import type { FamilyAutomaticPaymentCards } from "@/components/family-portal/FamilyAutomaticPaymentCard";
import { FamilyFeesView } from "@/components/family-portal/FamilyFeesView";
import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { logger } from "@/lib/logger";
import {
  isFamilyAutomaticCollectionFlagEnabled,
  isFamilyAutomaticSepaCollectionFlagEnabled,
} from "@/modules/family-collection/application/config";
import {
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-payment-methods/application/config";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";
import {
  getFamilyFees,
  type FamilyAcademyFees,
} from "@/modules/family-portal/application/family-portal-reads";
import {
  FAMILY_AUTOMATIC_COLLECTION_CLOSED,
  type FamilyAutomaticCollectionModes,
  type FamilyAutomaticFeeStatuses,
} from "@/modules/family-portal/domain/family-portal-presentation";

import { requireFamilyUser } from "../_lib/family-user";

export const dynamic = "force-dynamic";

/**
 * Pago automático (cobro automático, Fase 2): una tarjeta por cada familia que
 * esta cuenta paga en cada academia con cuotas visibles. Decide el servicio:
 * con la bandera apagada solo devuelve un método ya guardado (para poder
 * dejar de pagar automáticamente) y, fuera de la clave de test, contra la
 * base de producción o sin almacenamiento, «no disponible» sin leer datos.
 * Lo no disponible no se pinta. Si una lectura falla, esa tarjeta no se
 * muestra y el resto de la página sigue igual; en el registro no va ningún
 * dato de la familia.
 */
async function loadAutomaticPayments(
  userId: string,
  academies: FamilyAcademyFees[]
): Promise<FamilyAutomaticPaymentCards> {
  const cards: FamilyAutomaticPaymentCards = {};
  if (academies.length === 0) return cards;
  // Los dos cerrojos se leen del entorno, sin base: en Live o contra
  // producción no se resuelve ni el acceso. El servicio los repite.
  if (resolveConnectEnvironment() !== "test" || isProductionDatabase()) return cards;
  try {
    const [{ getFamilyPaymentMethodState }, access] = await Promise.all([
      import("@/modules/family-payment-methods/application/family-payment-methods-service"),
      resolveFamilyPortalAccess({ userId }),
    ]);
    const visible = new Set(academies.map((academy) => academy.organizationId));
    for (const academy of access.academies) {
      if (!visible.has(academy.organizationId)) continue;
      for (const familyId of academy.feeFamilyIds) {
        try {
          const state = await getFamilyPaymentMethodState({
            userId,
            organizationId: academy.organizationId,
            familyId,
          });
          if (state.kind === "unavailable") continue;
          (cards[academy.organizationId] ??= []).push({ familyId, state });
        } catch (error) {
          logger.warn("family_portal.automatic_payment_state_failed", {
            errorName: error instanceof Error ? error.name : "unknown",
          });
        }
      }
    }
  } catch (error) {
    logger.warn("family_portal.automatic_payment_state_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }
  return cards;
}

/**
 * Cobro automático de cuotas (Fase 3): el estado del cobro de cada cuota que
 * se cobra sola. Fuera de la clave de test o contra la base de producción no
 * se carga ni el módulo (se lee del entorno, sin base). Con la bandera
 * apagada sí se lee: una cuota con un cobro ya en marcha debe seguir viéndose
 * como «Cobro en curso» (la lectura solo devuelve esas). Sin las tablas de la
 * Fase 3 la lectura devuelve nada. Si falla, las cuotas se ven como siempre y
 * en el registro solo va el tipo de error.
 */
async function loadAutomaticCollection(
  userId: string,
  academies: FamilyAcademyFees[]
): Promise<FamilyAutomaticFeeStatuses> {
  const invoiceIds = academies.flatMap((academy) => academy.fees.map((fee) => fee.invoiceId));
  if (invoiceIds.length === 0) return {};
  if (resolveConnectEnvironment() !== "test" || isProductionDatabase()) return {};
  try {
    const { getFamilyAutomaticFeeStatuses } = await import(
      "@/modules/family-collection/application/family-collection-reads"
    );
    return await getFamilyAutomaticFeeStatuses({ userId, invoiceIds });
  } catch (error) {
    logger.warn("family_portal.automatic_collection_state_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return {};
  }
}

/**
 * Cobro automático de cuotas (Fase 3) para la tarjeta «Pago automático»: si
 * está abierto y qué familias tienen sus cuotas en automático, para que la
 * tarjeta no diga «Todavía no se cobrará nada» cuando sí se cobra, ni «Pagas
 * automáticamente» cuando no. Con la bandera apagada, fuera de la clave de
 * test o contra la base de producción, cerrado sin cargar el módulo (se lee
 * del entorno, sin base). Si la lectura falla, abierto pero sin ninguna
 * familia en automático: la tarjeta no promete ni niega el cobro, y en el
 * registro solo va el tipo de error.
 */
async function loadAutomaticCollectionModes(
  userId: string,
  academies: FamilyAcademyFees[]
): Promise<FamilyAutomaticCollectionModes> {
  if (academies.length === 0) return FAMILY_AUTOMATIC_COLLECTION_CLOSED;
  if (!isFamilyAutomaticCollectionFlagEnabled()) return FAMILY_AUTOMATIC_COLLECTION_CLOSED;
  if (resolveConnectEnvironment() !== "test" || isProductionDatabase()) return FAMILY_AUTOMATIC_COLLECTION_CLOSED;
  try {
    const { getFamilyAutomaticCollectionModes } = await import(
      "@/modules/family-collection/application/family-collection-reads"
    );
    return await getFamilyAutomaticCollectionModes({ userId });
  } catch (error) {
    logger.warn("family_portal.automatic_collection_modes_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return { open: true, automaticFamilies: {} };
  }
}

export default async function FamilyFeesPage() {
  const user = await requireFamilyUser("/familia/cuotas");
  const academies = await getFamilyFees({ userId: user.id });
  const [automaticPayments, automaticCollection, automaticCollectionModes] = await Promise.all([
    loadAutomaticPayments(user.id, academies),
    loadAutomaticCollection(user.id, academies),
    loadAutomaticCollectionModes(user.id, academies),
  ]);

  return (
    <FamilyPortalShell active="fees">
      <PageHeader
        title="Cuotas"
        description="Estado de las cuotas emitidas por tu academia."
        className={ownerUi.pageHeader}
      />

      <FamilyFeesView
        academies={academies}
        automaticPayments={automaticPayments}
        automaticCollection={automaticCollection}
        automaticCollectionModes={automaticCollectionModes}
        sepaCollectsAutomatically={isFamilyAutomaticSepaCollectionFlagEnabled()}
      />
    </FamilyPortalShell>
  );
}
