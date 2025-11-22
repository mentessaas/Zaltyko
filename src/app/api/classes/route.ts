import { NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, classCoachAssignments, classWeekdays, classes, coaches } from "@/db/schema";
import { assertWithinPlanLimits } from "@/lib/limits";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademyAccess } from "@/lib/permissions";
import { markChecklistItem } from "@/lib/onboarding";
import { assertPremiumFeatureAccess } from "@/lib/trial";

const bodySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  isExtra: z.boolean().optional().default(false),
  groupId: z.string().uuid().nullable().optional(),
});

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
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
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    if (!params.success) {
      return handleApiError(params.error);
    }

    const { academyId, includeAssignments } = params.data;

    const classFilter = academyId
      ? eq(classes.academyId, academyId)
      : eq(classes.tenantId, context.tenantId);

    const classRows = await db
      .select({
        id: classes.id,
        name: classes.name,
        academyId: classes.academyId,
        academyName: academies.name,
        startTime: classes.startTime,
        endTime: classes.endTime,
        capacity: classes.capacity,
        isExtra: classes.isExtra,
        groupId: classes.groupId,
        createdAt: classes.createdAt,
      })
      .from(classes)
      .innerJoin(academies, eq(classes.academyId, academies.id))
      .where(classFilter)
      .orderBy(asc(classes.name));

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
            .where(inArray(classWeekdays.classId, classIds));

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
      return NextResponse.json({ items: baseItems });
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
      .where(classFilter);

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

    return NextResponse.json({ items: enriched });
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = bodySchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verificar acceso a la academia
    const academyAccess = await verifyAcademyAccess(body.academyId, context.tenantId);
    if (!academyAccess.allowed) {
      return NextResponse.json({ error: academyAccess.reason ?? "ACADEMY_ACCESS_DENIED" }, { status: 403 });
    }

    await assertPremiumFeatureAccess(body.academyId, "weekly_schedule");
    await assertWithinPlanLimits(context.tenantId, body.academyId, "classes");

    const normalizedWeekdays = Array.from(new Set(body.weekdays ?? []))
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day));

    const classId = crypto.randomUUID();

    await db.insert(classes).values({
      id: classId,
      tenantId: context.tenantId,
      academyId: body.academyId,
      name: body.name,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      capacity: body.capacity ?? null,
      isExtra: body.isExtra ?? false,
      groupId: body.groupId ?? null,
    });

    if (normalizedWeekdays.length > 0) {
      await db.insert(classWeekdays).values(
        normalizedWeekdays.map((day) => ({
          id: crypto.randomUUID(),
          classId,
          tenantId: context.tenantId!,
          weekday: day,
        }))
      );
    }

    await markChecklistItem({
      academyId: body.academyId,
      tenantId: context.tenantId,
      key: "setup_weekly_schedule",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});
