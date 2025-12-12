import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athleteAssessments,
  athletes,
  assessmentScores,
  skillCatalog,
} from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { verifyAthleteAccess, verifyAcademyAccess } from "@/lib/permissions";

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

export const POST = withTenant(async (request, context) => {
  try {
    const body = BodySchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verificar acceso a la academia
    const academyAccess = await verifyAcademyAccess(body.academyId, context.tenantId);
    if (!academyAccess.allowed) {
      return NextResponse.json({ error: academyAccess.reason ?? "ACADEMY_ACCESS_DENIED" }, { status: 403 });
    }

    // Verificar acceso al atleta
    const athleteAccess = await verifyAthleteAccess(body.athleteId, context.tenantId, body.academyId);
    if (!athleteAccess.allowed) {
      return NextResponse.json({ error: athleteAccess.reason ?? "ATHLETE_NOT_FOUND" }, { status: 404 });
    }

    const assessmentId = crypto.randomUUID();

    // Usar transacción para garantizar atomicidad
    await withTransaction(async (tx) => {
      // Crear evaluación
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

      // Crear scores si existen
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
