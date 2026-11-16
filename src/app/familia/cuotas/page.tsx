import type { FamilyAutomaticPaymentCards } from "@/components/family-portal/FamilyAutomaticPaymentCard";
import { FamilyFeesView } from "@/components/family-portal/FamilyFeesView";
import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { logger } from "@/lib/logger";
import {
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-payment-methods/application/config";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";
import {
  getFamilyFees,
  type FamilyAcademyFees,
} from "@/modules/family-portal/application/family-portal-reads";

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

export default async function FamilyFeesPage() {
  const user = await requireFamilyUser("/familia/cuotas");
  const academies = await getFamilyFees({ userId: user.id });
  const automaticPayments = await loadAutomaticPayments(user.id, academies);

  return (
    <FamilyPortalShell active="fees">
      <PageHeader
        title="Cuotas"
        description="Estado de las cuotas emitidas por tu academia."
        className={ownerUi.pageHeader}
      />

      <FamilyFeesView academies={academies} automaticPayments={automaticPayments} />
    </FamilyPortalShell>
  );
}
