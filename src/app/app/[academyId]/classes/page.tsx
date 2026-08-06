import { notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Dumbbell } from "lucide-react";

import { db } from "@/db";
import {
  academies,
  classCoachAssignments,
  classEnrollments,
  classGroups,
  classWeekdays,
  classes,
  coaches,
  coachSportConfigs,
  groupAthletes,
  groups,
} from "@/db/schema";

import { ClassesDashboard } from "@/components/classes/ClassesDashboard";
import { PageHeader } from "@/components/ui/page-header";
import { pluralizeFirstWord, resolveAcademySpecialization } from "@/lib/specialization/registry";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";

/**
 * AcademyClassesPage - Vista principal de gestión de clases y sesiones
 * 
 * Permite crear, listar y gestionar clases con sus horarios, entrenadores asignados
 * y grupos vinculados. Incluye acceso a creación y edición de clases.
 */
interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AcademyClassesPage({ params, searchParams }: PageProps) {
  const { academyId } = await params;
  const resolvedSearchParams = await searchParams;

  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      tenantId: academies.tenantId,
      academyType: academies.academyType,
      country: academies.country,
      countryCode: academies.countryCode,
      discipline: academies.discipline,
      disciplineVariant: academies.disciplineVariant,
      federationConfigVersion: academies.federationConfigVersion,
      specializationStatus: academies.specializationStatus,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }

  const specialization = resolveAcademySpecialization(academy);

  const query =
    typeof resolvedSearchParams.q === "string" && resolvedSearchParams.q.trim().length > 0
      ? resolvedSearchParams.q.trim()
      : undefined;

  const groupFilter =
    typeof resolvedSearchParams.group === "string" && resolvedSearchParams.group.trim().length > 0
      ? resolvedSearchParams.group.trim()
      : undefined;

  const focusClassId =
    typeof resolvedSearchParams.focusClass === "string" && resolvedSearchParams.focusClass.trim().length > 0
      ? resolvedSearchParams.focusClass.trim()
      : undefined;

  const conditions = [
    eq(classes.academyId, academyId),
    query
      ? or(ilike(classes.name, `%${query}%`), ilike(classes.startTime, `%${query}%`))
      : undefined,
  ].filter(Boolean) as any[];

  const whereClause = conditions.reduce<any>(
    (accumulator, condition) => (accumulator ? and(accumulator, condition) : condition),
    undefined
  );

  const classRows = await db
    .select({
      id: classes.id,
      name: classes.name,
      academyId: classes.academyId,
    })
    .from(classes)
    .where(whereClause)
    .orderBy(asc(classes.name));

  const classIds = classRows.map((item) => item.id);
  const weekdayRows =
    classIds.length === 0
      ? []
      : await db
          .select({
            classId: classWeekdays.classId,
            weekday: classWeekdays.weekday,
          })
          .from(classWeekdays)
          .where(inArray(classWeekdays.classId, classIds));

  const weekdayMap = new Map<string, number[]>();
  weekdayRows.forEach((row) => {
    const current = weekdayMap.get(row.classId) ?? [];
    current.push(row.weekday);
    weekdayMap.set(row.classId, current);
  });
  weekdayMap.forEach((list, key) => {
    list.sort((a, b) => a - b);
    weekdayMap.set(key, list);
  });

  const assignmentRows = await db
    .select({
      classId: classCoachAssignments.classId,
      coachId: coaches.id,
      coachName: coaches.name,
      coachEmail: coaches.email,
    })
    .from(classCoachAssignments)
    .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
    .where(eq(classCoachAssignments.tenantId, academy.tenantId))
    .orderBy(asc(coaches.name));

  const coachRows = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
      academyId: coaches.academyId,
    })
    .from(coaches)
    .where(eq(coaches.academyId, academyId))
    .orderBy(asc(coaches.name));
  const coachScopeRows =
    coachRows.length === 0
      ? []
      : await db
          .select({
            coachId: coachSportConfigs.coachId,
            sportConfigId: coachSportConfigs.academySportConfigId,
          })
          .from(coachSportConfigs)
          .where(inArray(coachSportConfigs.coachId, coachRows.map((coach) => coach.id)));
  const sportConfigIdsByCoach = new Map<string, string[]>();
  coachScopeRows.forEach((row) => {
    const current = sportConfigIdsByCoach.get(row.coachId) ?? [];
    current.push(row.sportConfigId);
    sportConfigIdsByCoach.set(row.coachId, current);
  });

  const groupRows = await db
    .select({
      id: groups.id,
      name: groups.name,
      color: groups.color,
      coachId: groups.coachId,
      assistantIds: groups.assistantIds,
    })
    .from(groups)
    .where(eq(groups.academyId, academyId))
    .orderBy(asc(groups.name));

  const groupByCoach = new Map<string, { id: string; name: string; color: string | null; sportConfigId: string | null }[]>();
  groupRows.forEach((group) => {
    const groupItem = {
      id: group.id,
      name: group.name ?? "Grupo sin nombre",
      color: group.color ?? null,
      sportConfigId: null,
    };
    if (group.coachId) {
      const existing = groupByCoach.get(group.coachId) ?? [];
      if (!existing.some((entry) => entry.id === groupItem.id)) {
        existing.push(groupItem);
      }
      groupByCoach.set(group.coachId, existing);
    }
    if (Array.isArray(group.assistantIds)) {
      group.assistantIds.forEach((assistantId) => {
        const existing = groupByCoach.get(assistantId) ?? [];
        if (!existing.some((entry) => entry.id === groupItem.id)) {
          existing.push(groupItem);
        }
        groupByCoach.set(assistantId, existing);
      });
    }
  });

  // Obtener grupos asignados directamente a las clases
  const classGroupRows =
    classIds.length === 0
      ? []
      : await db
          .select({
            classId: classGroups.classId,
            groupId: groups.id,
            groupName: groups.name,
            groupColor: groups.color,
          })
          .from(classGroups)
          .innerJoin(groups, eq(classGroups.groupId, groups.id))
          .where(inArray(classGroups.classId, classIds));

  const classGroupsMap = new Map<string, { id: string; name: string; color: string | null; sportConfigId: string | null }[]>();
  classGroupRows.forEach((row) => {
    const existing = classGroupsMap.get(row.classId) ?? [];
    existing.push({
      id: row.groupId,
      name: row.groupName ?? "Grupo sin nombre",
      color: row.groupColor ?? null,
      sportConfigId: null,
    });
    classGroupsMap.set(row.classId, existing);
  });

  // Obtener conteo de atletas por clase (de grupos y enrollments)
  const athleteCounts: Record<string, number> = {};

  // Atletas de grupos
  if (groupRows.length > 0 && classIds.length > 0) {
    const groupIds = groupRows.map((g) => g.id);
    const athleteFromGroups = await db
      .select({
        classId: classGroups.classId,
        count: sql<number>`count(distinct ${groupAthletes.athleteId})::int`.as("count"),
      })
      .from(classGroups)
      .innerJoin(groupAthletes, eq(classGroups.groupId, groupAthletes.groupId))
      .where(
        and(
          inArray(classGroups.classId, classIds),
          inArray(groupAthletes.groupId, groupIds)
        )
      )
      .groupBy(classGroups.classId);

    athleteFromGroups.forEach((row) => {
      athleteCounts[row.classId] = (athleteCounts[row.classId] || 0) + row.count;
    });
  }

  // Atletas extra (enrollments)
  if (classIds.length > 0) {
    const extraAthletes = await db
      .select({
        classId: classEnrollments.classId,
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(classEnrollments)
      .where(inArray(classEnrollments.classId, classIds))
      .groupBy(classEnrollments.classId);

    extraAthletes.forEach((row) => {
      athleteCounts[row.classId] = (athleteCounts[row.classId] || 0) + row.count;
    });
  }

  const classesList = classRows
    .map((item) => {
      const classCoaches = assignmentRows.filter((assignment) => assignment.classId === item.id);
      // Obtener grupos asignados directamente a la clase
      const directGroups = classGroupsMap.get(item.id) ?? [];
      
      // También incluir grupos vinculados a través de entrenadores (para retrocompatibilidad)
      const linkedGroupsMap = new Map<string, { id: string; name: string; color: string | null; sportConfigId: string | null }>();
      directGroups.forEach((group) => {
        linkedGroupsMap.set(group.id, group);
      });
      
      classCoaches.forEach((assignment) => {
        const related = groupByCoach.get(assignment.coachId) ?? [];
        related.forEach((group) => {
          linkedGroupsMap.set(group.id, group);
        });
      });

      const linkedGroups = Array.from(linkedGroupsMap.values());

      return {
        id: item.id,
        name: item.name,
        weekdays: (weekdayMap.get(item.id) ?? []).sort((a, b) => a - b),
        startTime: null,
        endTime: null,
        capacity: null,
        technicalFocus: null,
        apparatus: [],
        sportConfigId: null,
        isExtra: false,
        autoGenerateSessions: false,
        allowsFreeTrial: false,
        waitingListEnabled: false,
        cancellationHoursBefore: 24,
        cancellationPolicy: "standard",
        currentEnrollment: athleteCounts[item.id] ?? 0,
        createdAt: null,
        coaches: classCoaches.map((assignment) => ({
          id: assignment.coachId,
          name: assignment.coachName,
          email: assignment.coachEmail,
        })),
        groups: linkedGroups,
      };
    })
    .filter((item) => {
      if (!groupFilter) return true;
      return item.groups.some((group) => group.id === groupFilter);
    });

  const availableCoaches = coachRows.map((entry) => ({
    id: entry.id,
    name: entry.name ?? "Sin nombre",
    email: entry.email ?? null,
    sportConfigIds: sportConfigIdsByCoach.get(entry.id) ?? [],
  }));

  const groupOptions = groupRows.map((group) => ({
    id: group.id,
    name: group.name ?? "Grupo sin nombre",
    color: group.color ?? null,
    sportConfigId: null,
  }));

  const sportConfigs = await getAcademySportConfigOptions(academyId);
  const classLabelPlural = pluralizeFirstWord(specialization.labels.classLabel);
  const coachLabelPlural = pluralizeFirstWord(specialization.labels.coachLabel);
  const sessionLabelPlural = pluralizeFirstWord(specialization.labels.sessionLabel);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: `/app/${academy.id}/dashboard` },
          { label: academy.name ?? "Academia", href: `/app/${academy.id}/dashboard` },
          { label: classLabelPlural },
        ]}
        title={classLabelPlural}
        description={`Organiza tus ${classLabelPlural.toLowerCase()}, coordina ${coachLabelPlural.toLowerCase()} y prepara ${sessionLabelPlural.toLowerCase()} con facilidad.`}
        icon={<Dumbbell className="h-5 w-5" strokeWidth={1.5} />}
      />

      <ClassesDashboard
        academyId={academy.id}
        initialClasses={classesList}
        availableCoaches={availableCoaches}
        groupOptions={groupOptions}
        sportConfigs={sportConfigs}
        initialFocusClassId={focusClassId}
      />
    </div>
  );
}
