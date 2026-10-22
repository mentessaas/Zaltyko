import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { academies, groups } from "@/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";

import { NewAthletePageClient } from "./NewAthletePageClient";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
  searchParams?: Promise<{ trialId?: string }>;
}

export default async function NewAthletePage({ params, searchParams }: PageProps) {
  const { academyId } = await params;
  const trialId = (await searchParams)?.trialId;

  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      tenantId: academies.tenantId,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }

  const [groupRows, sportConfigs] = await Promise.all([
    db
      .select({
        id: groups.id,
        name: groups.name,
        color: groups.color,
        sportConfigId: groups.sportConfigId,
        programCode: groups.programCode,
        levelCode: groups.levelCode,
        categoryCode: groups.categoryCode,
      })
      .from(groups)
      .where(
        and(
          eq(groups.academyId, academyId),
          eq(groups.tenantId, academy.tenantId),
          isNull(groups.deletedAt)
        )
      )
      .orderBy(asc(groups.name))
      .limit(500),
    getAcademySportConfigOptions(academyId),
  ]);

  return (
    <div className="space-y-6 py-6 lg:py-8">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Atletas", href: `/app/${academyId}/athletes` },
          { label: "Nuevo atleta" },
        ]}
        title="Nuevo atleta"
        description={`Registra un nuevo atleta en ${academy.name ?? "la academia"}.`}
      />

      <NewAthletePageClient
        academyId={academyId}
        groups={groupRows.map((group) => ({
          id: group.id,
          name: group.name ?? "Grupo sin nombre",
          color: group.color ?? null,
          sportConfigId: group.sportConfigId ?? null,
          programCode: group.programCode ?? null,
          levelCode: group.levelCode ?? null,
          categoryCode: group.categoryCode ?? null,
        }))}
        sportConfigs={sportConfigs}
        conversionTrialId={trialId}
      />
    </div>
  );
}
