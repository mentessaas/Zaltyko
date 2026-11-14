import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { SkillAthletePanel } from "@/components/skill-levels/SkillAthletePanel";
import { PageHeader } from "@/components/ui/page-header";

import { requireSkillsScope } from "../../_lib/skills-scope";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Niveles de la gimnasta | Zaltyko",
  description: "Estado de cada elemento, nivel actual, paso de nivel y diploma.",
  robots: { index: false, follow: false },
};

export default async function OwnerSkillsAthletePage({
  params,
  searchParams,
}: {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const athleteId = z.guid().safeParse((await params).athleteId);
  if (!athleteId.success) notFound();
  const { scope, locationId } = await requireSkillsScope({
    path: `/owner/skills/athletes/${athleteId.data}`,
    searchParams: await searchParams,
  });
  const organizationId = scope.organization.id;
  const context = new URLSearchParams({ organizationId, locationId }).toString();

  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={organizationId}
      organizationName={scope.organization.name}
      locationId={locationId}
    >
      <main className={ownerUi.page}>
        <Link href={`/owner/skills?${context}`} className={ownerUi.backLink}>
          ← Volver a Niveles y progresión
        </Link>
        <PageHeader
          title="Niveles de la gimnasta"
          description="Marca el estado de cada elemento, pasa de nivel e imprime el diploma."
          className={`${ownerUi.pageHeader} mt-3`}
        />
        <SkillAthletePanel organizationId={organizationId} locationId={locationId} athleteId={athleteId.data} />
      </main>
    </OwnerWorkspacePageShell>
  );
}
