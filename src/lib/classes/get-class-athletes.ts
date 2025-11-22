/**
 * Helper para obtener la lista completa de atletas de una clase
 * 
 * Combina:
 * 1. Atletas del grupo base (vía classGroups -> groups -> athletes.groupId)
 * 2. Atletas extra (vía classEnrollments)
 * 
 * Retorna lista deduplicada con indicador de origen.
 * 
 * IMPORTANTE: Esta función NO afecta la facturación, que sigue basada en el grupo principal.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { athletes, classEnrollments, classGroups, classes, groups } from "@/db/schema";

export interface ClassAthlete {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
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
  // 1. Verificar que la clase existe y obtener tenantId
  const [classRow] = await db
    .select({
      tenantId: classes.tenantId,
    })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.academyId, academyId)))
    .limit(1);

  if (!classRow) {
    throw new Error(`Clase no encontrada: ${classId}`);
  }

  // 2. Obtener grupos asociados a la clase
  const classGroupRows = await db
    .select({
      groupId: classGroups.groupId,
    })
    .from(classGroups)
    .where(eq(classGroups.classId, classId));

  const groupIdsList = classGroupRows.map((row) => row.groupId);

  // 3. Obtener atletas de esos grupos (grupo base)
  const groupAthletes: ClassAthlete[] = [];
  if (groupIdsList.length > 0) {
    const groupAthleteRows = await db
      .select({
        id: athletes.id,
        name: athletes.name,
        groupId: athletes.groupId,
        groupName: groups.name,
        groupColor: groups.color,
      })
      .from(athletes)
      .leftJoin(groups, eq(athletes.groupId, groups.id))
      .where(
        and(
          eq(athletes.academyId, academyId),
          inArray(athletes.groupId, groupIdsList)
        )
      )
      .orderBy(asc(athletes.name));

    groupAthletes.push(
      ...groupAthleteRows.map((row) => ({
        id: row.id,
        name: row.name,
        groupId: row.groupId,
        groupName: row.groupName,
        groupColor: row.groupColor,
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
    })
    .from(classEnrollments)
    .innerJoin(athletes, eq(classEnrollments.athleteId, athletes.id))
    .leftJoin(groups, eq(athletes.groupId, groups.id))
    .where(
      and(
        eq(classEnrollments.classId, classId),
        eq(classEnrollments.academyId, academyId)
      )
    )
    .orderBy(asc(athletes.name));

  const enrollmentAthletes: ClassAthlete[] = enrollmentRows.map((row) => ({
    id: row.id,
    name: row.name,
    groupId: row.groupId,
    groupName: row.groupName,
    groupColor: row.groupColor,
    origin: "enrollment" as const,
    enrollmentId: row.enrollmentId,
  }));

  // 5. Combinar y deduplicar (Set por athleteId)
  const athleteMap = new Map<string, ClassAthlete>();

  // Primero añadir atletas de grupo (tienen prioridad)
  for (const athlete of groupAthletes) {
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

