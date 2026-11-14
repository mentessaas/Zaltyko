import { FamilyHomeView } from "@/components/family-portal/FamilyHomeView";
import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";
import { hasFamilyPortalData } from "@/modules/family-portal/domain/family-portal-access";
import { recordFamilyPortalView } from "@/modules/habitual-use/application/usage-events";

import { requireFamilyUser } from "./_lib/family-user";

export const dynamic = "force-dynamic";

export default async function FamilyPortalHomePage() {
  const user = await requireFamilyUser("/familia");
  const access = await resolveFamilyPortalAccess({ userId: user.id });
  // Uso habitual: una entrada por academia con datos, con seudónimo semanal de la
  // cuenta y sin identificar a ninguna gimnasta (apagado por defecto).
  if (hasFamilyPortalData(access)) {
    await Promise.all(
      access.academies.map((academy) =>
        recordFamilyPortalView({ organizationId: academy.organizationId, userId: user.id })
      )
    );
  }

  return (
    <FamilyPortalShell active="athletes">
      <PageHeader
        title="Tu familia"
        description="Consulta el horario, la asistencia y las cuotas de tus gimnastas."
        className={ownerUi.pageHeader}
      />

      <FamilyHomeView academies={access.academies} />
    </FamilyPortalShell>
  );
}
