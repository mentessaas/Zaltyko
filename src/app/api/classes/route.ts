export const dynamic = 'force-dynamic';

import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, classCoachAssignments, classGroups, classWeekdays, classes, coaches, groups } from "@/db/schema";
import { assertWithinPlanLimits } from "@/lib/limits";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-error-handler";
import { markAcademyActivationIfReady, markChecklistItem } from "@/lib/onboarding";
import { trackEvent } from "@/lib/analytics";
import { withTransaction } from "@/lib/db-transactions";
import { assertPremiumFeatureAccess } from "@/lib/trial";
import { getAcademySportConfigOptions, verifyAcademySportConfig } from "@/lib/sport-config/service";
import { normalizeApparatusCodes } from "@/lib/sport-config/validation";
import { isValidClassTimeRange } from "@/lib/classes/time-validation";
import { NextResponse } from "next/server";

// PR 10 (Operate P2): `.nullable().optional()` en startTime/endTime/capacity
// porque el form de clase puede limpiarlos al crear/editar. Antes, `null` → 400.
const bodySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  technicalFocus: z.string().max(500).optional().nullable(),
  apparatus: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  isExtra: z.boolean().optional().default(false),
  groupId: z.string().uuid().nullable().optional(),
  sportConfigId: z.string().uuid().nullable().optional(),
  allowsFreeTrial: z.boolean().optional().default(false),
  waitingListEnabled: z.boolean().optional().default(false),
  cancellationHoursBefore: z.number().int().min(0).max(168).optional().default(24),
  cancellationPolicy: z.enum(["flexible", "standard", "strict"]).optional().default("standard"),
});

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
  sportConfigId: z.string().uuid().optional(),
  includeAssignments: z
    .string()
    .transform((value) => value === "true" || value === "1")
    .optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const params = querySchema.safeParse(Object.fromEntries(url.searchParams));

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    if (!params.success) {
      return handleApiError(params.error);
    }

    const { academyId, includeAssignments } = params.data;
    const targetAcademyId = academyId ?? context.profile.activeAcademyId ?? null;

    if (targetAcademyId) {
      const scope = await authorizeAcademyCapability({
        context,
        resourceTenantId: context.tenantId,
        academyId: targetAcademyId,
        permission: "classes:read",
      });
      if (!scope.allowed) return apiError("CLASS_NOT_FOUND", "No se encontraron clases", 404);
    } else if (context.profile.role !== "super_admin") {
      return apiError("ACADEMY_REQUIRED", "Academy ID is required", 400);
    }

    // El tenant siempre forma parte del filtro, incluso cuando se solicita
    // una academia concreta. Sin esto, un UUID conocido podía cruzar tenants.
    const classConditions = [
      eq(classes.tenantId, context.tenantId),
      // Las clases se eliminan lógicamente; nunca deben aparecer en listados
      // operativos ni en selectores de nuevas sesiones.
      sql`${classes.deletedAt} IS NULL`,
      ...(targetAcademyId ? [eq(classes.academyId, targetAcademyId)] : []),
    ];
    const classFilter = classConditions.reduce<any>(
      (accumulator, condition) => (accumulator ? and(accumulator, condition) : condition),
      undefined
    );

    const classRows = await db
      .select({
        id: classes.id,
        name: classes.name,
        academyId: classes.academyId,
        academyName: academies.name,
        startTime: classes.startTime,
        endTime: classes.endTime,
        capacity: classes.capacity,
        technicalFocus: classes.technicalFocus,
        apparatus: classes.apparatus,
        isExtra: classes.isExtra,
        sportConfigId: classes.sportConfigId,
        groupId: classes.groupId,
        allowsFreeTrial: classes.allowsFreeTrial,
        waitingListEnabled: classes.waitingListEnabled,
        cancellationHoursBefore: classes.cancellationHoursBefore,
        cancellationPolicy: classes.cancellationPolicy,
        createdAt: classes.createdAt,
      })
      .from(classes)
      .innerJoin(
        academies,
        and(eq(classes.academyId, academies.id), eq(academies.tenantId, context.tenantId))
      )
      .where(classFilter)
      .orderBy(asc(classes.name))
      .limit(5000);

    const classIds = classRows.map((item) => item.id);
    const weekdayRows =
      classIds.length === 0
        ? []
        : await db
            .select({
              classId: classWeekdays.classId,
              weekday: classWeekdays.weekday,
            })
            .from(classWeekdays)
            .where(
              and(
                inArray(classWeekdays.classId, classIds),
                eq(classWeekdays.tenantId, context.tenantId)
              )
            )
            .limit(3500);

    const weekdayMap = new Map<string, number[]>();
    weekdayRows.forEach((row) => {
      const current = weekdayMap.get(row.classId) ?? [];
      current.push(row.weekday);
      weekdayMap.set(row.classId, current);
    });
    weekdayMap.forEach((list, key) => {
      list.sort((a, b) => a - b);
      weekdayMap.set(key, list);
    });

    const baseItems = classRows.map((clazz) => ({
      ...clazz,
      weekdays: (weekdayMap.get(clazz.id) ?? []).sort((a, b) => a - b),
    }));

    if (!includeAssignments) {
      return apiSuccess({ items: baseItems });
    }

    const assignmentRows = await db
      .select({
        classId: classes.id,
        coachId: coaches.id,
        coachName: coaches.name,
        coachEmail: coaches.email,
      })
      .from(classCoachAssignments)
      .innerJoin(classes, eq(classCoachAssignments.classId, classes.id))
      .leftJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
      .where(and(classFilter, eq(classCoachAssignments.tenantId, context.tenantId)))
      .limit(2000);

    const enriched = baseItems.map((clazz) => {
      const coachesForClass = assignmentRows
        .filter((assignment) => assignment.classId === clazz.id && assignment.coachId)
        .map((assignment) => ({
          id: assignment.coachId!,
          name: assignment.coachName ?? null,
          email: assignment.coachEmail ?? null,
        }));

      return {
        ...clazz,
        coaches: coachesForClass,
      };
    });

    return apiSuccess({ items: enriched });
  } catch (error) {
    return handleApiError(error);
  }
});

