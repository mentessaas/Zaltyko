export const dynamic = 'force-dynamic';

import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, classCoachAssignments, classes, coaches, coachSportConfigs, memberships, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { markChecklistItem, markWizardStep } from "@/lib/onboarding";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { replaceCoachSportConfigScope, validateSportConfigIdsForAcademy } from "@/lib/coaches/sport-scope";

const bodySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  profileId: z.string().uuid().optional(),
  sportConfigIds: z.array(z.string().uuid()).optional(),
});

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
  includeAssignments: z
    .string()
    .transform((value) => value === "true" || value === "1")
    .optional(),
});

export const GET = withTenant(async (request, context) => {
  const url = new URL(request.url);
  const params = querySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "tenantId es requerido", 400);
  }

  if (!params.success) {
    return apiError("INVALID_FILTERS", "Los filtros proporcionados no son válidos", 400);
  }

  const { academyId, includeAssignments } = params.data;

  const coachFilter = academyId
    ? and(eq(coaches.academyId, academyId), eq(coaches.tenantId, context.tenantId))
    : eq(coaches.tenantId, context.tenantId);

  const coachRows = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
      phone: coaches.phone,
      academyId: coaches.academyId,
      academyName: academies.name,
      createdAt: coaches.createdAt,
    })
    .from(coaches)
    .innerJoin(academies, eq(coaches.academyId, academies.id))
    .where(coachFilter)
    .orderBy(asc(coaches.name));

  const sportScopeRows =
    coachRows.length === 0
      ? []
      : await db
          .select({
            coachId: coachSportConfigs.coachId,
            sportConfigId: coachSportConfigs.academySportConfigId,
          })
          .from(coachSportConfigs)
          .where(inArray(coachSportConfigs.coachId, coachRows.map((coach) => coach.id)));

  const sportScopesByCoach = new Map<string, string[]>();
  sportScopeRows.forEach((row) => {
    const list = sportScopesByCoach.get(row.coachId) ?? [];
    list.push(row.sportConfigId);
    sportScopesByCoach.set(row.coachId, list);
  });

  const coachesWithScopes = coachRows.map((coach) => ({
    ...coach,
    sportConfigIds: sportScopesByCoach.get(coach.id) ?? [],
  }));

  if (!includeAssignments) {
    return apiSuccess({ items: coachesWithScopes });
  }

  const assignmentRows = await db
    .select({
      coachId: classCoachAssignments.coachId,
      classId: classes.id,
      className: classes.name,
      classAcademyId: classes.academyId,
    })
    .from(classCoachAssignments)
    .innerJoin(classes, eq(classCoachAssignments.classId, classes.id))
    .where(
      academyId
        ? and(eq(classes.academyId, academyId), eq(classCoachAssignments.tenantId, context.tenantId))
        : eq(classCoachAssignments.tenantId, context.tenantId)
    );

  const enriched = coachesWithScopes.map((coach) => {
    const classesForCoach = assignmentRows
      .filter((assignment) => assignment.coachId === coach.id && assignment.classId)
      .map((assignment) => ({
        id: assignment.classId,
        name: assignment.className ?? null,
        academyId: assignment.classAcademyId ?? null,
      }));

    return {
      ...coach,
      classes: classesForCoach,
    };
  });

  return apiSuccess({ items: enriched });
});

export const POST = withTenant(async (request, context) => {
  const body = bodySchema.parse(await request.json());

  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "tenantId es requerido", 400);
  }

  const [academy] = await db
    .select({ tenantId: academies.tenantId })
    .from(academies)
    .where(and(eq(academies.id, body.academyId), eq(academies.tenantId, context.tenantId)))
    .limit(1);

  if (!academy) {
    return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
  }

  const coachId = crypto.randomUUID();
  const sportConfigIds = await validateSportConfigIdsForAcademy({
    academyId: body.academyId,
    tenantId: context.tenantId,
    sportConfigIds: body.sportConfigIds ?? [],
  });

  if (!sportConfigIds) {
    return apiError("SPORT_CONFIG_NOT_FOUND", "Una o más ramas no están activas en esta academia", 400);
  }

  await db.insert(coaches).values({
    id: coachId,
    tenantId: context.tenantId,
    academyId: body.academyId,
    name: body.name,
    email: body.email,
    phone: body.phone,
  });

  if (sportConfigIds.length > 0) {
    const scope = await replaceCoachSportConfigScope({
      coachId,
      academyId: body.academyId,
      tenantId: context.tenantId,
      sportConfigIds,
    });

    if (!scope.ok) {
      return apiError("SPORT_CONFIG_NOT_FOUND", "Una o más ramas no están activas en esta academia", 400);
    }
  }

  if (body.profileId) {
    const [linkedProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, body.profileId))
      .limit(1);

    if (!linkedProfile) {
      return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
    }

    await db
      .insert(memberships)
      .values({
        id: crypto.randomUUID(),
        academyId: body.academyId,
        userId: linkedProfile.userId,
        role: "coach",
      })
      .onConflictDoNothing();
  }

  await markWizardStep({
    academyId: body.academyId,
    tenantId: context.tenantId,
    step: "payments-team",
  });

  await markChecklistItem({
    academyId: body.academyId,
    tenantId: context.tenantId,
    key: "invite_first_coach",
  });

  return apiCreated({ id: coachId });
});
