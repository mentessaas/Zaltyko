import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq, desc } from "drizzle-orm";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Calendar, TrendingUp, Award } from "lucide-react";

import { db } from "@/db";
import {
  academies,
  athletes,
  athleteAssessments,
  assessmentScores,
  skillCatalog,
  memberships,
  profiles,
  groups,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressChart } from "@/components/assessments/ProgressChart";
import type { AssessmentWithScores } from "@/types";
import { resolveAcademySpecialization } from "@/lib/specialization/registry";
import { resolveSpecializedApparatusCodes } from "@/lib/specialization/technical-guidance";

interface AthleteProgressPageProps {
  params: Promise<{
    academyId: string;
    athleteId: string;
  }>;
}

function calculateAge(dob: Date | null): number | null {
  if (!dob) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export default async function AthleteProgressPage({ params }: AthleteProgressPageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) redirect("/dashboard");

  const { academyId, athleteId } = await params;

  // Get athlete with academy
  const [athleteRow] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
      dob: athletes.dob,
      primaryApparatus: athletes.primaryApparatus,
      groupId: athletes.groupId,
      academyId: athletes.academyId,
      academyName: academies.name,
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
    .where(eq(athletes.id, athleteId))
    .limit(1);

  if (!athleteRow) notFound();

  // Check access
  const membershipRows = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.academyId, academyId)))
    .limit(1);

  const canAccess =
    profile.role === "super_admin" ||
    profile.role === "admin" ||
    profile.tenantId === athleteRow.tenantId ||
    membershipRows.length > 0;

  if (!canAccess) redirect("/dashboard");

  const age = calculateAge(athleteRow.dob ? new Date(athleteRow.dob) : null);
  const specialization = resolveAcademySpecialization({
    academyType: athleteRow.academyType,
    country: athleteRow.country,
    countryCode: athleteRow.countryCode,
    discipline: athleteRow.discipline,
    disciplineVariant: athleteRow.disciplineVariant,
    federationConfigVersion: athleteRow.federationConfigVersion,
    specializationStatus: athleteRow.specializationStatus,
  });
  const apparatusLabels = Object.fromEntries(
    specialization.evaluation.apparatus.map((item) => [item.code, item.label])
  );
  const [groupRow] = athleteRow.groupId
    ? await db
        .select({
          id: groups.id,
          name: groups.name,
          technicalFocus: groups.technicalFocus,
          apparatus: groups.apparatus,
          sessionBlocks: groups.sessionBlocks,
        })
        .from(groups)
        .where(eq(groups.id, athleteRow.groupId))
        .limit(1)
    : [];
  const contextualApparatus = resolveSpecializedApparatusCodes(specialization, [
    ...(athleteRow.primaryApparatus ? [athleteRow.primaryApparatus] : []),
    ...((groupRow?.apparatus ?? []) as string[]),
  ]);

  // Get all assessments for this athlete
  const assessmentRows = await db
    .select({
      id: athleteAssessments.id,
      athleteId: athleteAssessments.athleteId,
      assessmentDate: athleteAssessments.assessmentDate,
      assessmentType: athleteAssessments.assessmentType,
      apparatus: athleteAssessments.apparatus,
      overallComment: athleteAssessments.overallComment,
    })
    .from(athleteAssessments)
    .where(eq(athleteAssessments.athleteId, athleteId))
    .orderBy(desc(athleteAssessments.assessmentDate));

  // Enrich with scores
  const assessments: AssessmentWithScores[] = await Promise.all(
    assessmentRows.map(async (row) => {
      const scores = await db
        .select({
          id: assessmentScores.id,
          skillId: assessmentScores.skillId,
          skillName: skillCatalog.name,
          score: assessmentScores.score,
          comments: assessmentScores.comments,
        })
        .from(assessmentScores)
        .innerJoin(skillCatalog, eq(assessmentScores.skillId, skillCatalog.id))
        .where(eq(assessmentScores.assessmentId, row.id));

      const avgScore = scores.length > 0 ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length : null;

      return {
        id: row.id,
        athleteId: row.athleteId,
        athleteName: athleteRow.name,
        assessmentDate: row.assessmentDate,
        assessmentType: row.assessmentType as AssessmentWithScores["assessmentType"],
        apparatus: row.apparatus,
        overallComment: row.overallComment,
        assessedByName: null,
        scores: scores.map((s) => ({ ...s, criterionId: null })),
        videos: [],
        totalScore: null,
        averageScore: avgScore,
      };
    })
  );

  // Calculate stats
  const totalAssessments = assessments.length;
  const assessmentsThisMonth = assessments.filter((a) => {
    const date = new Date(a.assessmentDate);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length;

  // Group by apparatus
  const apparatusStats = assessments.reduce((acc, assessment) => {
    if (assessment.apparatus) {
      if (!acc[assessment.apparatus]) {
        acc[assessment.apparatus] = { count: 0, avgScore: 0, scores: [] };
      }
      acc[assessment.apparatus].count++;
      if (assessment.averageScore !== null) {
        acc[assessment.apparatus].scores.push(assessment.averageScore);
      }
    }
    return acc;
  }, {} as Record<string, { count: number; avgScore: number; scores: number[] }>);

  Object.keys(apparatusStats).forEach((ap) => {
    const stats = apparatusStats[ap];
    stats.avgScore = stats.scores.length > 0
      ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
      : 0;
  });

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/app/${academyId}/athletes`}
            className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" />
            Volver a atletas
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-semibold">{athleteRow.name}</h1>
            <Badge variant={athleteRow.status === "active" ? "active" : "outline"}>
              {athleteRow.status === "active" ? "Activo" : athleteRow.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {athleteRow.academyName} · {athleteRow.level ?? "Nivel no definido"}
            {age !== null && ` · ${age} años`}
          </p>
          <p className="text-sm text-muted-foreground">
            Progreso técnico de {specialization.labels.athleteSingular.toLowerCase()} en{" "}
            {specialization.labels.disciplineName}
          </p>
        </div>
      </div>

      {(groupRow || athleteRow.primaryApparatus || contextualApparatus.length > 0) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Contexto técnico actual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {groupRow?.name && (
              <p className="text-sm text-muted-foreground">
                {specialization.labels.groupLabel}: {groupRow.name}
              </p>
            )}
            {groupRow?.technicalFocus && (
              <p className="text-sm text-muted-foreground">{groupRow.technicalFocus}</p>
            )}
            {(contextualApparatus.length > 0 || athleteRow.primaryApparatus) && (
              <div className="flex flex-wrap gap-2">
                {(contextualApparatus.length > 0
                  ? contextualApparatus
                  : athleteRow.primaryApparatus
                    ? [athleteRow.primaryApparatus]
                    : []
                ).map((apparatus) => (
                  <Badge key={apparatus} variant="outline">
                    {apparatusLabels[apparatus] || apparatus}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{totalAssessments}</p>
            <p className="text-sm text-muted-foreground">Total evaluaciones</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{assessmentsThisMonth}</p>
            <p className="text-sm text-muted-foreground">Este mes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">
              {Object.keys(apparatusStats).length}
            </p>
            <p className="text-sm text-muted-foreground">Aparatos evaluados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">
              {totalAssessments > 0
                ? (
                    assessments.reduce((sum, a) => sum + (a.averageScore ?? 0), 0) /
                    assessments.filter((a) => a.averageScore !== null).length
                  ).toFixed(1)
                : "—"}
            </p>
            <p className="text-sm text-muted-foreground">Promedio general</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Chart */}
      {assessments.length > 0 ? (
        <ProgressChart assessments={assessments} athleteName={athleteRow.name} />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Sin datos de progreso</h3>
            <p className="text-sm text-muted-foreground mb-4">
              No hay evaluaciones registradas para mostrar progreso.
            </p>
            <Button asChild>
              <Link href={`/app/${academyId}/athletes/${athleteId}/evaluate`}>
                Crear primera evaluación
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Apparatus breakdown */}
      {Object.keys(apparatusStats).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rendimiento por aparato</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {Object.entries(apparatusStats).map(([apparatus, stats]) => (
                <div key={apparatus} className="rounded-lg border p-3 text-center">
                  <p className="font-medium text-sm">{apparatusLabels[apparatus] || apparatus}</p>
                  <p className="text-2xl font-bold mt-1">{stats.avgScore.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">/10 promedio</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.count} evaluacion{stats.count !== 1 ? "es" : ""}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent assessments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas evaluaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {assessments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No hay evaluaciones registradas.</p>
          ) : (
            <div className="space-y-3">
              {assessments.slice(0, 10).map((assessment) => (
                <div key={assessment.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Award className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {apparatusLabels[assessment.apparatus ?? ""] || assessment.apparatus || "General"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(assessment.assessmentDate), "PPP", { locale: es })}
                      </p>
                    </div>
                  </div>
                  {assessment.averageScore !== null && (
                    <div className="text-right">
                      <p className="text-lg font-bold">{assessment.averageScore.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">/10</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
