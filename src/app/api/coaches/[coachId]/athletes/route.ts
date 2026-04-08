import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  athletes,
  classCoachAssignments,
  classEnrollments,
  classes,
  coaches,
  groupAthletes,
  groups,
} from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";

export const GET = withTenant(async (_request, context) => {
  const coachId = (context.params as { coachId?: string })?.coachId;

  if (!coachId) {
    return apiError("COACH_ID_REQUIRED", "coachId es requerido", 400);
  }

  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "tenantId es requerido", 400);
  }

  // Verificar que el coach existe y pertenece al tenant
  const [coach] = await db
    .select({ tenantId: coaches.tenantId })
    .from(coaches)
    .where(eq(coaches.id, coachId))
    .limit(1);

  if (!coach || coach.tenantId !== context.tenantId) {
    return apiError("COACH_NOT_FOUND", "Coach no encontrado", 404);
  }

  // Obtener clases asignadas al coach
  const assignedClasses = await db
    .select({ classId: classCoachAssignments.classId })
    .from(classCoachAssignments)
    .where(eq(classCoachAssignments.coachId, coachId));

  const assignedClassIds = assignedClasses.map((c) => c.classId);

  // Obtener grupos de esas clases
  let groupIds: string[] = [];
  if (assignedClassIds.length > 0) {
    const classGroups = await db
      .select({ groupId: classes.groupId })
      .from(classes)
      .where(inArray(classes.id, assignedClassIds));

    groupIds = classGroups
      .map((g) => g.groupId)
      .filter((id): id is string => id !== null);
  }

  // Obtener atletas via groupAthletes (pertenencia a grupos del coach)
  let athletesFromGroups: { id: string; name: string; level: string | null; ageCategory: string | null; competitiveLevel: string | null }[] = [];
  if (groupIds.length > 0) {
    const groupAthleteRows = await db
      .select({
        athleteId: groupAthletes.athleteId,
        athleteName: athletes.name,
        athleteLevel: athletes.level,
        athleteAgeCategory: athletes.ageCategory,
        athleteCompetitiveLevel: athletes.competitiveLevel,
      })
      .from(groupAthletes)
      .innerJoin(athletes, eq(groupAthletes.athleteId, athletes.id))
      .where(
        and(
          inArray(groupAthletes.groupId, groupIds),
          isNull(athletes.deletedAt)
        )
      );

    athletesFromGroups = groupAthleteRows.map((a) => ({
      id: a.athleteId,
      name: a.athleteName,
      level: a.athleteLevel,
      ageCategory: a.athleteAgeCategory,
      competitiveLevel: a.athleteCompetitiveLevel,
    }));
  }

  // Obtener atletas inscritos extra en clases del coach (classEnrollments)
  let athletesFromEnrollments: { id: string; name: string; level: string | null; ageCategory: string | null; competitiveLevel: string | null }[] = [];
  if (assignedClassIds.length > 0) {
    const enrollmentRows = await db
      .select({
        athleteId: classEnrollments.athleteId,
        athleteName: athletes.name,
        athleteLevel: athletes.level,
        athleteAgeCategory: athletes.ageCategory,
        athleteCompetitiveLevel: athletes.competitiveLevel,
      })
      .from(classEnrollments)
      .innerJoin(athletes, eq(classEnrollments.athleteId, athletes.id))
      .where(
        and(
          inArray(classEnrollments.classId, assignedClassIds),
          isNull(athletes.deletedAt)
        )
      );

    athletesFromEnrollments = enrollmentRows.map((a) => ({
      id: a.athleteId,
      name: a.athleteName,
      level: a.athleteLevel,
      ageCategory: a.athleteAgeCategory,
      competitiveLevel: a.athleteCompetitiveLevel,
    }));
  }

  // Combinar y deduplicar atletas
  const allAthletesMap = new Map<string, { id: string; name: string; level: string | null; ageCategory: string | null; competitiveLevel: string | null }>();

  [...athletesFromGroups, ...athletesFromEnrollments].forEach((athlete) => {
    if (!allAthletesMap.has(athlete.id)) {
      allAthletesMap.set(athlete.id, athlete);
    }
  });

  const uniqueAthletes = Array.from(allAthletesMap.values());

  return apiSuccess({ items: uniqueAthletes });
});
