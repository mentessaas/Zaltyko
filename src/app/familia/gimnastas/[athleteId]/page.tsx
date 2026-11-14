import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FamilyAthleteView } from "@/components/family-portal/FamilyAthleteView";
import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { FamilySkillsSection } from "@/components/family-portal/FamilySkillsSection";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { getFamilyAthleteOverview } from "@/modules/family-portal/application/family-portal-reads";
import { formatCalendarDate } from "@/modules/family-portal/domain/family-portal-presentation";
import { OperationalError } from "@/modules/shared/domain/operational-error";

import { loadFamilySkills } from "../../_lib/family-skills";
import { requireFamilyUser } from "../../_lib/family-user";

export const dynamic = "force-dynamic";

const athleteIdSchema = z.guid();

export default async function FamilyAthletePage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId: rawAthleteId } = await params;
  const parsed = athleteIdSchema.safeParse(rawAthleteId);
  if (!parsed.success) notFound();
  const athleteId = parsed.data;

  const user = await requireFamilyUser(`/familia/gimnastas/${athleteId}`);

  let schedule: Awaited<ReturnType<typeof getFamilyAthleteOverview>>;
  try {
    schedule = await getFamilyAthleteOverview({ userId: user.id, athleteId });
  } catch (error) {
    // Foreign, unknown and unlinked athletes all get the same 404.
    if (error instanceof OperationalError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  // Niveles y progresión: null con la bandera apagada o sin el candidato SQL.
  const skills = await loadFamilySkills(user.id, athleteId);

  return (
    <FamilyPortalShell active={null}>
      <Link href="/familia" className={ownerUi.backLink}>
        ← Volver a tu familia
      </Link>
      {/* La academia va en la descripción, no como antetítulo. */}
      <PageHeader
        title={schedule.athlete.displayName}
        description={`${schedule.organizationName}. Datos desde el ${formatCalendarDate(schedule.athlete.visibleSince)}, fecha en que la gimnasta se vinculó a tu familia.`}
        className={`${ownerUi.pageHeader} mt-3`}
      />

      <FamilyAthleteView schedule={schedule} />

      {/* Niveles y progresión: solo lectura; no aparece sin la bandera ni el candidato SQL. */}
      <FamilySkillsSection view={skills} athleteId={athleteId} />
    </FamilyPortalShell>
  );
}
