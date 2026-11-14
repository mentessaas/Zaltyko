import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { DiplomaPrintButton } from "@/components/skill-levels/DiplomaPrintButton";
import { SkillDiploma } from "@/components/skill-levels/SkillDiploma";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { getLevelPassDiploma } from "@/modules/skill-levels/application/skill-level-service";

import { requireSkillsScope } from "../../../_lib/skills-scope";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Diploma de nivel | Zaltyko",
  description: "Diploma imprimible de un paso de nivel.",
  robots: { index: false, follow: false },
};

const paramsSchema = z.object({ athleteId: z.guid(), passId: z.guid() });

/**
 * Diploma de un paso de nivel, sin el marco del panel para imprimirlo limpio.
 * Se autoriza como la ficha de la gimnasta (sede, vínculo, no archivada para
 * el entrenador) y se imprime desde el navegador, también como PDF.
 */
export default async function OwnerSkillsDiplomaPage({
  params,
  searchParams,
}: {
  params: Promise<{ athleteId: string; passId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { athleteId, passId } = parsed.data;
  const { scope, locationId, userId } = await requireSkillsScope({
    path: `/owner/skills/diploma/${athleteId}/${passId}`,
    searchParams: await searchParams,
  });
  const organizationId = scope.organization.id;

  let diploma: Awaited<ReturnType<typeof getLevelPassDiploma>>;
  try {
    diploma = await getLevelPassDiploma({
      actor: { userId, memberId: scope.member.id },
      athleteId,
      passId,
      query: { organizationId, locationId },
    });
  } catch (error) {
    if (
      error instanceof OperationalError &&
      (error.code === "NOT_FOUND" || error.code === "FORBIDDEN" || error.code === "LOCATION_SCOPE_DENIED")
    ) {
      notFound();
    }
    throw error;
  }

  const context = new URLSearchParams({ organizationId, locationId }).toString();
  return (
    <main className="mx-auto w-full max-w-[1123px] px-5 py-7">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/owner/skills/athletes/${athleteId}?${context}`} className={ownerUi.backLink}>
          ← Volver a {diploma.athleteName}
        </Link>
        <DiplomaPrintButton />
      </div>
      <SkillDiploma diploma={diploma} />
    </main>
  );
}
