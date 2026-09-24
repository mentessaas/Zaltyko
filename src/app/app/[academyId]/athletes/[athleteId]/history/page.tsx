import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { eq, and, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  athleteAssessments,
  assessmentScores,
  coaches,
  groups,
  memberships,
  profiles,
  skillCatalog,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
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

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const [profile] = await db
    .select({ id: profiles.id, userId: profiles.userId, role: profiles.role, tenantId: profiles.tenantId })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);
  if (!profile) redirect("/dashboard");

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
      tenantId: athletes.tenantId,
    })
    .from(athletes)
    .innerJoin(academies, eq(athletes.academyId, academies.id))
    .where(
      and(
        eq(athletes.id, athleteId),
        eq(athletes.academyId, academyId),
        isNull(athletes.deletedAt)
      )
    )
    .limit(1);

  if (!athlete) {
    notFound();
  }

  const [membership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.academyId, academyId)))
    .limit(1);
  const canAccess =
    profile.role === "super_admin" ||
    (profile.role === "admin" && profile.tenantId === athlete.tenantId) ||
    Boolean(membership);
  if (!canAccess) redirect("/dashboard");

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
        .where(
          and(
            eq(groups.id, athlete.groupId),
            eq(groups.academyId, academyId),
            eq(groups.tenantId, athlete.tenantId),
            isNull(groups.deletedAt)
          )
        )
        .limit(1)
    : [];

  const contextualApparatus = resolveSpecializedApparatusCodes(specialization, [
    ...(athlete.primaryApparatus ? [athlete.primaryApparatus] : []),
  ]);
  const technicalContext =
    groupRow || contextualApparatus.length > 0
      ? {
          groupName: groupRow?.name ?? null,
          technicalFocus: groupRow?.technicalFocus ?? null,
          apparatus: groupRow?.apparatus?.length ? groupRow.apparatus : contextualApparatus,
        }
      : null;

  // Cargar evaluaciones iniciales
  const initialAssessments = await db
    .select({
      id: athleteAssessments.id,
      assessmentDate: athleteAssessments.assessmentDate,
      apparatus: athleteAssessments.apparatus,
      overallComment: athleteAssessments.overallComment,
      assessedBy: athleteAssessments.assessedBy,
    })
    .from(athleteAssessments)
    .where(
      and(
        eq(athleteAssessments.athleteId, athleteId),
        eq(athleteAssessments.tenantId, athlete.tenantId),
        eq(athleteAssessments.academyId, academyId)
      )
    )
    .orderBy(athleteAssessments.assessmentDate)
    .limit(100);

  const scoreRows = initialAssessments.length === 0
    ? []
    : await db
        .select({
          assessmentId: assessmentScores.assessmentId,
          skillName: skillCatalog.name,
          score: assessmentScores.score,
          comments: assessmentScores.comments,
        })
        .from(assessmentScores)
        .innerJoin(skillCatalog, eq(assessmentScores.skillId, skillCatalog.id))
        .where(
          and(
            inArray(assessmentScores.assessmentId, initialAssessments.map((item) => item.id)),
            eq(assessmentScores.tenantId, athlete.tenantId)
          )
        )
        .limit(50000);
  const scoresByAssessment = new Map<string, typeof scoreRows>();
  scoreRows.forEach((score) => {
    const current = scoresByAssessment.get(score.assessmentId) ?? [];
    current.push(score);
    scoresByAssessment.set(score.assessmentId, current);
  });

  const assessedByIds = initialAssessments
    .map((assessment) => assessment.assessedBy)
    .filter((id): id is string => Boolean(id));
  const assessedByRows = assessedByIds.length === 0
    ? []
    : await db
        .select({ id: coaches.id, name: coaches.name })
        .from(coaches)
        .where(
          and(
            inArray(coaches.id, assessedByIds),
            eq(coaches.tenantId, athlete.tenantId),
            eq(coaches.academyId, academyId)
          )
        )
        .limit(500);
  const assessedByNameById = new Map(assessedByRows.map((row) => [row.id, row.name]));

  // Crear eventos para timeline
  const timelineEvents = initialAssessments.map((assessment) => {
    const dateValue = assessment.assessmentDate as string | Date;
    // `assessmentDate` is a calendar date (Postgres DATE), not an instant.
    // Preserve the day selected by the coach when serializing it for the timeline.
    const date = typeof dateValue === 'string'
      ? `${dateValue.slice(0, 10)}T12:00:00.000Z`
      : `${dateValue.toISOString().slice(0, 10)}T12:00:00.000Z`;
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
            ? dateValue.slice(0, 10)
            : dateValue.toISOString().split("T")[0];
          return {
            id: a.id,
            assessmentDate: dateStr,
            apparatus: a.apparatus,
            overallComment: a.overallComment,
            assessedByName: a.assessedBy ? assessedByNameById.get(a.assessedBy) ?? null : null,
            skills: (scoresByAssessment.get(a.id) ?? []).map((score) => ({
              skillName: score.skillName ?? "Habilidad",
              score: score.score,
              comments: score.comments,
            })),
          };
        })}
        technicalContext={technicalContext}
        apparatusLabels={apparatusLabels}
        athleteLabel={specialization.labels.athleteSingular.toLowerCase()}
      />
    </div>
  );
}
