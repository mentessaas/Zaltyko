import { FamilyHomeView } from "@/components/family-portal/FamilyHomeView";
import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";

import { requireFamilyUser } from "./_lib/family-user";

export const dynamic = "force-dynamic";

export default async function FamilyPortalHomePage() {
  const user = await requireFamilyUser("/familia");
  const access = await resolveFamilyPortalAccess({ userId: user.id });

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
