import { FamilyFeesView } from "@/components/family-portal/FamilyFeesView";
import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { getFamilyFees } from "@/modules/family-portal/application/family-portal-reads";

import { requireFamilyUser } from "../_lib/family-user";

export const dynamic = "force-dynamic";

export default async function FamilyFeesPage() {
  const user = await requireFamilyUser("/familia/cuotas");
  const academies = await getFamilyFees({ userId: user.id });

  return (
    <FamilyPortalShell active="fees">
      <PageHeader
        title="Cuotas"
        description="Estado de las cuotas emitidas por tu academia."
        className={ownerUi.pageHeader}
      />

      <FamilyFeesView academies={academies} />
    </FamilyPortalShell>
  );
}
