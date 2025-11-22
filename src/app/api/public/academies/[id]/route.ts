import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { academies, classes, classWeekdays, groups } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/public/academies/[id]
 * 
 * Obtiene los detalles públicos de una academia específica.
 * Endpoint público (sin autenticación requerida).
 * 
 * Incluye:
 * - Información básica de la academia
 * - Horarios públicos del grupo principal (solo títulos y días, sin datos privados)
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Obtener academia pública
    const [academy] = await db
      .select({
        id: academies.id,
        name: academies.name,
        academyType: academies.academyType,
        country: academies.country,
        region: academies.region,
        city: academies.city,
        publicDescription: academies.publicDescription,
        logoUrl: academies.logoUrl,
      })
      .from(academies)
      .where(
        and(
          eq(academies.id, id),
          eq(academies.isPublic, true),
          eq(academies.isSuspended, false)
        )
      )
      .limit(1);

    if (!academy) {
      return NextResponse.json(
        { error: "ACADEMY_NOT_FOUND", message: "Academia no encontrada o no pública" },
        { status: 404 }
      );
    }

    // Obtener horarios públicos del grupo principal
    // Nota: Por ahora solo obtenemos clases base (no extra) del primer grupo
    // Esto puede expandirse en el futuro para mostrar más información
    const publicSchedule = await db
      .select({
        className: classes.name,
        weekday: classWeekdays.weekday,
        startTime: classes.startTime,
        endTime: classes.endTime,
      })
      .from(classes)
      .innerJoin(classWeekdays, eq(classes.id, classWeekdays.classId))
      .where(
        and(
          eq(classes.academyId, id),
          eq(classes.isExtra, false) // Solo clases base, no extra
        )
      )
      .limit(20); // Limitar a 20 clases para evitar exponer demasiada información

    // Agrupar horarios por día de la semana
    const scheduleByDay: Record<number, Array<{ name: string; startTime: string | null; endTime: string | null }>> = {};
    
    for (const schedule of publicSchedule) {
      const weekday = schedule.weekday ?? 0;
      if (!scheduleByDay[weekday]) {
        scheduleByDay[weekday] = [];
      }
      scheduleByDay[weekday].push({
        name: schedule.className ?? "Clase",
        startTime: schedule.startTime ? String(schedule.startTime) : null,
        endTime: schedule.endTime ? String(schedule.endTime) : null,
      });
    }

    return NextResponse.json({
      ...academy,
      schedule: scheduleByDay,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/public/academies/[id]", method: "GET" });
  }
}

