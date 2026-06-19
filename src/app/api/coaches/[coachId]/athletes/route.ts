import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  athletes,
  classCoachAssignments,
  classEnrollments,
  classGroups,
  classes,
  coaches,
  groupAthletes,
  groups,
} from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getCoachSportConfigIds } from "@/lib/coaches/sport-scope";

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
    .select({ tenantId: coaches.tenantId, academyId: coaches.academyId })
    .from(coaches)
    .where(eq(coaches.id, coachId))
    .limit(1);

  if (!coach || coach.tenantId !== context.tenantId) {
    return apiError("COACH_NOT_FOUND", "Coach no encontrado", 404);
  }

  // Obtener clases asignadas al coach
  const scopeIds = await getCoachSportConfigIds(coachId, context.tenantId);
  const scopeSet = new Set(scopeIds);
  const isInScope = (sportConfigId: string | null) => scopeSet.size === 0 || !sportConfigId || scopeSet.has(sportConfigId);

  const assignedClasses = await db
    .select({ classId: classCoachAssignments.classId, sportConfigId: classes.sportConfigId })
    .from(classCoachAssignments)
    .innerJoin(classes, eq(classCoachAssignments.classId, classes.id))
    .where(and(eq(classCoachAssignments.coachId, coachId), eq(classes.academyId, coach.academyId)));

  const assignedClassIds = assignedClasses.filter((c) => isInScope(c.sportConfigId)).map((c) => c.classId);

  // Obtener grupos de esas clases
  let groupIds: string[] = [];
  if (assignedClassIds.length > 0) {
    const linkedClassGroups = await db
      .select({ groupId: classGroups.groupId, sportConfigId: groups.sportConfigId })
      .from(classGroups)
      .innerJoin(groups, eq(classGroups.groupId, groups.id))
      .where(inArray(classGroups.classId, assignedClassIds));

    groupIds = linkedClassGroups
      .filter((g) => isInScope(g.sportConfigId))
      .map((g) => g.groupId)
      .filter((id): id is string => id !== null);
  }

  // Obtener atletas via groupAthletes (pertenencia a grupos del coach)
  let athletesFromGroups: { id: string; name: string; level: string | null; ageCategory: string | null; competitiveLevel: string | null; sportConfigId: string | null }[] = [];
  if (groupIds.length > 0) {
    const groupAthleteRows = await db
      .select({
        athleteId: groupAthletes.athleteId,
        athleteName: athletes.name,
        athleteLevel: athletes.level,
        athleteAgeCategory: athletes.ageCategory,
        athleteCompetitiveLevel: athletes.competitiveLevel,
        athleteSportConfigId: athletes.primarySportConfigId,
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
      sportConfigId: a.athleteSportConfigId,
    }));
  }

  // Obtener atletas inscritos extra en clases del coach (classEnrollments)
  let athletesFromEnrollments: { id: string; name: string; level: string | null; ageCategory: string | null; competitiveLevel: string | null; sportConfigId: string | null }[] = [];
  if (assignedClassIds.length > 0) {
    const enrollmentRows = await db
      .select({
        athleteId: classEnrollments.athleteId,
        athleteName: athletes.name,
        athleteLevel: athletes.level,
        athleteAgeCategory: athletes.ageCategory,
        athleteCompetitiveLevel: athletes.competitiveLevel,
        athleteSportConfigId: athletes.primarySportConfigId,
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
      sportConfigId: a.athleteSportConfigId,
    }));
  }

  // Combinar y deduplicar atletas
  const allAthletesMap = new Map<string, { id: string; name: string; level: string | null; ageCategory: string | null; competitiveLevel: string | null; sportConfigId: string | null }>();

  [...athletesFromGroups, ...athletesFromEnrollments].forEach((athlete) => {
    if (isInScope(athlete.sportConfigId) && !allAthletesMap.has(athlete.id)) {
      allAthletesMap.set(athlete.id, athlete);
    }
  });

  const uniqueAthletes = Array.from(allAthletesMap.values());

  return apiSuccess({ items: uniqueAthletes });
});
