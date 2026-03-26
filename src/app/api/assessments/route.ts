import { NextResponse } from "next/server";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import {
  athleteAssessments,
  assessmentScores,
  skillCatalog,
  assessmentVideos,
  athletes,
  academies,
} from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { verifyAthleteAccess, verifyAcademyAccess } from "@/lib/permissions";
import { db } from "@/db";

const ScoreSchema = z.object({
  skillId: z.string().uuid(),
  score: z.number().int().min(0).max(10),
  comments: z.string().optional(),
});

const BodySchema = z.object({
  academyId: z.string().uuid(),
  athleteId: z.string().uuid(),
  assessmentDate: z.string().min(1),
  apparatus: z.string().optional(),
  assessedBy: z.string().uuid().optional(),
  overallComment: z.string().optional(),
  scores: z.array(ScoreSchema).optional(),
});

const QuerySchema = z.object({
  athleteId: z.string().uuid().optional(),
  academyId: z.string().uuid().optional(),
  type: z.enum(["technical", "artistic", "physical", "behavioral", "overall"]).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withTenant(async (request, context) => {
  try {
    const { searchParams } = new URL(request.url);
    const query = QuerySchema.parse(Object.fromEntries(searchParams));

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const conditions = [eq(athleteAssessments.tenantId, context.tenantId)];

    if (query.academyId) {
      conditions.push(eq(athleteAssessments.academyId, query.academyId));
    }
    if (query.athleteId) {
      conditions.push(eq(athleteAssessments.athleteId, query.athleteId));
    }
    if (query.type) {
      conditions.push(eq(athleteAssessments.assessmentType, query.type));
    }
    if (query.fromDate) {
      conditions.push(gte(athleteAssessments.assessmentDate, query.fromDate));
    }
    if (query.toDate) {
      conditions.push(lte(athleteAssessments.assessmentDate, query.toDate));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const offset = (query.page - 1) * query.limit;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(athleteAssessments)
      .where(whereClause);

    const assessments = await db
      .select({
        id: athleteAssessments.id,
        athleteId: athleteAssessments.athleteId,
        athleteName: athletes.name,
        academyName: academies.name,
        assessmentDate: athleteAssessments.assessmentDate,
        assessmentType: athleteAssessments.assessmentType,
        apparatus: athleteAssessments.apparatus,
        overallComment: athleteAssessments.overallComment,
        totalScore: athleteAssessments.totalScore,
        assessedBy: athleteAssessments.assessedBy,
      })
      .from(athleteAssessments)
      .leftJoin(athletes, eq(athleteAssessments.athleteId, athletes.id))
      .leftJoin(academies, eq(athleteAssessments.academyId, academies.id))
      .where(whereClause)
      .orderBy(desc(athleteAssessments.assessmentDate))
      .limit(query.limit)
      .offset(offset);

    const enriched = await Promise.all(
      assessments.map(async (assessment) => {
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

        const videos = await db
          .select({
            id: assessmentVideos.id,
            url: assessmentVideos.url,
            title: assessmentVideos.title,
            description: assessmentVideos.description,
          })
          .from(assessmentVideos)
          .where(eq(assessmentVideos.assessmentId, assessment.id));

        const avgScore =
          scores.length > 0
            ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
            : null;

        return {
          id: assessment.id,
          athleteId: assessment.athleteId,
          athleteName: assessment.athleteName ?? "Atleta desconocido",
          assessmentDate: assessment.assessmentDate,
          assessmentType: assessment.assessmentType,
          apparatus: assessment.apparatus,
          overallComment: assessment.overallComment,
          assessedByName: null,
          scores: scores.map((s) => ({ ...s, criterionId: null })),
          videos: videos.map((v) => ({ ...v, uploadedAt: "" })),
          totalScore: assessment.totalScore,
          averageScore: avgScore,
        };
      })
    );

    return NextResponse.json({
      assessments: enriched,
      total: Number(count),
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(Number(count) / query.limit),
    });
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = BodySchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const academyAccess = await verifyAcademyAccess(body.academyId, context.tenantId);
    if (!academyAccess.allowed) {
      return NextResponse.json({ error: academyAccess.reason ?? "ACADEMY_ACCESS_DENIED" }, { status: 403 });
    }

    const athleteAccess = await verifyAthleteAccess(body.athleteId, context.tenantId, body.academyId);
    if (!athleteAccess.allowed) {
      return NextResponse.json({ error: athleteAccess.reason ?? "ATHLETE_NOT_FOUND" }, { status: 404 });
    }

    const assessmentId = crypto.randomUUID();

    await withTransaction(async (tx) => {
      await tx.insert(athleteAssessments).values({
        id: assessmentId,
        tenantId: context.tenantId,
        academyId: body.academyId,
        athleteId: body.athleteId,
        assessedBy: body.assessedBy ?? null,
        assessmentDate: body.assessmentDate,
        apparatus: body.apparatus ?? null,
        overallComment: body.overallComment ?? null,
      });

      if (body.scores?.length) {
        const skills = await tx
          .select({ id: skillCatalog.id, apparatus: skillCatalog.apparatus })
          .from(skillCatalog)
          .where(eq(skillCatalog.tenantId, context.tenantId));

        const allowedSkillIds = new Set(
          skills
            .filter((skill) => !body.apparatus || skill.apparatus === body.apparatus)
            .map((item) => item.id)
        );

        const scoreRows = body.scores
          .filter((score) => allowedSkillIds.has(score.skillId))
          .map((score) => ({
            id: crypto.randomUUID(),
            tenantId: context.tenantId,
            assessmentId,
            skillId: score.skillId,
            score: score.score,
            comments: score.comments ?? null,
          }));

        if (scoreRows.length > 0) {
          await tx.insert(assessmentScores).values(scoreRows);
        }
      }
    });

    return NextResponse.json({ ok: true, id: assessmentId });
  } catch (error) {
    return handleApiError(error);
  }
});
