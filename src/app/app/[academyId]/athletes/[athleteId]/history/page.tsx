import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { athletes, athleteAssessments } from "@/db/schema";
import { AthleteHistoryView } from "@/components/athletes/AthleteHistoryView";
import { ProgressTimeline } from "@/components/athletes/ProgressTimeline";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface PageProps {
  params: {
    academyId: string;
    athleteId: string;
  };
}

export default async function AthleteHistoryPage({ params }: PageProps) {
  const { academyId, athleteId } = params;

  const [athlete] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      academyId: athletes.academyId,
    })
    .from(athletes)
    .where(and(eq(athletes.id, athleteId), eq(athletes.academyId, academyId)))
    .limit(1);

  if (!athlete) {
    notFound();
  }

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
  const timelineEvents = initialAssessments.map((assessment) => ({
    id: assessment.id,
    type: "assessment" as const,
    date: assessment.assessmentDate.toISOString(),
    title: `Evaluación - ${assessment.apparatus || "General"}`,
    description: assessment.overallComment || undefined,
  }));

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
          Evaluaciones y progreso completo del atleta
        </p>
      </div>

      <ProgressTimeline events={timelineEvents} />

      <AthleteHistoryView
        athleteId={athleteId}
        academyId={academyId}
        initialAssessments={initialAssessments.map((a) => ({
          id: a.id,
          assessmentDate: a.assessmentDate.toISOString().split("T")[0],
          apparatus: a.apparatus,
          overallComment: a.overallComment,
          assessedByName: null,
          skills: [],
        }))}
      />
    </div>
  );
}

