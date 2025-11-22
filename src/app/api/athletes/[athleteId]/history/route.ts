import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { withTenant } from "@/lib/authz";

import { db } from "@/db";
import {
  athleteAssessments,
  assessmentScores,
  skillCatalog,
  coaches,
  profiles,
} from "@/db/schema";

const querySchema = z.object({
  athleteId: z.string().uuid(),
  academyId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  skillId: z.string().uuid().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const athleteId = (context.params as { athleteId?: string } | undefined)?.athleteId;

  if (!athleteId) {
    return NextResponse.json({ error: "ATHLETE_ID_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
    skillId: url.searchParams.get("skillId"),
  };

  const validated = querySchema.parse({
    athleteId,
    ...params,
    academyId: params.academyId || undefined,
  });

  const whereConditions = [
    eq(athleteAssessments.tenantId, context.tenantId),
    eq(athleteAssessments.athleteId, athleteId),
  ];

  if (validated.academyId) {
    whereConditions.push(eq(athleteAssessments.academyId, validated.academyId));
  }
  if (validated.startDate) {
    whereConditions.push(gte(athleteAssessments.assessmentDate, validated.startDate));
  }
  if (validated.endDate) {
    whereConditions.push(lte(athleteAssessments.assessmentDate, validated.endDate));
  }

  // Obtener evaluaciones
  const assessments = await db
    .select({
      id: athleteAssessments.id,
      assessmentDate: athleteAssessments.assessmentDate,
      apparatus: athleteAssessments.apparatus,
      overallComment: athleteAssessments.overallComment,
      assessedBy: athleteAssessments.assessedBy,
      coachName: coaches.name,
      profileName: profiles.name,
    })
    .from(athleteAssessments)
    .leftJoin(coaches, eq(athleteAssessments.assessedBy, coaches.id))
    .leftJoin(profiles, eq(athleteAssessments.assessedBy, profiles.id))
    .where(and(...whereConditions))
    .orderBy(desc(athleteAssessments.assessmentDate));

  const assessmentIds = assessments.map((a) => a.id);

  // Obtener scores para cada evaluación
  const scores = assessmentIds.length > 0
    ? await db
        .select({
          assessmentId: assessmentScores.assessmentId,
          skillId: assessmentScores.skillId,
          skillName: skillCatalog.name,
          score: assessmentScores.score,
          comments: assessmentScores.comments,
        })
        .from(assessmentScores)
        .innerJoin(skillCatalog, eq(assessmentScores.skillId, skillCatalog.id))
        .where(eq(assessmentScores.tenantId, context.tenantId))
    : [];

  // Agrupar scores por evaluación
  const scoresByAssessment = new Map<string, typeof scores>();
  for (const score of scores) {
    const current = scoresByAssessment.get(score.assessmentId) || [];
    current.push(score);
    scoresByAssessment.set(score.assessmentId, current);
  }

  const items = assessments.map((assessment) => ({
    id: assessment.id,
    assessmentDate: assessment.assessmentDate.toISOString().split("T")[0],
    apparatus: assessment.apparatus,
    overallComment: assessment.overallComment,
    assessedByName: assessment.coachName || assessment.profileName,
    skills: (scoresByAssessment.get(assessment.id) || []).map((s) => ({
      skillName: s.skillName || "Habilidad",
      score: s.score,
      comments: s.comments,
    })),
  }));

  return NextResponse.json({ items });
});

