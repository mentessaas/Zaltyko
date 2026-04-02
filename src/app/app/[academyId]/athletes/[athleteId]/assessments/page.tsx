import { notFound } from "next/navigation";
import { Metadata } from "next";
import { eq, and, desc } from "drizzle-orm";

import { db } from "@/db";
import { academies, athletes, athleteAssessments, coaches } from "@/db/schema";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import AthleteEvaluationsTab from "@/components/assessments/AthleteEvaluationsTab";

interface PageProps {
  params: {
    academyId: string;
    athleteId: string;
  };
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [athlete] = await db
    .select({ name: athletes.name })
    .from(athletes)
    .where(eq(athletes.id, params.athleteId))
    .limit(1);

  const name = athlete?.name ?? "Atleta";

  return {
    title: `${name} · Evaluaciones`,
    description: `Historial de evaluaciones de ${name}.`,
  };
}

export default async function AthleteAssessmentsPage({ params }: PageProps) {
  const { academyId, athleteId } = params;

  // Fetch athlete
  const [athlete] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      academyId: athletes.academyId,
      tenantId: athletes.tenantId,
    })
    .from(athletes)
    .where(eq(athletes.id, athleteId))
    .limit(1);

  if (!athlete || athlete.academyId !== academyId) {
    notFound();
  }

  // Fetch assessments
  const assessments = await db
    .select({
      id: athleteAssessments.id,
      assessmentDate: athleteAssessments.assessmentDate,
      assessmentType: athleteAssessments.assessmentType,
      apparatus: athleteAssessments.apparatus,
      overallComment: athleteAssessments.overallComment,
      totalScore: athleteAssessments.totalScore,
      assessedByName: coaches.name,
    })
    .from(athleteAssessments)
    .leftJoin(coaches, eq(athleteAssessments.assessedBy, coaches.id))
    .where(and(
      eq(athleteAssessments.athleteId, athleteId),
      eq(athleteAssessments.tenantId, athlete.tenantId)
    ))
    .orderBy(desc(athleteAssessments.assessmentDate));

  // Transform to expected format
  const formattedAssessments = assessments.map((a) => ({
    id: a.id,
    assessmentDate: a.assessmentDate
      ? new Date(a.assessmentDate).toISOString().split("T")[0]
      : null,
    assessmentType: a.assessmentType,
    apparatus: a.apparatus,
    overallComment: a.overallComment,
    totalScore: a.totalScore,
    assessedByName: a.assessedByName,
    skills: [], // Would need to fetch scores separately
  }));

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Atletas", href: `/app/${academyId}/athletes` },
          { label: athlete.name || "Atleta", href: `/app/${academyId}/athletes/${athleteId}` },
          { label: "Evaluaciones" },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold">Evaluaciones de {athlete.name}</h1>
        <p className="text-muted-foreground mt-1">
          Historial completo de evaluaciones y progreso del atleta
        </p>
      </div>

      <AthleteEvaluationsTab
        athleteId={athleteId}
        athleteName={athlete.name}
      />
    </div>
  );
}
