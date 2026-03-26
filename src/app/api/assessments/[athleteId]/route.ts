import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

import {
  athleteAssessments,
  assessmentScores,
  skillCatalog,
  assessmentVideos,
  athletes,
} from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { db } from "@/db";

const ParamsSchema = z.object({
  athleteId: z.string().uuid(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const params = ParamsSchema.parse(context.params);

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Obtener evaluaciones del atleta
    const assessments = await db
      .select({
        id: athleteAssessments.id,
        assessmentDate: athleteAssessments.assessmentDate,
        assessmentType: athleteAssessments.assessmentType,
        apparatus: athleteAssessments.apparatus,
        overallComment: athleteAssessments.overallComment,
        totalScore: athleteAssessments.totalScore,
        assessedBy: athleteAssessments.assessedBy,
      })
      .from(athleteAssessments)
      .where(eq(athleteAssessments.athleteId, params.athleteId))
      .orderBy(desc(athleteAssessments.assessmentDate));

    // Obtener datos relacionados para cada evaluación
    const assessmentsWithDetails = await Promise.all(
      assessments.map(async (assessment) => {
        // Obtener scores
        const scores = await db
          .select({
            id: assessmentScores.id,
            skillId: assessmentScores.skillId,
            skillName: skillCatalog.name,
            score: assessmentScores.score,
            comments: assessmentScores.comments,
          })
          .from(assessmentScores)
          .leftJoin(skillCatalog, eq(assessmentScores.skillId, skillCatalog.id))
          .where(eq(assessmentScores.assessmentId, assessment.id));

        // Obtener videos
        const videos = await db
          .select({
            id: assessmentVideos.id,
            url: assessmentVideos.url,
            title: assessmentVideos.title,
            description: assessmentVideos.description,
            uploadedAt: assessmentVideos.createdAt,
          })
          .from(assessmentVideos)
          .where(eq(assessmentVideos.assessmentId, assessment.id));

        // Calcular promedio
        const avgScore = scores.length > 0
          ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
          : null;

        return {
          id: assessment.id,
          athleteId: params.athleteId,
          athleteName: "", // Se puede obtener del atleta si es necesario
          assessmentDate: assessment.assessmentDate,
          assessmentType: assessment.assessmentType,
          apparatus: assessment.apparatus,
          overallComment: assessment.overallComment,
          assessedByName: null, // Se puede obtener si hay coach relacionado
          scores: scores.map((s) => ({
            ...s,
            criterionId: null,
          })),
          videos: videos.map((v) => ({
            ...v,
            uploadedAt: v.uploadedAt?.toISOString() ?? "",
          })),
          totalScore: null,
          averageScore: avgScore,
        };
      })
    );

    return NextResponse.json({ assessments: assessmentsWithDetails });
  } catch (error) {
    return handleApiError(error);
  }
});
