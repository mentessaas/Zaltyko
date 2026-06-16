export const dynamic = 'force-dynamic';

import { and, eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athleteAssessments, assessmentScores, athletes, coaches, skillCatalog } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { apiSuccess, apiError } from "@/lib/api-response";

const scoreSchema = z.object({
  skillId: z.string().uuid(),
  score: z.number().int().min(1).max(10),
  comments: z.string().nullable().optional(),
});

const createAssessmentSchema = z.object({
  assessmentDate: z.string(), // YYYY-MM-DD
  assessmentType: z.enum(["technical", "artistic", "execution", "coach_feedback", "competition", "practice"]),
  apparatus: z.string().nullable().optional(),
  scores: z.array(scoreSchema).optional(),
  overallComment: z.string().nullable().optional(),
  totalScore: z.number().nullable().optional(),
});

export const POST = withTenant(async (request, context) => {
  try {
    const { athleteId } = context.params as { athleteId: string };
    const body = createAssessmentSchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
    }

    // Verify athlete exists and belongs to tenant
    const [athleteRow] = await db
      .select({
        id: athletes.id,
        academyId: athletes.academyId,
        tenantId: athletes.tenantId,
      })
      .from(athletes)
      .where(and(eq(athletes.id, athleteId), eq(athletes.tenantId, context.tenantId)))
      .limit(1);

    if (!athleteRow) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }

    const assessmentId = crypto.randomUUID();

    await withTransaction(async (tx) => {
      await tx.insert(athleteAssessments).values({
        id: assessmentId,
        tenantId: context.tenantId,
        academyId: athleteRow.academyId,
        athleteId,
        assessmentDate: body.assessmentDate,
        assessmentType: body.assessmentType,
        apparatus: body.apparatus ?? null,
        overallComment: body.overallComment ?? null,
        totalScore: body.totalScore?.toString() ?? null,
      });

      if (body.scores && body.scores.length > 0) {
        for (const score of body.scores) {
          await tx.insert(assessmentScores).values({
            id: crypto.randomUUID(),
            tenantId: context.tenantId,
            assessmentId,
            skillId: score.skillId,
            score: score.score,
            comments: score.comments ?? null,
          });
        }
      }
    });

    return apiSuccess({ id: assessmentId });
  } catch (error) {
    return handleApiError(error);
  }
});

export const GET = withTenant(async (request, context) => {
  try {
    const { athleteId } = context.params as { athleteId: string };

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
    }

    // Verify athlete belongs to tenant
    const [athleteRow] = await db
      .select({
        id: athletes.id,
        name: athletes.name,
        tenantId: athletes.tenantId,
      })
      .from(athletes)
      .where(and(eq(athletes.id, athleteId), eq(athletes.tenantId, context.tenantId)))
      .limit(1);

    if (!athleteRow) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }

    // Get assessments for this athlete with scores
    const assessmentRows = await db
      .select({
        id: athleteAssessments.id,
        assessmentDate: athleteAssessments.assessmentDate,
        assessmentType: athleteAssessments.assessmentType,
        apparatus: athleteAssessments.apparatus,
        overallComment: athleteAssessments.overallComment,
        totalScore: athleteAssessments.totalScore,
        assessedBy: athleteAssessments.assessedBy,
        assessedByName: coaches.name,
      })
      .from(athleteAssessments)
      .leftJoin(coaches, eq(athleteAssessments.assessedBy, coaches.id))
      .where(and(
        eq(athleteAssessments.athleteId, athleteId),
        eq(athleteAssessments.tenantId, context.tenantId)
      ))
      .orderBy(desc(athleteAssessments.assessmentDate));

    // N+1 FIX: Fetch all scores in ONE query instead of N queries
    const assessmentIds = assessmentRows.map(a => a.id);
    const allScores = assessmentIds.length > 0
      ? await db
          .select({
            id: assessmentScores.id,
            assessmentId: assessmentScores.assessmentId,
            skillId: assessmentScores.skillId,
            skillName: skillCatalog.name,
            skillCode: skillCatalog.skillCode,
            apparatus: skillCatalog.apparatus,
            score: assessmentScores.score,
            comments: assessmentScores.comments,
          })
          .from(assessmentScores)
          .leftJoin(skillCatalog, eq(assessmentScores.skillId, skillCatalog.id))
          .where(inArray(assessmentScores.assessmentId, assessmentIds))
      : [];

    // Group scores by assessmentId in memory
    const scoresByAssessmentId = new Map<string, typeof allScores>();
    for (const score of allScores) {
      const existing = scoresByAssessmentId.get(score.assessmentId) || [];
      existing.push(score);
      scoresByAssessmentId.set(score.assessmentId, existing);
    }

    // Enrich assessments with their scores
    const enrichedAssessments = assessmentRows.map((assessment) => ({
      ...assessment,
      athleteName: athleteRow.name,
      scores: scoresByAssessmentId.get(assessment.id) || [],
    }));

    return apiSuccess(enrichedAssessments, { total: enrichedAssessments.length });
  } catch (error) {
    return handleApiError(error);
  }
});
