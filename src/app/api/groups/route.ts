export const dynamic = 'force-dynamic';

import { apiError, apiSuccess } from "@/lib/api-response";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, athletes, coaches, groupAthletes, groups } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { rateLimit, getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { assertWithinPlanLimits } from "@/lib/limits";
import { markChecklistItem, markWizardStep } from "@/lib/onboarding";
import { logEvent } from "@/lib/event-logging";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const DISCIPLINES = ["artistica", "ritmica", "trampolin", "general"] as const;

const GroupBodySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  discipline: z.enum(DISCIPLINES),
  level: z.string().max(120).optional(),
  technicalFocus: z.string().max(500).optional().nullable(),
  apparatus: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  sessionBlocks: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
  coachId: z.string().uuid().optional(),
  assistantIds: z.array(z.string().uuid()).optional(),
  athleteIds: z.array(z.string().uuid()).optional(),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}){1,2}$/)
    .optional(),
  monthlyFeeCents: z.number().int().min(0).nullable().optional(), // Cuota mensual en céntimos
  billingItemId: z.string().uuid().nullable().optional(), // Concepto de cobro asociado
});

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const academyIdParam = url.searchParams.get("academyId");
    const activeAcademyId = context.profile.activeAcademyId;

    const targetAcademyId = academyIdParam ?? activeAcademyId ?? null;

    if (!targetAcademyId) {
      return apiError("ACADEMY_REQUIRED", "Academy ID is required", 400);
    }

    const [academyRow] = await db
      .select({ tenantId: academies.tenantId })
      .from(academies)
      .where(eq(academies.id, targetAcademyId))
      .limit(1);

    if (!academyRow) {
      return apiError("ACADEMY_NOT_FOUND", "Academy not found", 404);
    }

    const hasAccess =
      context.profile.role === "super_admin" ||
      context.profile.role === "admin" ||
      academyRow.tenantId === context.tenantId;

    if (!hasAccess) {
      return apiError("FORBIDDEN", "Access denied", 403);
    }

    // Primero obtener los grupos con sus coaches
    const groupRows = await db
      .select({
        id: groups.id,
        name: groups.name,
        discipline: groups.discipline,
        level: groups.level,
        technicalFocus: groups.technicalFocus,
        apparatus: groups.apparatus,
        sessionBlocks: groups.sessionBlocks,
        color: groups.color,
        coachId: groups.coachId,
        assistantIds: groups.assistantIds,
        monthlyFeeCents: groups.monthlyFeeCents,
        billingItemId: groups.billingItemId,
        createdAt: groups.createdAt,
        coachName: coaches.name,
        coachEmail: coaches.email,
      })
      .from(groups)
      .leftJoin(coaches, eq(groups.coachId, coaches.id))
      .where(and(eq(groups.tenantId, academyRow.tenantId), eq(groups.academyId, targetAcademyId)))
      .orderBy(asc(groups.name));

    // Luego obtener los conteos de atletas por grupo
    const groupIds = groupRows.map((g) => g.id);
    const athleteCounts = groupIds.length > 0
      ? await db
          .select({
            groupId: groupAthletes.groupId,
            athleteCount: sql<number>`count(distinct ${groupAthletes.athleteId})`,
          })
          .from(groupAthletes)
          .where(inArray(groupAthletes.groupId, groupIds))
          .groupBy(groupAthletes.groupId)
      : [];

    // Combinar los resultados
    const countMap = new Map(athleteCounts.map((c) => [c.groupId, Number(c.athleteCount)]));
    const rows = groupRows.map((group) => ({
      ...group,
      athleteCount: countMap.get(group.id) ?? 0,
    }));

    return apiSuccess({ items: rows });
  } catch (error) {
    logger.error("Error in GET /api/groups:", error);
    return apiError("INTERNAL_ERROR", "Error al cargar los grupos", 500);
  }
});