// Rate-limited POST handler: 10 requests per minute for class creation
const createClassHandler = withTenant(async (request, context) => {
  try {
    const body = bodySchema.parse(await request.json());

    if (!isValidClassTimeRange(body.startTime, body.endTime)) {
      return apiError("INVALID_TIME_RANGE", "La hora de fin debe ser posterior a la hora de inicio", 400);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    const academyScope = await authorizeAcademyCapability({
      context,
      resourceTenantId: context.tenantId,
      academyId: body.academyId,
      permission: "classes:create",
    });
    if (!academyScope.allowed) {
      return apiError(academyScope.reason ?? "ACADEMY_ACCESS_DENIED", "Academy access denied", 403);
    }

    await assertPremiumFeatureAccess(body.academyId, "weekly_schedule");
    await assertWithinPlanLimits(context.tenantId, body.academyId, "classes");

    const normalizedWeekdays = Array.from(new Set(body.weekdays ?? []))
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day));

    let selectedGroup: { id: string; sportConfigId: string | null } | null = null;
    if (body.groupId) {
      const [groupRow] = await db
        .select({
          id: groups.id,
          sportConfigId: groups.sportConfigId,
        })
        .from(groups)
        .where(
          and(
            eq(groups.id, body.groupId),
            eq(groups.tenantId, context.tenantId),
            eq(groups.academyId, body.academyId),
            isNull(groups.deletedAt)
          )
        )
        .limit(1);

      if (!groupRow) {
        return apiError("GROUP_NOT_FOUND", "Group not found", 404);
      }

      selectedGroup = groupRow;
    }

    const effectiveSportConfigId = body.sportConfigId ?? selectedGroup?.sportConfigId ?? null;
    let normalizedApparatus = body.apparatus?.length
      ? Array.from(new Set(body.apparatus.map((item) => item.trim()).filter(Boolean)))
      : null;

    if (effectiveSportConfigId) {
      const verifiedConfig = await verifyAcademySportConfig({
        academyId: body.academyId,
        tenantId: context.tenantId,
        sportConfigId: effectiveSportConfigId,
      });

      if (!verifiedConfig) {
        return apiError("SPORT_CONFIG_NOT_FOUND", "La configuración deportiva no está activa en esta academia", 400);
      }

      const activeConfigs = await getAcademySportConfigOptions(body.academyId);
      const selectedConfig = activeConfigs.find((config) => config.id === effectiveSportConfigId);

      if (normalizedApparatus) {
        const apparatusValidation = normalizeApparatusCodes(selectedConfig ?? {}, normalizedApparatus);
        if (!apparatusValidation.ok) {
          return apiError("INVALID_APPARATUS", "Uno o más aparatos no pertenecen a la modalidad/rama de esta clase", 400);
        }
        normalizedApparatus = apparatusValidation.codes;
      }
    }

    const classId = crypto.randomUUID();

    await withTransaction(async (tx) => {
      // El límite y las filas relacionadas deben confirmarse juntas. El lock
      // por academia evita que dos pestañas creen clases por encima del plan
      // y evita dejar una clase huérfana si falla weekdays/classGroups.
      if (typeof (tx as { execute?: unknown }).execute === "function") {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${body.academyId}))`);
      }
      await assertWithinPlanLimits(context.tenantId!, body.academyId, "classes", tx);

      await tx.insert(classes).values({
        id: classId,
        tenantId: context.tenantId,
        academyId: body.academyId,
        name: body.name,
        startTime: body.startTime ?? null,
        endTime: body.endTime ?? null,
        capacity: body.capacity ?? null,
        technicalFocus: body.technicalFocus?.trim() || null,
        apparatus: normalizedApparatus,
        isExtra: body.isExtra ?? false,
        sportConfigId: effectiveSportConfigId,
        groupId: body.groupId ?? null,
        allowsFreeTrial: body.allowsFreeTrial ?? false,
        waitingListEnabled: body.waitingListEnabled ?? false,
        cancellationHoursBefore: body.cancellationHoursBefore ?? 24,
        cancellationPolicy: body.cancellationPolicy ?? "standard",
      });

      if (selectedGroup) {
        await tx
          .insert(classGroups)
          .values({
            id: crypto.randomUUID(),
            tenantId: context.tenantId!,
            classId,
            groupId: selectedGroup.id,
          })
          .onConflictDoNothing();
      }

      if (normalizedWeekdays.length > 0) {
        await tx.insert(classWeekdays).values(
          normalizedWeekdays.map((day) => ({
            id: crypto.randomUUID(),
            classId,
            tenantId: context.tenantId!,
            weekday: day,
          }))
        );
      }
    });

    await markChecklistItem({
      academyId: body.academyId,
      tenantId: context.tenantId,
      key: "setup_weekly_schedule",
    });

    // Hito de valor: una academia que crea cualquier clase ya puede avanzar
    // hacia su primera asistencia. La clave estable evita duplicados incluso
    // si dos pestañas crean clases al mismo tiempo.
    await trackEvent("first_class_created", {
      academyId: body.academyId,
      tenantId: context.tenantId,
      idempotencyKey: `first_class_created:v1:${body.academyId}`,
    });
    await markAcademyActivationIfReady(body.academyId, context.tenantId);

    return apiCreated({ id: classId });
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withRateLimit(
  async (request, context) => {
    return (await createClassHandler(request, context)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 10, window: 60 }
);
