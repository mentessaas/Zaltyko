import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { academies, athletes, athleteAssessments, groups } from "@/db/schema";
import { AthleteHistoryView } from "@/components/athletes/AthleteHistoryView";
import { ProgressTimeline } from "@/components/athletes/ProgressTimeline";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { resolveAcademySpecialization } from "@/lib/specialization/registry";
import { resolveSpecializedApparatusCodes } from "@/lib/specialization/technical-guidance";

interface PageProps {
  params: Promise<{
    academyId: string;
    athleteId: string;
  }>;
}

export default async function AthleteHistoryPage({ params }: PageProps) {
  const { academyId, athleteId } = await params;

  const [athlete] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      academyId: athletes.academyId,
      primaryApparatus: athletes.primaryApparatus,
      groupId: athletes.groupId,
      academyType: academies.academyType,
      country: academies.country,
      countryCode: academies.countryCode,
      discipline: academies.discipline,
      disciplineVariant: academies.disciplineVariant,
      federationConfigVersion: academies.federationConfigVersion,
      specializationStatus: academies.specializationStatus,
    })
    .from(athletes)
    .innerJoin(academies, eq(athletes.academyId, academies.id))
    .where(and(eq(athletes.id, athleteId), eq(athletes.academyId, academyId)))
    .limit(1);

  if (!athlete) {
    notFound();
  }

  const specialization = resolveAcademySpecialization({
    academyType: athlete.academyType,
    country: athlete.country,
    countryCode: athlete.countryCode,
    discipline: athlete.discipline,
    disciplineVariant: athlete.disciplineVariant,
    federationConfigVersion: athlete.federationConfigVersion,
    specializationStatus: athlete.specializationStatus,
  });
  const apparatusLabels = Object.fromEntries(
    specialization.evaluation.apparatus.map((item) => [item.code, item.label])
  );

  const [groupRow] = athlete.groupId
    ? await db
        .select({
          id: groups.id,
          name: groups.name,
          technicalFocus: groups.technicalFocus,
          apparatus: groups.apparatus,
        })
        .from(groups)
        .where(eq(groups.id, athlete.groupId))
        .limit(1)
    : [];

  const contextualApparatus = resolveSpecializedApparatusCodes(specialization, [
    ...(athlete.primaryApparatus ? [athlete.primaryApparatus] : []),
    ...((groupRow?.apparatus ?? []) as string[]),
  ]);
  const technicalContext =
    groupRow || contextualApparatus.length > 0
      ? {
          groupName: groupRow?.name ?? null,
          technicalFocus: groupRow?.technicalFocus ?? null,
          apparatus:
            contextualApparatus.length > 0
              ? contextualApparatus
              : ((groupRow?.apparatus ?? []) as string[]),
        }
      : null;

  // Cargar evaluaciones iniciales
  const initialAssessments = await db
    .select({
      id: athleteAssessments.id,
      assessmentDate: athleteAssessments.assessmentDate,
      apparatus: athleteAssessments.apparatus,
      overallComment: athleteAssessments.overallComment,
    })
    .from(athleteAssessments)
    .where(eq(athleteAssessments.athleteId, athleteId))
    .orderBy(athleteAssessments.assessmentDate);

  // Crear eventos para timeline
  const timelineEvents = initialAssessments.map((assessment) => {
    const dateValue = assessment.assessmentDate as string | Date;
    const date = typeof dateValue === 'string'
      ? new Date(dateValue).toISOString()
      : dateValue.toISOString();
    return {
      id: assessment.id,
      type: "assessment" as const,
      date,
      title: `Evaluación - ${
        (assessment.apparatus && apparatusLabels[assessment.apparatus]) ||
        assessment.apparatus ||
        "General"
      }`,
      description: assessment.overallComment || undefined,
    };
  });

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Atletas", href: `/app/${academyId}/athletes` },
          { label: athlete.name || "Atleta", href: `/app/${academyId}/athletes/${athleteId}` },
          { label: "Historial" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-bold">Historial de {athlete.name}</h1>
        <p className="text-muted-foreground mt-1">
          Evaluaciones y progreso completo de {specialization.labels.athleteSingular.toLowerCase()}
        </p>
      </div>

      <ProgressTimeline events={timelineEvents} />

      <AthleteHistoryView
        athleteId={athleteId}
        academyId={academyId}
        initialAssessments={initialAssessments.map((a) => {
          const dateValue = a.assessmentDate as string | Date;
          const dateStr = typeof dateValue === 'string'
            ? new Date(dateValue).toISOString().split("T")[0]
            : dateValue.toISOString().split("T")[0];
          return {
            id: a.id,
            assessmentDate: dateStr,
            apparatus: a.apparatus,
            overallComment: a.overallComment,
            assessedByName: null,
            skills: [],
          };
        })}
        technicalContext={technicalContext}
        apparatusLabels={apparatusLabels}
        athleteLabel={specialization.labels.athleteSingular.toLowerCase()}
      />
    </div>
  );
}