// Handler for POST - separated to apply rate limiting
const createGroupHandler = withTenant(async (request, context) => {
  const body = GroupBodySchema.parse(await request.json());

  const [academyRow] = await db
    .select({ tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, body.academyId))
    .limit(1);

  if (!academyRow) {
    return apiError("ACADEMY_NOT_FOUND", "Academy not found", 404);
  }

  const tenantId = academyRow.tenantId;
  const role = context.profile.role;

  if (role !== "super_admin" && role !== "admin" && role !== "owner") {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  if (role !== "super_admin" && tenantId !== context.tenantId) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  const assistantIds = body.assistantIds?.length ? Array.from(new Set(body.assistantIds)) : [];
  const athleteIds = body.athleteIds?.length ? Array.from(new Set(body.athleteIds)) : [];

  const [coachRow] = body.coachId
    ? await db
        .select({ id: coaches.id })
        .from(coaches)
        .where(and(eq(coaches.id, body.coachId), eq(coaches.academyId, body.academyId)))
        .limit(1)
    : [];

  if (body.coachId && !coachRow) {
    return apiError("COACH_NOT_FOUND", "Coach not found", 404);
  }

  if (assistantIds.length) {
    const assistantRows = await db
      .select({ id: coaches.id })
      .from(coaches)
      .where(and(eq(coaches.academyId, body.academyId), inArray(coaches.id, assistantIds)));

    if (assistantRows.length !== assistantIds.length) {
      return apiError("ASSISTANT_NOT_FOUND", "Assistant not found", 404);
    }
  }

  if (athleteIds.length) {
    const athleteRows = await db
      .select({ id: athletes.id })
      .from(athletes)
      .where(
        and(eq(athletes.academyId, body.academyId), eq(athletes.tenantId, tenantId), inArray(athletes.id, athleteIds))
      );

    if (athleteRows.length !== athleteIds.length) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }
  }

  try {
    await assertWithinPlanLimits(tenantId, body.academyId, "groups");
  } catch (error: any) {
    if (error?.payload?.code === "LIMIT_REACHED") {
      return apiError("LIMIT_REACHED", error.payload?.message || "Limit reached", error.status ?? 402);
    }
    throw error;
  }

  const [group] = await db.transaction(async (tx) => {
    const [createdGroup] = await tx
      .insert(groups)
      .values({
        academyId: body.academyId,
        tenantId,
        name: body.name,
        discipline: body.discipline,
        level: body.level ?? null,
        technicalFocus: body.technicalFocus?.trim() || null,
        apparatus: body.apparatus?.length ? Array.from(new Set(body.apparatus.map((item) => item.trim()).filter(Boolean))) : null,
        sessionBlocks: body.sessionBlocks?.length ? Array.from(new Set(body.sessionBlocks.map((item) => item.trim()).filter(Boolean))) : null,
        coachId: body.coachId ?? null,
        assistantIds: assistantIds.length ? assistantIds : null,
        color: body.color ?? null,
        monthlyFeeCents: body.monthlyFeeCents ?? null,
        billingItemId: body.billingItemId ?? null,
      })
      .returning();

    if (athleteIds.length) {
      const values = athleteIds.map((athleteId) => ({
        groupId: createdGroup.id,
        tenantId,
        athleteId,
      }));

      await tx.insert(groupAthletes).values(values).onConflictDoNothing();
      await tx
        .update(athletes)
        .set({ groupId: createdGroup.id })
        .where(
          and(eq(athletes.tenantId, tenantId), eq(athletes.academyId, body.academyId), inArray(athletes.id, athleteIds))
        );
    }

    return [createdGroup];
  });

  await markChecklistItem({
    academyId: body.academyId,
    tenantId,
    key: "create_first_group",
  });

  await markWizardStep({
    academyId: body.academyId,
    tenantId,
    step: "academy",
  });

  // Log event for Super Admin metrics
  await logEvent({
    academyId: body.academyId,
    eventType: "group_created",
    metadata: {
      groupId: group.id,
      discipline: group.discipline,
      athleteCount: athleteIds.length,
    },
  });

  return apiSuccess({
    id: group.id,
    academyId: group.academyId,
    name: group.name,
    discipline: group.discipline,
    level: group.level,
    technicalFocus: group.technicalFocus,
    apparatus: group.apparatus ?? [],
    sessionBlocks: group.sessionBlocks ?? [],
    coachId: group.coachId,
    assistantIds: group.assistantIds ?? [],
    color: group.color,
    monthlyFeeCents: group.monthlyFeeCents,
    billingItemId: group.billingItemId,
    createdAt: group.createdAt,
  });
});

// Rate-limited POST handler: 10 requests per minute for group creation
export const POST = withRateLimit(
  async (request) => {
    return (await createGroupHandler(request, {} as any)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 10, window: 60 }
);
