export const dynamic = 'force-dynamic';

import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";

import { db } from "@/db";
import { athleteExtraClasses, athletes, classes, classWeekdays, classCoachAssignments, coaches } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";

const createExtraClassSchema = z.object({
  classId: z.string().uuid(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const params = context.params as { athleteId?: string };
    const athleteId = params?.athleteId;

    if (!athleteId) {
      return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    // Verify athlete belongs to tenant
    const [athlete] = await db
      .select({ id: athletes.id, academyId: athletes.academyId })
      .from(athletes)
      .where(and(
        eq(athletes.id, athleteId),
        eq(athletes.tenantId, context.tenantId)
      ))
      .limit(1);

    if (!athlete) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }

    // Get extra classes with class details
    const extraClasses = await db
      .select({
        id: athleteExtraClasses.id,
        tenantId: athleteExtraClasses.tenantId,
        academyId: athleteExtraClasses.academyId,
        athleteId: athleteExtraClasses.athleteId,
        classId: athleteExtraClasses.classId,
        createdAt: athleteExtraClasses.createdAt,
        className: classes.name,
        classStartTime: classes.startTime,
        classEndTime: classes.endTime,
      })
      .from(athleteExtraClasses)
      .innerJoin(classes, eq(athleteExtraClasses.classId, classes.id))
      .where(and(
        eq(athleteExtraClasses.athleteId, athleteId),
        eq(athleteExtraClasses.tenantId, context.tenantId)
      ))
      .orderBy(desc(athleteExtraClasses.createdAt));

    // Get coaches for each class
    const classIds = extraClasses.map(ec => ec.classId);
    const coachesForClasses = classIds.length > 0
      ? await db
          .select({
            classId: classCoachAssignments.classId,
            coachName: coaches.name,
          })
          .from(classCoachAssignments)
          .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
          .where(classIds.map(cid => eq(classCoachAssignments.classId, cid)).reduce(
            (acc, cond) => acc ? and(acc, cond) : cond,
            undefined as ReturnType<typeof eq> | undefined
          ))
      : [];

    // Group coaches by classId
    const coachesByClassId = new Map<string, string[]>();
    for (const row of coachesForClasses) {
      const existing = coachesByClassId.get(row.classId) || [];
      if (row.coachName) {
        existing.push(row.coachName);
      }
      coachesByClassId.set(row.classId, existing);
    }

    // Enrich with coach names
    const enrichedClasses = extraClasses.map(ec => ({
      ...ec,
      coachNames: coachesByClassId.get(ec.classId) || [],
    }));

    return apiSuccess({ items: enrichedClasses }, { total: enrichedClasses.length });
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const params = context.params as { athleteId?: string };
    const athleteId = params?.athleteId;

    if (!athleteId) {
      return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
    }
    const body = createExtraClassSchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    // Verify athlete belongs to tenant
    const [athlete] = await db
      .select({ id: athletes.id, academyId: athletes.academyId })
      .from(athletes)
      .where(and(
        eq(athletes.id, athleteId),
        eq(athletes.tenantId, context.tenantId)
      ))
      .limit(1);

    if (!athlete) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }

    // Verify class exists and belongs to same academy
    const [classInfo] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(
        eq(classes.id, body.classId),
        eq(classes.academyId, athlete.academyId)
      ))
      .limit(1);

    if (!classInfo) {
      return apiError("CLASS_NOT_FOUND", "Class not found", 404);
    }

    const enrollmentId = randomUUID();

    await db.insert(athleteExtraClasses).values({
      id: enrollmentId,
      tenantId: context.tenantId,
      academyId: athlete.academyId,
      athleteId,
      classId: body.classId,
    });

    return apiCreated({ id: enrollmentId });
  } catch (error) {
    return handleApiError(error);
  }
});

export const DELETE = withTenant(async (request, context) => {
  try {
    const params = context.params as { athleteId?: string };
    const athleteId = params?.athleteId;

    if (!athleteId) {
      return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
    }
    const url = new URL(request.url);
    const enrollmentId = url.searchParams.get("enrollmentId");

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    if (!enrollmentId) {
      return apiError("ENROLLMENT_ID_REQUIRED", "Enrollment ID is required", 400);
    }

    // Verify enrollment belongs to this athlete and tenant
    const [enrollment] = await db
      .select({ id: athleteExtraClasses.id })
      .from(athleteExtraClasses)
      .where(and(
        eq(athleteExtraClasses.id, enrollmentId),
        eq(athleteExtraClasses.athleteId, athleteId),
        eq(athleteExtraClasses.tenantId, context.tenantId)
      ))
      .limit(1);

    if (!enrollment) {
      return apiError("ENROLLMENT_NOT_FOUND", "Enrollment not found", 404);
    }

    await db
      .delete(athleteExtraClasses)
      .where(eq(athleteExtraClasses.id, enrollmentId));

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});
