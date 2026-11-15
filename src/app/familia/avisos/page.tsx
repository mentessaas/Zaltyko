import { notFound } from "next/navigation";

import { FamilyNoAccess } from "@/components/family-portal/FamilyNoAccess";
import { FamilyNoticesList } from "@/components/family-portal/FamilyNoticesList";
import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { isFamilyAccessAvailableForPage } from "@/modules/family-access/application/family-access-storage";
import { listFamilyNotices } from "@/modules/family-access/application/family-notice-reads";

import { requireFamilyUser } from "../_lib/family-user";

export const dynamic = "force-dynamic";

/** Avisos de la academia para esta cuenta, con sus preferencias de correo. */
export default async function FamilyNoticesPage() {
  if (!(await isFamilyAccessAvailableForPage())) notFound();
  const user = await requireFamilyUser("/familia/avisos");
  const academies = await listFamilyNotices({ userId: user.id });

  return (
    <FamilyPortalShell active="notices">
      <PageHeader
        title="Avisos"
        description="Cambios y cancelaciones de sesiones y mensajes de tu academia."
        className={ownerUi.pageHeader}
      />
      {academies.length === 0 ? <FamilyNoAccess /> : <FamilyNoticesList academies={academies} />}
    </FamilyPortalShell>
  );
}
