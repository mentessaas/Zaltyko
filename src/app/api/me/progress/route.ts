export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import { athleteAssessments, athletes, attendanceRecords, classSessions, classes, coaches } from "@/db/schema";
import { createBearerSupabaseClient, getBearerToken } from "@/lib/supabase/bearer-client";
import { getCurrentProfile } from "@/lib/authz/profile-service";
import { getFamilyChildrenForUser } from "@/lib/family/scope-service";
import { apiError, apiSuccess } from "@/lib/api-response";
import { logger } from "@/lib/logger";

/**
 * GET /api/me/progress?athleteId=<uuid> (bearer / móvil)
 *
 * Asistencia (últimos 30 días) y últimas 5 evaluaciones técnicas de un
 * atleta. Mismo cálculo que my-dashboard web, reexpuesto para bearer:
 *   - athlete: ve su propio progreso (athleteId opcional, se resuelve por
 *     athletes.userId).
 *   - parent: athleteId obligatorio, debe ser uno de sus hijos vinculados
 *     (getFamilyChildrenForUser).
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

    const requestedAthleteId = request.nextUrl.searchParams.get("athleteId");
    let athleteId: string;

    if (profile.role === "athlete") {
      const [athleteRow] = await db
        .select({ id: athletes.id })
        .from(athletes)
        .where(and(eq(athletes.userId, user.id), eq(athletes.tenantId, profile.tenantId)))
        .limit(1);
      if (!athleteRow) {
        return apiSuccess({ attendance: null, assessments: [] });
      }
      if (requestedAthleteId && requestedAthleteId !== athleteRow.id) {
        return apiError("FORBIDDEN", "No tienes acceso a este atleta", 403);
      }
      athleteId = athleteRow.id;
    } else if (profile.role === "parent") {
      if (!requestedAthleteId) {
        return apiError("VALIDATION_ERROR", "athleteId es requerido", 400);
      }
      const children = await getFamilyChildrenForUser({ userId: user.id, email: user.email ?? "" });
      if (!children.some((c) => c.id === requestedAthleteId)) {
        return apiError("FORBIDDEN", "No tienes acceso a este atleta", 403);
      }
      athleteId = requestedAthleteId;
    } else {
      return apiError("FORBIDDEN", "Rol no soportado para esta consulta", 403);
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];
    const todayStr = new Date().toISOString().split("T")[0];

    const attendanceRows = await db
      .select({
        status: attendanceRecords.status,
        sessionDate: classSessions.sessionDate,
        className: classes.name,
      })
      .from(attendanceRecords)
      .leftJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
      .leftJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          eq(attendanceRecords.athleteId, athleteId),
          eq(attendanceRecords.tenantId, profile.tenantId),
          inArray(attendanceRecords.status, ["present", "absent", "excused"]),
          gte(classSessions.sessionDate, thirtyDaysAgoStr),
          lte(classSessions.sessionDate, todayStr)
        )
      )
      .orderBy(classSessions.sessionDate)
      .limit(30);

    const attendance = {
      total: attendanceRows.length,
      present: attendanceRows.filter((r) => r.status === "present").length,
      absent: attendanceRows.filter((r) => r.status === "absent").length,
      excused: attendanceRows.filter((r) => r.status === "excused").length,
      recentRecords: attendanceRows.slice(-5).map((r) => ({
        date: r.sessionDate ?? "",
        status: r.status,
        className: r.className ?? "Clase",
      })),
    };

    const assessmentRows = await db
      .select({
        id: athleteAssessments.id,
        assessmentDate: athleteAssessments.assessmentDate,
        apparatus: athleteAssessments.apparatus,
        overallComment: athleteAssessments.overallComment,
        assessedByName: coaches.name,
      })
      .from(athleteAssessments)
      .leftJoin(coaches, eq(athleteAssessments.assessedBy, coaches.id))
      .where(
        and(
          eq(athleteAssessments.athleteId, athleteId),
          eq(athleteAssessments.tenantId, profile.tenantId)
        )
      )
      .orderBy(desc(athleteAssessments.assessmentDate))
      .limit(5);

    const assessments = assessmentRows.map((a) => ({
      id: a.id,
      assessmentDate: String(a.assessmentDate),
      apparatus: a.apparatus,
      overallComment: a.overallComment ?? null,
      assessedByName: a.assessedByName ?? null,
    }));

    return apiSuccess({ attendance, assessments });
  } catch (error) {
    logger.error("Error fetching /api/me/progress:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
