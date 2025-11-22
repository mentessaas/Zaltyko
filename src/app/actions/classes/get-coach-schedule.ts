"use server";

import { cookies } from "next/headers";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  classCoachAssignments,
  classGroups,
  classSessions,
  classWeekdays,
  classes,
  coaches,
  groups,
} from "@/db/schema";
import { getCurrentProfile, getTenantId } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export interface CoachScheduleItem {
  id: string;
  name: string;
  type: "base" | "extra";
  startTime: string | null;
  endTime: string | null;
  weekdays: number[];
  groupName: string | null;
  date?: string; // Para sesiones específicas
}

/**
 * Server action para obtener el horario completo de un entrenador
 * 
 * Retorna todas las clases del entrenador (base + extra)
 * Ordenadas por fecha/hora
 */
export async function getCoachSchedule(params: {
  coachId: string;
  academyId: string;
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
}): Promise<{ items: CoachScheduleItem[]; error?: string }> {
  try {
    const { coachId, academyId, startDate, endDate } = params;

    // Obtener usuario actual
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { items: [], error: "UNAUTHENTICATED" };
    }

    const profile = await getCurrentProfile(user.id);
    if (!profile) {
      return { items: [], error: "PROFILE_NOT_FOUND" };
    }

    const tenantId = await getTenantId(user.id, academyId);
    if (!tenantId) {
      return { items: [], error: "TENANT_REQUIRED" };
    }

    // Verificar acceso
    const academyAccess = await verifyAcademyAccess(academyId, tenantId);
    if (!academyAccess.allowed) {
      return { items: [], error: "ACADEMY_ACCESS_DENIED" };
    }

    // Verificar que el entrenador existe
    const [coach] = await db
      .select({
        id: coaches.id,
        academyId: coaches.academyId,
      })
      .from(coaches)
      .where(and(eq(coaches.id, coachId), eq(coaches.academyId, academyId)))
      .limit(1);

    if (!coach) {
      return { items: [], error: "COACH_NOT_FOUND" };
    }

    // Obtener todas las clases asignadas al entrenador
    const coachClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        startTime: classes.startTime,
        endTime: classes.endTime,
        isExtra: classes.isExtra,
        groupId: classes.groupId,
        groupName: groups.name,
      })
      .from(classCoachAssignments)
      .innerJoin(classes, eq(classCoachAssignments.classId, classes.id))
      .leftJoin(classGroups, eq(classes.id, classGroups.classId))
      .leftJoin(groups, eq(classGroups.groupId, groups.id))
      .where(
        and(
          eq(classCoachAssignments.coachId, coachId),
          eq(classes.academyId, academyId)
        )
      );

    const scheduleItems: CoachScheduleItem[] = [];

    // Procesar cada clase
    for (const cls of coachClasses) {
      const weekdays = await db
        .select({ weekday: classWeekdays.weekday })
        .from(classWeekdays)
        .where(eq(classWeekdays.classId, cls.id));

      scheduleItems.push({
        id: cls.id,
        name: cls.name ?? "Clase sin nombre",
        type: cls.isExtra ? "extra" : "base",
        startTime: cls.startTime ? String(cls.startTime) : null,
        endTime: cls.endTime ? String(cls.endTime) : null,
        weekdays: weekdays.map((w) => w.weekday),
        groupName: cls.groupName ?? null,
      });
    }

    // Si hay filtros de fecha, también obtener sesiones específicas
    if (startDate || endDate) {
      const classIds = scheduleItems.map((item) => item.id);
      if (classIds.length > 0) {
        const sessionConditions = [
          eq(classSessions.classId, classes.id),
          startDate ? gte(classSessions.sessionDate, startDate) : undefined,
          endDate ? lte(classSessions.sessionDate, endDate) : undefined,
        ].filter(Boolean);

        // Aquí podríamos añadir sesiones específicas si es necesario
      }
    }

    // Ordenar por tipo (base primero) y luego por hora
    scheduleItems.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "base" ? -1 : 1;
      }
      if (a.startTime && b.startTime) {
        return a.startTime.localeCompare(b.startTime);
      }
      return 0;
    });

    return { items: scheduleItems };
  } catch (error: any) {
    console.error("Error en getCoachSchedule:", error);
    return { items: [], error: error.message ?? "Error al obtener el horario del entrenador" };
  }
}

