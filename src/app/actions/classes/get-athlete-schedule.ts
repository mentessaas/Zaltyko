"use server";

import { cookies } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  athletes,
  athleteExtraClasses,
  classCoachAssignments,
  classEnrollments,
  classGroups,
  classWeekdays,
  classes,
  coaches,
  groupAthletes,
  groups,
} from "@/db/schema";
import { getCurrentProfile, getTenantId } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export interface AthleteScheduleItem {
  id: string;
  name: string;
  type: "base" | "extra";
  startTime: string | null;
  endTime: string | null;
  weekdays: number[];
  coachName: string | null;
  groupName: string | null;
  date?: string; // Para sesiones específicas
}

/**
 * Server action para obtener el horario completo de un atleta
 * 
 * Retorna:
 * - Clases base (del grupo del atleta)
 * - Clases extra (de athlete_extra_classes)
 * 
 * Unificado y ordenado por fecha/hora
 */
export async function getAthleteSchedule(params: {
  athleteId: string;
  academyId: string;
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
}): Promise<{ items: AthleteScheduleItem[]; error?: string }> {
  try {
    const { athleteId, academyId } = params;

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

    // Verificar que el atleta existe
    const [athlete] = await db
      .select({
        id: athletes.id,
        groupId: athletes.groupId,
        academyId: athletes.academyId,
      })
      .from(athletes)
      .where(and(eq(athletes.id, athleteId), eq(athletes.academyId, academyId)))
      .limit(1);

    if (!athlete) {
      return { items: [], error: "ATHLETE_NOT_FOUND" };
    }

    // Resolver todos los grupos del atleta: la M2M group_athletes es la fuente
    // vigente; athletes.group_id se mantiene como fallback legacy. Antes esta
    // acción leía solo athletes.group_id, así que un atleta en varios grupos
    // veía un horario incompleto.
    const memberships = await db
      .select({ groupId: groupAthletes.groupId })
      .from(groupAthletes)
      .where(eq(groupAthletes.athleteId, athleteId));

    const groupIdSet = new Set<string>(memberships.map((row) => row.groupId));
    if (athlete.groupId) {
      groupIdSet.add(athlete.groupId);
    }
    const groupIds = Array.from(groupIdSet);

    interface RawClass {
      id: string;
      name: string | null;
      startTime: unknown;
      endTime: unknown;
      groupName: string | null;
      type: "base" | "extra";
    }

    // Deduplicado por classId; el origen "base" (grupo) tiene prioridad sobre "extra".
    const classesById = new Map<string, RawClass>();
    const addClass = (cls: RawClass) => {
      const existing = classesById.get(cls.id);
      if (!existing || (existing.type === "extra" && cls.type === "base")) {
        classesById.set(cls.id, cls);
      }
    };

    // 1. Clases base de todos los grupos del atleta (class_groups + classes.groupId).
    if (groupIds.length > 0) {
      const [baseViaTable, baseViaDirect] = await Promise.all([
        db
          .select({
            id: classes.id,
            name: classes.name,
            startTime: classes.startTime,
            endTime: classes.endTime,
            groupName: groups.name,
          })
          .from(classes)
          .innerJoin(classGroups, eq(classes.id, classGroups.classId))
          .innerJoin(groups, eq(classGroups.groupId, groups.id))
          .where(
            and(
              inArray(classGroups.groupId, groupIds),
              eq(classes.academyId, academyId),
              eq(classes.isExtra, false)
            )
          ),
        db
          .select({
            id: classes.id,
            name: classes.name,
            startTime: classes.startTime,
            endTime: classes.endTime,
            groupName: groups.name,
          })
          .from(classes)
          .innerJoin(groups, eq(classes.groupId, groups.id))
          .where(
            and(
              inArray(classes.groupId, groupIds),
              eq(classes.academyId, academyId),
              eq(classes.isExtra, false)
            )
          ),
      ]);

      [...baseViaTable, ...baseViaDirect].forEach((cls) =>
        addClass({ ...cls, type: "base" })
      );
    }

    // 2. Clases donde el atleta está inscrito como extra (class_enrollments).
    const enrollmentClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
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

    enrollmentClasses.forEach((cls) =>
      addClass({ ...cls, groupName: null, type: "extra" })
    );

    // 3. Clases extra individuales (athlete_extra_classes).
    const extraClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        startTime: classes.startTime,
        endTime: classes.endTime,
      })
      .from(athleteExtraClasses)
      .innerJoin(classes, eq(athleteExtraClasses.classId, classes.id))
      .where(
        and(
          eq(athleteExtraClasses.athleteId, athleteId),
          eq(athleteExtraClasses.academyId, academyId)
        )
      );

    extraClasses.forEach((cls) =>
      addClass({ ...cls, groupName: null, type: "extra" })
    );

    // 4. Enriquecer cada clase con sus weekdays y su coach asignado.
    const scheduleItems: AthleteScheduleItem[] = [];
    for (const cls of classesById.values()) {
      const [weekdays, coachAssignment] = await Promise.all([
        db
          .select({ weekday: classWeekdays.weekday })
          .from(classWeekdays)
          .where(eq(classWeekdays.classId, cls.id)),
        db
          .select({ coachName: coaches.name })
          .from(classCoachAssignments)
          .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
          .where(eq(classCoachAssignments.classId, cls.id))
          .limit(1),
      ]);

      scheduleItems.push({
        id: cls.id,
        name: cls.name ?? "Clase sin nombre",
        type: cls.type,
        startTime: cls.startTime ? String(cls.startTime) : null,
        endTime: cls.endTime ? String(cls.endTime) : null,
        weekdays: weekdays.map((w) => w.weekday),
        coachName: coachAssignment[0]?.coachName ?? null,
        groupName: cls.groupName ?? null,
      });
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
    logger.error("Error en getAthleteSchedule:", error);
    // Si el error es porque las columnas no existen (migraciones no aplicadas),
    // retornar un mensaje más claro
    if (error.message?.includes("is_extra") || error.message?.includes("column") || error.message?.includes("does not exist")) {
      return { 
        items: [], 
        error: "Las migraciones de base de datos no se han aplicado. Por favor, aplica las migraciones SQL (0029, 0030, 0031, 0032) en Supabase." 
      };
    }
    return { items: [], error: error.message ?? "Error al obtener el horario del atleta" };
  }
}

