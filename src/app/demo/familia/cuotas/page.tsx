import type { Metadata } from "next";

import { DemoFamilyNote } from "@/components/demo/DemoFamilyNote";
import { DemoStepper } from "@/components/demo/DemoStepper";
import { FamilyFeesView } from "@/components/family-portal/FamilyFeesView";
import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { demoFamilyFees } from "@/modules/demo/demo-fixtures";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cuotas de la familia · Demo de Zaltyko" };

export default function DemoFamilyFeesPage() {
  return (
    <FamilyPortalShell active="fees" demo>
      <PageHeader
        title="Cuotas"
        description="Estado de las cuotas emitidas por tu academia."
        className={ownerUi.pageHeader}
      />

      <DemoFamilyNote />
      <FamilyFeesView academies={demoFamilyFees(new Date())} />
      <DemoStepper current="familia" className="mt-10" />
    </FamilyPortalShell>
  );
}
