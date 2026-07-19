import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, groups } from "@/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";

import { NewAthletePageClient } from "./NewAthletePageClient";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export default async function NewAthletePage({ params }: PageProps) {
  const { academyId } = await params;

  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
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
      })
      .from(groups)
      .where(eq(groups.academyId, academyId))
      .orderBy(asc(groups.name)),
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
          sportConfigId: null,
          programCode: null,
          levelCode: null,
          categoryCode: null,
        }))}
        sportConfigs={sportConfigs}
      />
    </div>
  );
}
