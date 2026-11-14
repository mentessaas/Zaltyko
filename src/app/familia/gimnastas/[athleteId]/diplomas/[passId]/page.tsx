import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { DiplomaPrintButton } from "@/components/skill-levels/DiplomaPrintButton";
import { SkillDiploma } from "@/components/skill-levels/SkillDiploma";
import { getFamilyDiploma } from "@/modules/skill-levels/application/skill-level-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

import { requireFamilyUser } from "../../../../_lib/family-user";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ athleteId: z.guid(), passId: z.guid() });

/** Diploma de un paso de nivel para las familias. Sin la función activa, o si no es de su gimnasta: 404. */
export default async function FamilyDiplomaPage({
  params,
}: {
  params: Promise<{ athleteId: string; passId: string }>;
}) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { athleteId, passId } = parsed.data;
  const user = await requireFamilyUser(`/familia/gimnastas/${athleteId}/diplomas/${passId}`);

  let diploma: Awaited<ReturnType<typeof getFamilyDiploma>>;
  try {
    diploma = await getFamilyDiploma({ userId: user.id, athleteId, passId });
  } catch (error) {
    // Una gimnasta ajena, desconocida o sin vínculo recibe el mismo 404.
    if (error instanceof OperationalError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  if (!diploma) notFound();

  return (
    <FamilyPortalShell active={null}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/familia/gimnastas/${athleteId}`} className={ownerUi.backLink}>
          ← Volver a {diploma.athleteName}
        </Link>
        <DiplomaPrintButton />
      </div>
      <SkillDiploma diploma={diploma} />
    </FamilyPortalShell>
  );
}
