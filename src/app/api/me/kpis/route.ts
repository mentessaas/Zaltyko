export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { endOfWeek, formatISO, startOfWeek, subDays } from "date-fns";
import { and, count, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import { athletes, coaches, groups, classes, classSessions, athleteAssessments, attendanceRecords } from "@/db/schema";
import { createBearerSupabaseClient, getBearerToken } from "@/lib/supabase/bearer-client";
import { getCurrentProfile } from "@/lib/authz/profile-service";
import { apiError, apiSuccess } from "@/lib/api-response";
import { logger } from "@/lib/logger";

/**
 * GET /api/me/kpis (bearer / móvil, solo owner/admin/super_admin)
 *
 * Versión ligera de los KPIs del dashboard web (src/lib/dashboard.ts):
 * mismos 6 números (atletas, entrenadores, grupos, clases esta semana,
 * evaluaciones, % asistencia últimos 7 días), sin el resto de widgets
 * pesados (actividad reciente, plan, GR metrics) que el móvil no
 * necesita. A propósito NO reutiliza getDashboardData para no cargar
 * ese trabajo extra en cada refresco del home.
 */
export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createBearerSupabaseClient(token);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const profile = await getCurrentProfile(user.id);
    if (!profile) {
      return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
    }
    if (!["owner", "admin", "super_admin"].includes(profile.role)) {
      return apiError("FORBIDDEN", "Rol no soportado para esta consulta", 403);
    }

    const academyId = profile.activeAcademyId;
    if (!academyId) {
      return apiSuccess({
        athletes: 0,
        coaches: 0,
        groups: 0,
        classesThisWeek: 0,
        assessments: 0,
        attendancePercent: 0,
      });
    }

    const now = new Date();
    const weekStartIso = formatISO(startOfWeek(now, { weekStartsOn: 1 }), { representation: "date" });
    const weekEndIso = formatISO(endOfWeek(now, { weekStartsOn: 1 }), { representation: "date" });
    const sevenDaysAgoIso = formatISO(subDays(now, 7), { representation: "date" });
    const nowIso = formatISO(now, { representation: "date" });

    const [
      athleteResult,
      coachResult,
      groupResult,
      classesWeekResult,
      assessmentsResult,
      totalAttendanceResult,
      presentAttendanceResult,
    ] = await Promise.all([
      db.select({ value: count() }).from(athletes).where(eq(athletes.academyId, academyId)),
      db.select({ value: count() }).from(coaches).where(eq(coaches.academyId, academyId)),
      db.select({ value: count() }).from(groups).where(eq(groups.academyId, academyId)),
      db
        .select({ value: count() })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .where(
          and(
            eq(classes.academyId, academyId),
            gte(classSessions.sessionDate, weekStartIso),
            lte(classSessions.sessionDate, weekEndIso)
          )
        ),
      db.select({ value: count() }).from(athleteAssessments).where(eq(athleteAssessments.academyId, academyId)),
      db
        .select({ value: count() })
        .from(attendanceRecords)
        .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .where(
          and(
            eq(classes.academyId, academyId),
            gte(classSessions.sessionDate, sevenDaysAgoIso),
            lte(classSessions.sessionDate, nowIso)
          )
        ),
      db
        .select({ value: count() })
        .from(attendanceRecords)
        .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .where(
          and(
            eq(classes.academyId, academyId),
            eq(attendanceRecords.status, "present"),
            gte(classSessions.sessionDate, sevenDaysAgoIso),
            lte(classSessions.sessionDate, nowIso)
          )
        ),
    ]);

    const totalAttendances = Number(totalAttendanceResult[0]?.value ?? 0);
    const presentAttendances = Number(presentAttendanceResult[0]?.value ?? 0);
    const attendancePercent =
      totalAttendances > 0 ? Math.round((presentAttendances / totalAttendances) * 100) : 0;

    return apiSuccess({
      athletes: Number(athleteResult[0]?.value ?? 0),
      coaches: Number(coachResult[0]?.value ?? 0),
      groups: Number(groupResult[0]?.value ?? 0),
      classesThisWeek: Number(classesWeekResult[0]?.value ?? 0),
      assessments: Number(assessmentsResult[0]?.value ?? 0),
      attendancePercent,
    });
  } catch (error) {
    logger.error("Error fetching /api/me/kpis:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
