export const dynamic = 'force-dynamic';

import { z } from "zod";
import { eq, and, gte, lte, desc, inArray, isNull } from "drizzle-orm";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { apiSuccess, apiError } from "@/lib/api-response";

import { db } from "@/db";
import {
  athleteAssessments,
  assessmentScores,
  skillCatalog,
  coaches,
  profiles,
  athletes,
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
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const athleteId = (context.params as { athleteId?: string } | undefined)?.athleteId;

  if (!athleteId) {
    return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
  }

  const url = new URL(request.url);
  const params = {
    // URLSearchParams returns null for omitted filters; normalize that to
    // undefined before Zod so the optional query fields remain optional.
    academyId: url.searchParams.get("academyId") || undefined,
    startDate: url.searchParams.get("startDate") || undefined,
    endDate: url.searchParams.get("endDate") || undefined,
    skillId: url.searchParams.get("skillId") || undefined,
  };

  const validated = querySchema.parse({
    athleteId,
    ...params,
    academyId: params.academyId,
  });

  const [athlete] = await db
    .select({ academyId: athletes.academyId, tenantId: athletes.tenantId })
    .from(athletes)
    .where(and(eq(athletes.id, athleteId), eq(athletes.tenantId, context.tenantId), isNull(athletes.deletedAt)))
    .limit(1);

  if (!athlete) {
    return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
  }

  if (validated.academyId && validated.academyId !== athlete.academyId) {
    return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
  }

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: athlete.tenantId,
    academyId: athlete.academyId,
    permission: "athletes:read",
  });
  if (!scope.allowed) return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);

  const whereConditions = [
    eq(athleteAssessments.tenantId, context.tenantId),
    eq(athleteAssessments.athleteId, athleteId),
    eq(athleteAssessments.academyId, athlete.academyId),
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
    .leftJoin(coaches, and(eq(athleteAssessments.assessedBy, coaches.id), eq(coaches.tenantId, context.tenantId)))
    .leftJoin(profiles, and(eq(athleteAssessments.assessedBy, profiles.id), eq(profiles.tenantId, context.tenantId)))
    .where(and(...whereConditions))
    .orderBy(desc(athleteAssessments.assessmentDate))
    .limit(100);

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
        .where(and(
          eq(assessmentScores.tenantId, context.tenantId),
          inArray(assessmentScores.assessmentId, assessmentIds)
        ))
        .limit(5000)
    : [];

  // Agrupar scores por evaluación
  const scoresByAssessment = new Map<string, typeof scores>();
  for (const score of scores) {
    const current = scoresByAssessment.get(score.assessmentId) || [];
    current.push(score);
    scoresByAssessment.set(score.assessmentId, current);
  }

  // Helper para formatear fecha
  const formatDate = (date: Date | string | null | undefined): string => {
    if (!date) return "";
    if (date instanceof Date) {
      return date.toISOString().split("T")[0];
    }
    const dateStr = String(date);
    return dateStr.split("T")[0];
  };

  const items = assessments.map((assessment) => ({
    id: assessment.id,
    assessmentDate: formatDate(assessment.assessmentDate),
    apparatus: assessment.apparatus,
    overallComment: assessment.overallComment,
    assessedByName: assessment.coachName || assessment.profileName,
    skills: (scoresByAssessment.get(assessment.id) || []).map((s) => ({
      skillName: s.skillName || "Habilidad",
      score: s.score,
      comments: s.comments,
    })),
  }));

  return apiSuccess({ items });
});
