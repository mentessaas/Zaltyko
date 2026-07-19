export const dynamic = 'force-dynamic';

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  classCoachAssignments,
  classEnrollments,
  classGroups,
  classWeekdays,
  classes,
  coaches,
} from "@/db/schema";
import { TenantContext, withTenant } from "@/lib/authz";
import { rateLimit, getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError } from "@/lib/api-response";
import { NextResponse } from "next/server";

type RouteContext = TenantContext<{ params?: { athleteId?: string } }>;

/**
 * GET /api/athletes/[athleteId]/classes
 * Obtiene todas las clases donde aparece un atleta
 *
 * Retorna clases de su grupo principal (vía classGroups) + clases extra (vía classEnrollments)
 */
const getAthleteClassesHandler = withTenant(async (request, context) => {
  try {
    const athleteId = (context as RouteContext).params?.athleteId;

    if (!athleteId || typeof athleteId !== "string") {
      return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    const url = new URL(request.url);
    const academyId = url.searchParams.get("academyId");

    if (!academyId) {
      return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
    }

    // Verificar que el atleta existe y pertenece a la academia
    const [athleteRow] = await db
      .select({
        id: athletes.id,
        academyId: athletes.academyId,
        groupId: athletes.groupId,
      })
      .from(athletes)
      .where(and(eq(athletes.id, athleteId), eq(athletes.academyId, academyId)))
      .limit(1);

    if (!athleteRow) {
      return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
    }

    const classMap = new Map<string, {
      id: string;
      name: string;
      weekdays: number[];
      startTime: string | null;
      endTime: string | null;
      coachNames: string[];
      origin: "group" | "enrollment";
    }>();

    // 1. Obtener clases del grupo principal (si tiene grupo)
    if (athleteRow.groupId) {
      const groupClassRows = await db
        .select({
          classId: classGroups.classId,
          className: classes.name,
          startTime: classes.startTime,
          endTime: classes.endTime,
        })
        .from(classGroups)
        .innerJoin(classes, eq(classGroups.classId, classes.id))
        .where(
          and(
            eq(classGroups.groupId, athleteRow.groupId),
            eq(classes.academyId, academyId)
          )
        );

      for (const row of groupClassRows) {
        if (!classMap.has(row.classId)) {
          classMap.set(row.classId, {
            id: row.classId,
            name: row.className ?? "Clase sin nombre",
            weekdays: [],
            startTime: row.startTime,
            endTime: row.endTime,
            coachNames: [],
            origin: "group",
          });
        }
      }
    }

    // 2. Obtener clases extra (enrollments)
    const enrollmentClassRows = await db
      .select({
        classId: classEnrollments.classId,
        className: classes.name,
        startTime: classes.startTime,
        endTime: classes.endTime,
      })
      .from(classEnrollments)
      .innerJoin(classes, eq(classEnrollments.classId, classes.id))
      .where(
        and(
          eq(classEnrollments.athleteId, athleteId),
          eq(classEnrollments.academyId, academyId)
        )
      );

    for (const row of enrollmentClassRows) {
      if (!classMap.has(row.classId)) {
        classMap.set(row.classId, {
          id: row.classId,
          name: row.className ?? "Clase sin nombre",
          weekdays: [],
          startTime: row.startTime,
          endTime: row.endTime,
          coachNames: [],
          origin: "enrollment",
        });
      } else {
        // Si ya existe por grupo, mantener el origen como "group"
        const existing = classMap.get(row.classId);
        if (existing && existing.origin === "group") {
          // Ya está marcado como grupo, no cambiar
        }
      }
    }

    // 3. Obtener weekdays y coaches para todas las clases
    const classIds = Array.from(classMap.keys());
    if (classIds.length > 0) {
      // Weekdays
      const weekdayRows = await db
        .select({
          classId: classWeekdays.classId,
          weekday: classWeekdays.weekday,
        })
        .from(classWeekdays)
        .where(inArray(classWeekdays.classId, classIds));

      for (const row of weekdayRows) {
        const classInfo = classMap.get(row.classId);
        if (classInfo) {
          classInfo.weekdays.push(row.weekday);
        }
      }

      // Coaches
      const coachRows = await db
        .select({
          classId: classCoachAssignments.classId,
          coachName: coaches.name,
        })
        .from(classCoachAssignments)
        .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
        .where(inArray(classCoachAssignments.classId, classIds));

      for (const row of coachRows) {
        const classInfo = classMap.get(row.classId);
        if (classInfo && row.coachName) {
          if (!classInfo.coachNames.includes(row.coachName)) {
            classInfo.coachNames.push(row.coachName);
          }
        }
      }
    }

    // Ordenar weekdays y coaches
    for (const classInfo of classMap.values()) {
      classInfo.weekdays.sort((a, b) => a - b);
      classInfo.coachNames.sort();
    }

    return apiSuccess({ items: Array.from(classMap.values()) });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/athletes/classes" }) as unknown as ReturnType<typeof apiSuccess>;
  }
});

// Rate-limited GET handler: 100 requests per minute
export const GET = withRateLimit(
  async (request) => {
    return (await getAthleteClassesHandler(request, {} as any)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 100, window: 60 }
);

