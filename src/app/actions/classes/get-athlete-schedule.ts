"use server";

import { cookies } from "next/headers";
import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  athletes,
  athleteExtraClasses,
  classCoachAssignments,
  classGroups,
  classSessions,
  classWeekdays,
  classes,
  coaches,
  classEnrollments,
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
    const { athleteId, academyId, startDate, endDate } = params;

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
        tenantId: athletes.tenantId,
      })
      .from(athletes)
      .where(
        and(
          eq(athletes.id, athleteId),
          eq(athletes.academyId, academyId),
          eq(athletes.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!athlete) {
      return { items: [], error: "ATHLETE_NOT_FOUND" };
    }

    const scheduleItems: AthleteScheduleItem[] = [];

    const membershipRows = await db
      .select({ groupId: groupAthletes.groupId })
      .from(groupAthletes)
      .where(
        and(
          eq(groupAthletes.athleteId, athleteId),
          eq(groupAthletes.tenantId, tenantId)
        )
      )
      .limit(100);
    const effectiveGroupIds = Array.from(
      new Set(
        [athlete.groupId, ...membershipRows.map((row) => row.groupId)].filter(
          (id): id is string => Boolean(id)
        )
      )
    );

    // 1. Obtener clases base de todas las membresías efectivas del atleta.
    // Las clases base pueden estar relacionadas de dos formas:
    // - A través de class_groups (tabla intermedia)
    // - A través de classes.groupId (campo directo)
    if (effectiveGroupIds.length > 0) {
      // Obtener clases a través de class_groups
      const baseClassesViaTable = await db
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
            inArray(classGroups.groupId, effectiveGroupIds),
            eq(classGroups.tenantId, tenantId),
            eq(classes.tenantId, tenantId),
            eq(classes.academyId, academyId),
            eq(classes.isExtra, false) // Solo clases base
          )
        )
        .limit(500);

      // Obtener clases a través de groupId directo
      const baseClassesViaDirect = await db
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
            inArray(classes.groupId, effectiveGroupIds),
            eq(classes.tenantId, tenantId),
            eq(groups.tenantId, tenantId),
            eq(classes.academyId, academyId),
            eq(classes.isExtra, false) // Solo clases base
          )
        )
        .limit(500);

      // Combinar y deduplicar por ID
      const allBaseClasses = new Map<string, (typeof baseClassesViaTable)[0]>();
      baseClassesViaTable.forEach((cls) => {
        allBaseClasses.set(cls.id, cls);
      });
      baseClassesViaDirect.forEach((cls) => {
        if (!allBaseClasses.has(cls.id)) {
          allBaseClasses.set(cls.id, cls);
        }
      });

      const baseClasses = Array.from(allBaseClasses.values());

      // Obtener weekdays y coaches para cada clase base
      for (const cls of baseClasses) {
        const weekdays = await db
          .select({ weekday: classWeekdays.weekday })
          .from(classWeekdays)
          .where(eq(classWeekdays.classId, cls.id))
          .limit(7);

        const [coachAssignment] = await db
          .select({ coachName: coaches.name })
          .from(classCoachAssignments)
          .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
          .where(
            and(
              eq(classCoachAssignments.classId, cls.id),
              eq(classCoachAssignments.tenantId, tenantId),
              eq(coaches.tenantId, tenantId)
            )
          )
          .limit(1);

        scheduleItems.push({
          id: cls.id,
          name: cls.name ?? "Clase sin nombre",
          type: "base",
          startTime: cls.startTime ? String(cls.startTime) : null,
          endTime: cls.endTime ? String(cls.endTime) : null,
          weekdays: weekdays.map((w) => w.weekday),
          coachName: coachAssignment?.coachName ?? null,
          groupName: cls.groupName ?? null,
        });
      }
    }

    // 2. Obtener clases extra
    const legacyExtraClasses = await db
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
          eq(athleteExtraClasses.academyId, academyId),
          eq(athleteExtraClasses.tenantId, tenantId),
          eq(classes.tenantId, tenantId)
        )
      )
      .limit(500);

    const enrollmentExtraClasses = await db
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
          eq(classEnrollments.academyId, academyId),
          eq(classEnrollments.tenantId, tenantId),
          eq(classes.tenantId, tenantId)
        )
      )
      .limit(500);
    const extraClasses = Array.from(
      new Map(
        [...legacyExtraClasses, ...enrollmentExtraClasses].map((cls) => [
          cls.id,
          cls,
        ])
      ).values()
    );

    // Obtener weekdays y coaches para cada clase extra
    for (const cls of extraClasses) {
      const weekdays = await db
        .select({ weekday: classWeekdays.weekday })
        .from(classWeekdays)
        .where(
          and(
            eq(classWeekdays.classId, cls.id),
            eq(classWeekdays.tenantId, tenantId)
          )
        )
        .limit(7);

      const [coachAssignment] = await db
        .select({ coachName: coaches.name })
        .from(classCoachAssignments)
        .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
        .where(
          and(
            eq(classCoachAssignments.classId, cls.id),
            eq(classCoachAssignments.tenantId, tenantId),
            eq(coaches.tenantId, tenantId)
          )
        )
        .limit(1);

      scheduleItems.push({
        id: cls.id,
        name: cls.name ?? "Clase sin nombre",
        type: "extra",
        startTime: cls.startTime ? String(cls.startTime) : null,
        endTime: cls.endTime ? String(cls.endTime) : null,
        weekdays: weekdays.map((w) => w.weekday),
        coachName: coachAssignment?.coachName ?? null,
        groupName: null,
      });
    }

    // 3. Si hay filtros de fecha, también obtener sesiones específicas
    if (startDate || endDate) {
      const sessionConditions = [
        eq(classSessions.classId, classes.id),
        startDate ? gte(classSessions.sessionDate, startDate) : undefined,
        endDate ? lte(classSessions.sessionDate, endDate) : undefined,
      ].filter(Boolean);

      // Obtener sesiones de clases base
      if (athlete.groupId) {
        const baseClassIds = scheduleItems
          .filter((item) => item.type === "base")
          .map((item) => item.id);
        if (baseClassIds.length > 0) {
          // Aquí podríamos añadir sesiones específicas si es necesario
        }
      }

      // Obtener sesiones de clases extra
      const extraClassIds = scheduleItems
        .filter((item) => item.type === "extra")
        .map((item) => item.id);
      if (extraClassIds.length > 0) {
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
    logger.error("Error en getAthleteSchedule:", error);
    // Si el error es porque las columnas no existen (migraciones no aplicadas),
    // retornar un mensaje más claro
    if (
      error.message?.includes("is_extra") ||
      error.message?.includes("column") ||
      error.message?.includes("does not exist")
    ) {
      return {
        items: [],
        error:
          "Las migraciones de base de datos no se han aplicado. Por favor, aplica las migraciones SQL (0029, 0030, 0031, 0032) en Supabase.",
      };
    }
    return {
      items: [],
      error: error.message ?? "Error al obtener el horario del atleta",
    };
  }
}
