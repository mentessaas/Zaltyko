import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { AssessmentHub } from "@/components/assessments/AssessmentHub";
import { db } from "@/db";
import { academies, athletes, groups } from "@/db/schema";
import { resolveAcademySpecialization } from "@/lib/specialization/registry";
import { resolveSpecializedApparatusCodes } from "@/lib/specialization/technical-guidance";

/**
 * AssessmentsPage - Vista principal de evaluaciones técnicas
 * 
 * Permite registrar evaluaciones por aparato con puntuaciones por habilidad,
 * comentarios y seguimiento del historial de progreso de los atletas.
 */
interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
  searchParams?: Promise<{
    athleteId?: string;
  }>;
}

export default async function AssessmentsPage({ params, searchParams }: PageProps) {
  const { academyId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [academy] = await db
    .select({
      tenantId: academies.tenantId,
      name: academies.name,
      academyType: academies.academyType,
      country: academies.country,
      countryCode: academies.countryCode,
      discipline: academies.discipline,
      disciplineVariant: academies.disciplineVariant,
      federationConfigVersion: academies.federationConfigVersion,
      specializationStatus: academies.specializationStatus,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }
  const specialization = resolveAcademySpecialization({
    academyType: academy.academyType,
    country: academy.country,
    countryCode: academy.countryCode,
    discipline: academy.discipline,
    disciplineVariant: academy.disciplineVariant,
    federationConfigVersion: academy.federationConfigVersion,
    specializationStatus: academy.specializationStatus,
  });

  const athleteRows = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      groupId: athletes.groupId,
      primaryApparatus: athletes.primaryApparatus,
      level: athletes.level,
      groupName: groups.name,
      groupColor: groups.color,
      groupTechnicalFocus: groups.technicalFocus,
      groupApparatus: groups.apparatus,
    })
    .from(athletes)
    .leftJoin(groups, eq(athletes.groupId, groups.id))
    .where(eq(athletes.academyId, academyId))
    .orderBy(asc(athletes.name));

  const athletesForHub = athleteRows.map((athlete) => {
    const contextualApparatus = resolveSpecializedApparatusCodes(specialization, [
      ...(athlete.primaryApparatus ? [athlete.primaryApparatus] : []),
      ...((athlete.groupApparatus ?? []) as string[]),
    ]);

    return {
      id: athlete.id,
      name: athlete.name,
      groupName: athlete.groupName ?? null,
      level: athlete.level ?? null,
      recommendedFocus: athlete.groupTechnicalFocus ?? null,
      apparatusList:
        contextualApparatus.length > 0
          ? contextualApparatus
          : specialization.evaluation.apparatus.map((item) => item.code),
    };
  });

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-2 py-6">
        <h1 className="text-3xl font-semibold">Evaluaciones</h1>
        <p className="text-sm text-muted-foreground">
          Registra evaluaciones por aparato y sigue el progreso técnico de {specialization.labels.athletesPlural.toLowerCase()}.
        </p>
      </header>

      <AssessmentHub
        academyId={academyId}
        athletes={athletesForHub}
        initialAthleteId={resolvedSearchParams?.athleteId ?? null}
      />
    </div>
  );
}
