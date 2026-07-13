export const dynamic = 'force-dynamic';

import { and, eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athleteAssessments, assessmentScores, athletes, coaches, groups, skillCatalog } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getAcademySportConfigOptions, verifyAcademySportConfig } from "@/lib/sport-config/service";
import { verifyProgressAccess } from "@/lib/progress/service";
import {
  resolveAssessingCoachId,
  verifyAssessmentSessionContext,
} from "@/lib/progress/session-context";

const scoreSchema = z.object({
  skillId: z.string().uuid(),
  score: z.number().int().min(1).max(10),
  comments: z.string().nullable().optional(),
});

const createAssessmentSchema = z.object({
  sessionId: z.string().uuid().nullable().optional(),
  assessmentDate: z.string(), // YYYY-MM-DD
  assessmentType: z.enum(["technical", "artistic", "execution", "coach_feedback", "competition", "practice"]),
  apparatus: z.string().nullable().optional(),
  sportConfigId: z.string().uuid().nullable().optional(),
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
        groupId: athletes.groupId,
        primarySportConfigId: athletes.primarySportConfigId,
      })
      .from(athletes)
      .where(and(eq(athletes.id, athleteId), eq(athletes.tenantId, context.tenantId)))
      .limit(1);

    if (!athleteRow) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }

    const athleteScope = await verifyProgressAccess({
      tenantId: context.tenantId,
      academyId: athleteRow.academyId,
      athleteId,
      athleteGroupId: athleteRow.groupId,
      profile: context.profile,
    });

    if (!athleteScope.allowed) {
      return apiError(
        athleteScope.reason ?? "ATHLETE_ACCESS_DENIED",
        "No tienes permiso para registrar progreso técnico de esta gimnasta",
        403
      );
    }

    const [groupRow] = athleteRow.groupId
      ? await db
          .select({
            sportConfigId: groups.sportConfigId,
          })
          .from(groups)
          .where(and(eq(groups.id, athleteRow.groupId), eq(groups.tenantId, context.tenantId)))
          .limit(1)
      : [];

    const athleteSportConfigId = athleteRow.primarySportConfigId ?? groupRow?.sportConfigId ?? null;
    const sessionContext = body.sessionId
      ? await verifyAssessmentSessionContext({
          tenantId: context.tenantId,
          academyId: athleteRow.academyId,
          sessionId: body.sessionId,
          athleteId,
          profile: context.profile,
        })
      : null;

    if (sessionContext && !sessionContext.allowed) {
      const status =
        sessionContext.reason === "SESSION_NOT_FOUND"
          ? 404
          : sessionContext.reason === "ATHLETE_NOT_IN_CLASS"
            ? 400
            : 403;
      return apiError(
        sessionContext.reason,
        sessionContext.reason === "ATHLETE_NOT_IN_CLASS"
          ? "La gimnasta no pertenece a esta clase o sesión"
          : sessionContext.reason === "SESSION_NOT_FOUND"
            ? "Sesión no encontrada en esta academia"
            : "No tienes permiso para registrar progreso en esta sesión",
        status
      );
    }

    const sessionSportConfigId = sessionContext?.allowed ? sessionContext.sportConfigId : null;
    if (sessionSportConfigId && body.sportConfigId && sessionSportConfigId !== body.sportConfigId) {
      return apiError(
        "SESSION_SPORT_CONFIG_MISMATCH",
        "La modalidad/rama seleccionada no corresponde a esta sesión",
        400
      );
    }
    if (sessionSportConfigId && athleteSportConfigId && sessionSportConfigId !== athleteSportConfigId) {
      return apiError(
        "ATHLETE_SPORT_CONFIG_MISMATCH",
        "La gimnasta pertenece a otra modalidad/rama",
        400
      );
    }

    const effectiveSportConfigId = sessionSportConfigId ?? body.sportConfigId ?? athleteSportConfigId;

    if (effectiveSportConfigId) {
      const verifiedConfig = await verifyAcademySportConfig({
        academyId: athleteRow.academyId,
        tenantId: context.tenantId,
        sportConfigId: effectiveSportConfigId,
      });

      if (!verifiedConfig) {
        return apiError("SPORT_CONFIG_NOT_FOUND", "La configuración deportiva no está activa en esta academia", 400);
      }

      const activeConfigs = await getAcademySportConfigOptions(athleteRow.academyId);
      const selectedConfig = activeConfigs.find((config) => config.id === effectiveSportConfigId);
      const apparatusCodes = new Set(selectedConfig?.apparatus.map((item) => item.code) ?? []);

      if (body.apparatus && apparatusCodes.size > 0 && !apparatusCodes.has(body.apparatus)) {
        return apiError("INVALID_APPARATUS", "El aparato no pertenece a la modalidad/rama de esta gimnasta", 400);
      }
    }

    const assessmentId = crypto.randomUUID();
    const assessedBy = await resolveAssessingCoachId({
      tenantId: context.tenantId,
      academyId: athleteRow.academyId,
      profile: context.profile,
    });

    await withTransaction(async (tx) => {
      await tx.insert(athleteAssessments).values({
        id: assessmentId,
        tenantId: context.tenantId,
        academyId: athleteRow.academyId,
        athleteId,
        sessionId: body.sessionId ?? null,
        assessedBy,
        sportConfigId: effectiveSportConfigId,
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
        academyId: athletes.academyId,
        groupId: athletes.groupId,
        tenantId: athletes.tenantId,
      })
      .from(athletes)
      .where(and(eq(athletes.id, athleteId), eq(athletes.tenantId, context.tenantId)))
      .limit(1);

    if (!athleteRow) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }

    const athleteScope = await verifyProgressAccess({
      tenantId: context.tenantId,
      academyId: athleteRow.academyId,
      athleteId,
      athleteGroupId: athleteRow.groupId,
      profile: context.profile,
    });

    if (!athleteScope.allowed) {
      return apiError(
        athleteScope.reason ?? "ATHLETE_ACCESS_DENIED",
        "No tienes permiso para consultar progreso técnico de esta gimnasta",
        403
      );
    }

    // Get assessments for this athlete with scores
    const assessmentRows = await db
      .select({
        id: athleteAssessments.id,
        sessionId: athleteAssessments.sessionId,
        assessmentDate: athleteAssessments.assessmentDate,
        assessmentType: athleteAssessments.assessmentType,
        apparatus: athleteAssessments.apparatus,
        sportConfigId: athleteAssessments.sportConfigId,
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
