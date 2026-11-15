import type { Metadata } from "next";

import { DemoFamilyNote } from "@/components/demo/DemoFamilyNote";
import { DemoStepper } from "@/components/demo/DemoStepper";
import { FamilyHomeView } from "@/components/family-portal/FamilyHomeView";
import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { demoFamilyAcademy } from "@/modules/demo/demo-fixtures";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Portal de familia · Demo de Zaltyko" };

export default function DemoFamilyHomePage() {
  return (
    <FamilyPortalShell active="athletes" demo>
      <PageHeader
        title="Tu familia"
        description="Consulta el horario, la asistencia y las cuotas de tus gimnastas."
        className={ownerUi.pageHeader}
      />

      <DemoFamilyNote />
      <FamilyHomeView academies={[demoFamilyAcademy()]} basePath="/demo/familia" />
      <DemoStepper current="familia" className="mt-10" />
    </FamilyPortalShell>
  );
}
