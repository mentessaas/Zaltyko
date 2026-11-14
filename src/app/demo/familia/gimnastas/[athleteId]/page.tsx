import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DemoFamilyNote } from "@/components/demo/DemoFamilyNote";
import { DemoStepper } from "@/components/demo/DemoStepper";
import { FamilyAthleteView } from "@/components/family-portal/FamilyAthleteView";
import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { demoFamilyAthleteOverview } from "@/modules/demo/demo-fixtures";
import { formatCalendarDate } from "@/modules/family-portal/domain/family-portal-presentation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ficha de la gimnasta · Demo de Zaltyko" };

export default async function DemoFamilyAthletePage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;
  // Solo existen las gimnastas ficticias de la familia de la demo.
  const schedule = demoFamilyAthleteOverview(athleteId, new Date());
  if (!schedule) notFound();

  return (
    <FamilyPortalShell active={null} demo>
      <Link href="/demo/familia" className={ownerUi.backLink}>
        ← Volver a tu familia
      </Link>
      <PageHeader
        title={schedule.athlete.displayName}
        description={`${schedule.organizationName}. Datos desde el ${formatCalendarDate(schedule.athlete.visibleSince)}, fecha en que la gimnasta se vinculó a tu familia.`}
        className={`${ownerUi.pageHeader} mt-3`}
      />

      <DemoFamilyNote />
      <FamilyAthleteView schedule={schedule} />
      <DemoStepper current="familia" className="mt-10" />
    </FamilyPortalShell>
  );
}
