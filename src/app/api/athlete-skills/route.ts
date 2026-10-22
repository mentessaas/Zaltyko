import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athleteSkills, athletes, guardianAthletes, guardians, profiles, skillCatalog } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability, authorizeAthleteResource } from "@/lib/authz/resource-scope";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-error-handler";
import { createNotification } from "@/lib/notifications/notification-service";

const querySchema = z.object({
  athleteId: z.string().uuid(),
  skillId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const createSchema = z.object({
  athleteId: z.string().uuid(),
  skillId: z.string().uuid(),
  status: z.enum(["learning", "competing", "mastered"]).default("learning"),
  score: z.number().int().min(0).max(100).nullable().optional(),
  observedAt: z.string().date(),
  notes: z.string().trim().max(5000).nullable().optional(),
  evidence: z.array(z.object({ type: z.string().trim().min(1).max(40), url: z.string().url().max(2000).optional(), label: z.string().trim().max(200).optional() })).max(20).optional(),
  visibleToGuardians: z.boolean().default(false),
  idempotencyKey: z.string().trim().min(8).max(160).regex(/^[A-Za-z0-9._:-]+$/).optional(),
});

async function athleteFor(context: { tenantId: string; profile: Parameters<typeof authorizeAthleteResource>[0]["context"]["profile"] }, athleteId: string) {
  const [athlete] = await db.select({ id: athletes.id, tenantId: athletes.tenantId, academyId: athletes.academyId, groupId: athletes.groupId })
    .from(athletes)
    .where(and(eq(athletes.id, athleteId), eq(athletes.tenantId, context.tenantId)))
    .limit(1);
  return athlete ?? null;
}

export const GET = withTenant(async (request, context) => {
  try {
    if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return handleApiError(parsed.error);
    const athlete = await athleteFor(context, parsed.data.athleteId);
    if (!athlete) return apiError("ATHLETE_NOT_FOUND", "Atleta no encontrado", 404);
    const scope = await authorizeAthleteResource({ context, athleteId: athlete.id });
    let guardiansCanRead = false;
    if (!scope.allowed && context.profile.role === "parent") {
      const [link] = await db.select({ id: guardianAthletes.id }).from(guardianAthletes)
        .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
        .where(and(eq(guardianAthletes.tenantId, context.tenantId), eq(guardianAthletes.athleteId, athlete.id), eq(guardians.tenantId, context.tenantId), eq(guardians.profileId, context.profile.id))).limit(1);
      if (!link) return apiError("ATHLETE_NOT_FOUND", "Atleta no encontrado", 404);
      guardiansCanRead = true;
    } else if (!scope.allowed) return apiError("ATHLETE_NOT_FOUND", "Atleta no encontrado", 404);
    const conditions = [eq(athleteSkills.tenantId, context.tenantId), eq(athleteSkills.academyId, athlete.academyId), eq(athleteSkills.athleteId, athlete.id)];
    if (parsed.data.skillId) conditions.push(eq(athleteSkills.skillId, parsed.data.skillId));
    if (guardiansCanRead || context.profile.role === "athlete") conditions.push(eq(athleteSkills.visibleToGuardians, true));
    const rows = await db.select({ id: athleteSkills.id, skillId: athleteSkills.skillId, status: athleteSkills.status, score: athleteSkills.score, observedAt: athleteSkills.observedAt, observedBy: athleteSkills.observedBy, notes: athleteSkills.notes, evidence: athleteSkills.evidence, skillName: skillCatalog.name, apparatus: skillCatalog.apparatus })
      .from(athleteSkills).innerJoin(skillCatalog, eq(athleteSkills.skillId, skillCatalog.id)).where(and(...conditions)).orderBy(desc(athleteSkills.observedAt), asc(athleteSkills.createdAt)).limit(parsed.data.limit);
    return apiSuccess({ items: rows, limit: parsed.data.limit });
  } catch (error) { return handleApiError(error); }
});

export const POST = withTenant(async (request, context) => {
  try {
    if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    const body = createSchema.safeParse(await request.json());
    if (!body.success) return handleApiError(body.error);
    const input = body.data;
    const athlete = await athleteFor(context, input.athleteId);
    if (!athlete) return apiError("ATHLETE_NOT_FOUND", "Atleta no encontrado", 404);
    const scope = await authorizeAcademyCapability({ context, resourceTenantId: athlete.tenantId, academyId: athlete.academyId, permission: "athletes:update" });
    if (!scope.allowed) {
      const athleteScope = await authorizeAthleteResource({ context, athleteId: athlete.id });
      if (!athleteScope.allowed) return apiError("ATHLETE_NOT_FOUND", "Atleta no encontrado", 404);
    }
    const [skill] = await db.select({ id: skillCatalog.id }).from(skillCatalog).where(and(eq(skillCatalog.id, input.skillId), eq(skillCatalog.tenantId, context.tenantId))).limit(1);
    if (!skill) return apiError("SKILL_NOT_FOUND", "Skill no encontrado", 404);
    if (input.idempotencyKey) {
      const [existing] = await db.select().from(athleteSkills).where(and(eq(athleteSkills.tenantId, context.tenantId), eq(athleteSkills.idempotencyKey, input.idempotencyKey))).limit(1);
      if (existing) return apiSuccess({ item: existing, idempotent: true });
    }
    const inserted = await db.insert(athleteSkills).values({ tenantId: context.tenantId, academyId: athlete.academyId, athleteId: athlete.id, skillId: input.skillId, status: input.status, score: input.score ?? null, observedAt: input.observedAt, observedBy: context.profile.id, notes: input.notes ?? null, evidence: input.evidence ?? null, visibleToGuardians: input.visibleToGuardians, idempotencyKey: input.idempotencyKey ?? null })
      .onConflictDoNothing({ target: [athleteSkills.tenantId, athleteSkills.idempotencyKey] }).returning();
    const created = inserted[0] ?? (input.idempotencyKey ? (await db.select().from(athleteSkills).where(and(eq(athleteSkills.tenantId, context.tenantId), eq(athleteSkills.idempotencyKey, input.idempotencyKey))).limit(1))[0] : undefined);
    const idempotent = inserted.length === 0;
    if (!created) return apiError("OBSERVATION_PERSISTENCE_FAILED", "No se pudo guardar la observación", 500);
    if (created && input.visibleToGuardians) {
      const recipients = await db.select({ userId: profiles.userId }).from(guardianAthletes)
        .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
        .innerJoin(profiles, eq(guardians.profileId, profiles.id))
        .where(and(eq(guardianAthletes.tenantId, context.tenantId), eq(guardianAthletes.athleteId, athlete.id), eq(guardians.tenantId, context.tenantId)))
        // A single athlete normally has only a handful of guardians. Keep a
        // defensive ceiling so a corrupt relationship cannot turn a write
        // into an unbounded notification fan-out.
        .limit(1000);
      await Promise.allSettled(recipients.filter((recipient): recipient is { userId: string } => Boolean(recipient.userId)).map((recipient) => createNotification({ tenantId: context.tenantId, userId: recipient.userId, type: "skill_progress", title: "Nuevo avance técnico", message: "El coach ha compartido una nueva observación de progreso.", data: { academyId: athlete.academyId, athleteId: athlete.id, skillId: input.skillId, observationId: created.id, url: `/app/${athlete.academyId}/athletes/${athlete.id}/progress` } })));
    }
    return apiCreated({ item: created, idempotent });
  } catch (error) { return handleApiError(error); }
});
