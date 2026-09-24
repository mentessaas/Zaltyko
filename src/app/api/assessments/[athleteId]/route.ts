export const dynamic = 'force-dynamic';

import { and, eq, desc, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athleteAssessments, assessmentScores, assessmentVideos, athletes, coaches, groups, skillCatalog } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
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
  visibleToGuardians: z.boolean().default(false),
});

const visibilitySchema = z.object({ visibleToGuardians: z.boolean() });

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
      .where(
        and(
          eq(athletes.id, athleteId),
          eq(athletes.tenantId, context.tenantId),
          isNull(athletes.deletedAt)
        )
      )
      .limit(1);

    if (!athleteRow) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }

    const academyScope = await authorizeAcademyCapability({
      context,
      resourceTenantId: athleteRow.tenantId,
      academyId: athleteRow.academyId,
      permission: "athletes:update",
    });
    if (!academyScope.allowed) {
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
          .where(
            and(
              eq(groups.id, athleteRow.groupId),
              eq(groups.tenantId, context.tenantId),
              eq(groups.academyId, athleteRow.academyId),
              isNull(groups.deletedAt)
            )
          )
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
        visibleToGuardians: body.visibleToGuardians,
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
      .where(
        and(
          eq(athletes.id, athleteId),
          eq(athletes.tenantId, context.tenantId),
          isNull(athletes.deletedAt)
        )
      )
      .limit(1);

    if (!athleteRow) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }

    const academyScope = await authorizeAcademyCapability({
      context,
      resourceTenantId: athleteRow.tenantId,
      academyId: athleteRow.academyId,
      permission: "athletes:read",
    });
    if (!academyScope.allowed) {
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
        visibleToGuardians: athleteAssessments.visibleToGuardians,
        totalScore: athleteAssessments.totalScore,
        assessedBy: athleteAssessments.assessedBy,
        assessedByName: coaches.name,
      })
      .from(athleteAssessments)
      .leftJoin(coaches, and(eq(athleteAssessments.assessedBy, coaches.id), eq(coaches.tenantId, context.tenantId)))
      .where(and(
        eq(athleteAssessments.athleteId, athleteId),
        eq(athleteAssessments.tenantId, context.tenantId),
        eq(athleteAssessments.academyId, athleteRow.academyId)
      ))
      .orderBy(desc(athleteAssessments.assessmentDate))
      .limit(100);

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
          .limit(5000)
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

    const videos = assessmentIds.length > 0
      ? await db
          .select({ id: assessmentVideos.id, assessmentId: assessmentVideos.assessmentId, url: assessmentVideos.url, title: assessmentVideos.title, description: assessmentVideos.description, thumbnailUrl: assessmentVideos.thumbnailUrl, duration: assessmentVideos.duration })
          .from(assessmentVideos)
          .innerJoin(athleteAssessments, eq(assessmentVideos.assessmentId, athleteAssessments.id))
          .where(and(inArray(assessmentVideos.assessmentId, assessmentIds), eq(athleteAssessments.tenantId, context.tenantId)))
          .limit(Math.min(Math.max(assessmentIds.length * 5, 1), 500))
      : [];
    const videosByAssessment = new Map<string, typeof videos>();
    for (const video of videos) {
      const existing = videosByAssessment.get(video.assessmentId) ?? [];
      existing.push(video);
      videosByAssessment.set(video.assessmentId, existing);
    }

    return apiSuccess(enrichedAssessments.map((assessment) => ({ ...assessment, videos: videosByAssessment.get(assessment.id) ?? [] })), { total: enrichedAssessments.length });
  } catch (error) {
    return handleApiError(error);
  }
});

export const PATCH = withTenant(async (request, context) => {
  try {
    const { athleteId } = context.params as { athleteId: string };
    const body = visibilitySchema.safeParse(await request.json());
    if (!body.success) return handleApiError(body.error);
    if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
    const assessmentId = new URL(request.url).searchParams.get("assessmentId");
    if (!assessmentId) return apiError("ASSESSMENT_ID_REQUIRED", "Assessment ID is required", 400);
    if (!z.string().uuid().safeParse(assessmentId).success) return apiError("ASSESSMENT_ID_INVALID", "Assessment ID is invalid", 400);

    const [assessment] = await db
      .select({ id: athleteAssessments.id, academyId: athleteAssessments.academyId, tenantId: athleteAssessments.tenantId })
      .from(athleteAssessments)
      .where(and(eq(athleteAssessments.id, assessmentId), eq(athleteAssessments.athleteId, athleteId), eq(athleteAssessments.tenantId, context.tenantId)))
      .limit(1);
    if (!assessment) return apiError("ASSESSMENT_NOT_FOUND", "Evaluación no encontrada", 404);
    const scope = await authorizeAcademyCapability({ context, resourceTenantId: assessment.tenantId, academyId: assessment.academyId, permission: "athletes:update" });
    if (!scope.allowed) return apiError("ASSESSMENT_NOT_FOUND", "Evaluación no encontrada", 404);
    const [updated] = await db.update(athleteAssessments).set({ visibleToGuardians: body.data.visibleToGuardians }).where(eq(athleteAssessments.id, assessment.id)).returning({ id: athleteAssessments.id, visibleToGuardians: athleteAssessments.visibleToGuardians });
    return apiSuccess({ assessment: updated });
  } catch (error) { return handleApiError(error); }
});
