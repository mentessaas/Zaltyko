import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { AssessmentForm } from "@/components/assessment-form";
import { db } from "@/db";
import { academies, athletes, groups, skillCatalog } from "@/db/schema";

/**
 * AssessmentsPage - Vista principal de evaluaciones técnicas
 * 
 * Permite registrar evaluaciones por aparato con puntuaciones por habilidad,
 * comentarios y seguimiento del historial de progreso de los atletas.
 */
interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function AssessmentsPage({ params }: PageProps) {
  const [academy] = await db
    .select({ tenantId: academies.tenantId, name: academies.name })
    .from(academies)
    .where(eq(academies.id, params.academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }

  const athleteRows = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      groupId: athletes.groupId,
      groupName: groups.name,
      groupColor: groups.color,
    })
    .from(athletes)
    .leftJoin(groups, eq(athletes.groupId, groups.id))
    .where(eq(athletes.academyId, params.academyId))
    .orderBy(asc(athletes.name));
  const groupRows = await db
    .select({
      id: groups.id,
      name: groups.name,
      color: groups.color,
    })
    .from(groups)
    .where(eq(groups.academyId, params.academyId))
    .orderBy(asc(groups.name));


  const skillRows = await db
    .select({ id: skillCatalog.id, name: skillCatalog.name, apparatus: skillCatalog.apparatus })
    .from(skillCatalog)
    .where(eq(skillCatalog.tenantId, academy.tenantId))
    .orderBy(asc(skillCatalog.name))
    .limit(100);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-2 py-6">
        <h1 className="text-3xl font-semibold">Evaluaciones</h1>
        <p className="text-sm text-muted-foreground">
          Registra evaluaciones por aparato y lleva el historial de progreso.
        </p>
      </header>

      <AssessmentForm
        academyId={params.academyId}
        athletes={athleteRows}
        skills={skillRows}
        groups={groupRows.map((group) => ({
          id: group.id,
          name: group.name ?? "Grupo sin nombre",
          color: group.color ?? null,
        }))}
      />
    </div>
  );
}
