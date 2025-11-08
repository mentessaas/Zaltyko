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
  const body = BodySchema.parse(await request.json());

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const [athlete] = await db
    .select({ id: athletes.id })
    .from(athletes)
    .where(
      and(
        eq(athletes.id, body.athleteId),
        eq(athletes.academyId, body.academyId),
        eq(athletes.tenantId, context.tenantId)
      )
    )
    .limit(1);

  if (!athlete) {
    return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
  }

  const assessmentId = crypto.randomUUID();

  await db.insert(athleteAssessments).values({
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
    const skills = await db
      .select({ id: skillCatalog.id, apparatus: skillCatalog.apparatus })
      .from(skillCatalog)
      .where(eq(skillCatalog.tenantId, context.tenantId));

    const allowedSkillIds = new Set(
      skills
        .filter((skill) => !body.apparatus || skill.apparatus === body.apparatus)
        .map((item) => item.id)
    );

    for (const score of body.scores) {
      if (!allowedSkillIds.has(score.skillId)) {
        continue;
      }

      await db.insert(assessmentScores).values({
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        assessmentId,
        skillId: score.skillId,
        score: score.score,
        comments: score.comments ?? null,
      });
    }
  }

  return NextResponse.json({ ok: true, id: assessmentId });
});
