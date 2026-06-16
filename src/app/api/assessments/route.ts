export const dynamic = 'force-dynamic';

import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athleteAssessments, assessmentScores, athletes, academies, coaches } from "@/db/schema";
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
  athleteId: z.string().uuid(),
  assessmentDate: z.string(), // YYYY-MM-DD
  assessmentType: z.enum(["technical", "artistic", "execution", "coach_feedback", "competition", "practice"]),
  apparatus: z.string().nullable().optional(),
  scores: z.array(scoreSchema).optional(),
  overallComment: z.string().nullable().optional(),
  totalScore: z.number().nullable().optional(),
});

export const POST = withTenant(async (request, context) => {
  try {
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
      .where(and(eq(athletes.id, body.athleteId), eq(athletes.tenantId, context.tenantId)))
      .limit(1);

    if (!athleteRow) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }

    const assessmentId = crypto.randomUUID();

    await withTransaction(async (tx) => {
      // Create the assessment
      await tx.insert(athleteAssessments).values({
        id: assessmentId,
        tenantId: context.tenantId,
        academyId: athleteRow.academyId,
        athleteId: body.athleteId,
        assessmentDate: body.assessmentDate,
        assessmentType: body.assessmentType,
        apparatus: body.apparatus ?? null,
        overallComment: body.overallComment ?? null,
        totalScore: body.totalScore?.toString() ?? null,
      });

      // Insert scores if provided
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

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
  athleteId: z.string().uuid().optional(),
  assessmentType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const params = querySchema.safeParse(search);

    if (!params.success) {
      return handleApiError(params.error);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
    }

    const conditions = [eq(athleteAssessments.tenantId, context.tenantId)];

    if (params.data.academyId) {
      conditions.push(eq(athleteAssessments.academyId, params.data.academyId));
    }

    if (params.data.athleteId) {
      conditions.push(eq(athleteAssessments.athleteId, params.data.athleteId));
    }

    if (params.data.assessmentType) {
      conditions.push(eq(athleteAssessments.assessmentType, params.data.assessmentType as any));
    }

    const limit = params.data.limit ?? 50;
    const offset = params.data.offset ?? 0;

    const rows = await db
      .select({
        id: athleteAssessments.id,
        athleteId: athleteAssessments.athleteId,
        athleteName: athletes.name,
        assessmentDate: athleteAssessments.assessmentDate,
        assessmentType: athleteAssessments.assessmentType,
        apparatus: athleteAssessments.apparatus,
        overallComment: athleteAssessments.overallComment,
        totalScore: athleteAssessments.totalScore,
        assessedBy: athleteAssessments.assessedBy,
        assessedByName: coaches.name,
      })
      .from(athleteAssessments)
      .leftJoin(athletes, eq(athleteAssessments.athleteId, athletes.id))
      .leftJoin(coaches, eq(athleteAssessments.assessedBy, coaches.id))
      .where(and(...conditions))
      .orderBy(desc(athleteAssessments.assessmentDate))
      .limit(limit)
      .offset(offset);

    return apiSuccess(rows, { total: rows.length });
  } catch (error) {
    return handleApiError(error);
  }
});
