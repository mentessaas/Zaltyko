/**
 * Helper para obtener la lista completa de atletas de una clase
 * 
 * Combina:
 * 1. Grupos vinculados por classes.groupId y classGroups.
 * 2. Miembros actuales de groupAthletes y el vínculo legacy athletes.groupId.
 * 3. Atletas extra vía classEnrollments.
 * 
 * Retorna lista deduplicada con indicador de origen.
 * 
 * IMPORTANTE: Esta función NO afecta la facturación, que sigue basada en el grupo principal.
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  athletes,
  classEnrollments,
  classGroups,
  classes,
  groupAthletes as groupAthleteMemberships,
  groups,
} from "@/db/schema";

export interface ClassAthlete {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  primarySportConfigId: string | null;
  groupSportConfigId: string | null;
  origin: "group" | "enrollment"; // De dónde viene la relación
  enrollmentId?: string; // ID del enrollment si origin === "enrollment"
}

/**
 * Obtiene todos los atletas que pertenecen a una clase
 * @param classId ID de la clase
 * @param academyId ID de la academia (para validación)
 * @returns Lista de atletas con información de su grupo principal y origen
 */
export async function getClassAthletes(
  classId: string,
  academyId: string
): Promise<ClassAthlete[]> {
  // 1. Verificar que la clase existe y obtener su scope real.
  const [classRow] = await db
    .select({
      tenantId: classes.tenantId,
      groupId: classes.groupId,
    })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.academyId, academyId)))
    .limit(1);

  if (!classRow) {
    throw new Error(`Clase no encontrada: ${classId}`);
  }

  // 2. Obtener todos los grupos asociados. classes.groupId es el vínculo
  // moderno más usado; classGroups mantiene compatibilidad multi-grupo.
  const classGroupRows = await db
    .select({
      groupId: classGroups.groupId,
    })
    .from(classGroups)
    .where(
      and(
        eq(classGroups.tenantId, classRow.tenantId),
        eq(classGroups.classId, classId)
      )
    );

  const groupIdsList = Array.from(
    new Set(
      [classRow.groupId, ...classGroupRows.map((row) => row.groupId)].filter(
        (groupId): groupId is string => Boolean(groupId)
      )
    )
  );

  // 3. Resolver miembros de grupo desde la tabla many-to-many vigente y
  // desde athletes.groupId para datos legacy todavía válidos.
  const groupedAthletes: ClassAthlete[] = [];
  if (groupIdsList.length > 0) {
    const [membershipRows, legacyRows] = await Promise.all([
      db
        .select({
          id: athletes.id,
          name: athletes.name,
          groupId: groups.id,
          groupName: groups.name,
          groupColor: groups.color,
          primarySportConfigId: athletes.primarySportConfigId,
          groupSportConfigId: groups.sportConfigId,
        })
        .from(groupAthleteMemberships)
        .innerJoin(athletes, eq(groupAthleteMemberships.athleteId, athletes.id))
        .innerJoin(groups, eq(groupAthleteMemberships.groupId, groups.id))
        .where(
          and(
            eq(groupAthleteMemberships.tenantId, classRow.tenantId),
            eq(athletes.tenantId, classRow.tenantId),
            eq(athletes.academyId, academyId),
            eq(groups.tenantId, classRow.tenantId),
            eq(groups.academyId, academyId),
            inArray(groupAthleteMemberships.groupId, groupIdsList),
            isNull(athletes.deletedAt),
            isNull(groups.deletedAt)
          )
        )
        .orderBy(asc(athletes.name)),
      db
        .select({
          id: athletes.id,
          name: athletes.name,
          groupId: athletes.groupId,
          groupName: groups.name,
          groupColor: groups.color,
          primarySportConfigId: athletes.primarySportConfigId,
          groupSportConfigId: groups.sportConfigId,
        })
        .from(athletes)
        .leftJoin(groups, eq(athletes.groupId, groups.id))
        .where(
          and(
            eq(athletes.tenantId, classRow.tenantId),
            eq(athletes.academyId, academyId),
            inArray(athletes.groupId, groupIdsList),
            eq(groups.tenantId, classRow.tenantId),
            eq(groups.academyId, academyId),
            isNull(athletes.deletedAt),
            isNull(groups.deletedAt)
          )
        )
        .orderBy(asc(athletes.name)),
    ]);

    groupedAthletes.push(
      ...[...membershipRows, ...legacyRows].map((row) => ({
        id: row.id,
        name: row.name,
        groupId: row.groupId,
        groupName: row.groupName,
        groupColor: row.groupColor,
        primarySportConfigId: row.primarySportConfigId,
        groupSportConfigId: row.groupSportConfigId,
        origin: "group" as const,
      }))
    );
  }

  // 4. Obtener atletas extra (enrollments)
  const enrollmentRows = await db
    .select({
      enrollmentId: classEnrollments.id,
      id: athletes.id,
      name: athletes.name,
      groupId: athletes.groupId,
      groupName: groups.name,
      groupColor: groups.color,
      primarySportConfigId: athletes.primarySportConfigId,
      groupSportConfigId: groups.sportConfigId,
    })
    .from(classEnrollments)
    .innerJoin(athletes, eq(classEnrollments.athleteId, athletes.id))
    .leftJoin(groups, eq(athletes.groupId, groups.id))
    .where(
      and(
        eq(classEnrollments.tenantId, classRow.tenantId),
        eq(classEnrollments.classId, classId),
        eq(classEnrollments.academyId, academyId),
        eq(athletes.tenantId, classRow.tenantId),
        eq(athletes.academyId, academyId),
        isNull(athletes.deletedAt)
      )
    )
    .orderBy(asc(athletes.name));

  const enrollmentAthletes: ClassAthlete[] = enrollmentRows.map((row) => ({
    id: row.id,
    name: row.name,
    groupId: row.groupId,
    groupName: row.groupName,
    groupColor: row.groupColor,
    primarySportConfigId: row.primarySportConfigId,
    groupSportConfigId: row.groupSportConfigId,
    origin: "enrollment" as const,
    enrollmentId: row.enrollmentId,
  }));

  // 5. Combinar y deduplicar (Set por athleteId)
  const athleteMap = new Map<string, ClassAthlete>();

  // Primero añadir atletas de grupo (tienen prioridad)
  for (const athlete of groupedAthletes) {
    athleteMap.set(athlete.id, athlete);
  }

  // Luego añadir enrollments (solo si no están ya por grupo)
  for (const athlete of enrollmentAthletes) {
    if (!athleteMap.has(athlete.id)) {
      athleteMap.set(athlete.id, athlete);
    }
  }

  // 6. Retornar lista ordenada
  return Array.from(athleteMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}
