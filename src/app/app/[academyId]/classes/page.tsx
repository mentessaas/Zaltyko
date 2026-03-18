import { notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Dumbbell } from "lucide-react";

import { db } from "@/db";
import {
  academies,
  athletes,
  classCoachAssignments,
  classEnrollments,
  classGroups,
  classWeekdays,
  classes,
  coaches,
  groups,
} from "@/db/schema";

import { ClassesClientView } from "@/components/classes/ClassesClientView";
import { PageHeader } from "@/components/ui/page-header";

/**
 * AcademyClassesPage - Vista principal de gestión de clases y sesiones
 * 
 * Permite crear, listar y gestionar clases con sus horarios, entrenadores asignados
 * y grupos vinculados. Incluye acceso a creación y edición de clases.
 */
interface PageProps {
  params: {
    academyId: string;
  };
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function AcademyClassesPage({ params, searchParams }: PageProps) {
  const { academyId } = params;

  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      tenantId: academies.tenantId,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }

  const query =
    typeof searchParams.q === "string" && searchParams.q.trim().length > 0
      ? searchParams.q.trim()
      : undefined;

  const groupFilter =
    typeof searchParams.group === "string" && searchParams.group.trim().length > 0
      ? searchParams.group.trim()
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
      startTime: classes.startTime,
      endTime: classes.endTime,
      capacity: classes.capacity,
      autoGenerateSessions: classes.autoGenerateSessions,
      allowsFreeTrial: classes.allowsFreeTrial,
      waitingListEnabled: classes.waitingListEnabled,
      cancellationHoursBefore: classes.cancellationHoursBefore,
      cancellationPolicy: classes.cancellationPolicy,
      createdAt: classes.createdAt,
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

  const groupByCoach = new Map<string, { id: string; name: string; color: string | null }[]>();
  groupRows.forEach((group) => {
    const groupItem = {
      id: group.id,
      name: group.name ?? "Grupo sin nombre",
      color: group.color ?? null,
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

  const classGroupsMap = new Map<string, { id: string; name: string; color: string | null }[]>();
  classGroupRows.forEach((row) => {
    const existing = classGroupsMap.get(row.classId) ?? [];
    existing.push({
      id: row.groupId,
      name: row.groupName ?? "Grupo sin nombre",
      color: row.groupColor ?? null,
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
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(classGroups)
      .innerJoin(athletes, eq(classGroups.groupId, athletes.groupId))
      .where(
        and(
          inArray(classGroups.classId, classIds),
          inArray(athletes.groupId, groupIds)
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
      const linkedGroupsMap = new Map<string, { id: string; name: string; color: string | null }>();
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
        startTime: item.startTime,
        endTime: item.endTime,
        capacity: item.capacity,
        autoGenerateSessions: item.autoGenerateSessions,
        allowsFreeTrial: item.allowsFreeTrial ?? false,
        waitingListEnabled: item.waitingListEnabled ?? false,
        cancellationHoursBefore: item.cancellationHoursBefore ?? 24,
        cancellationPolicy: item.cancellationPolicy ?? "standard",
        currentEnrollment: athleteCounts[item.id] ?? 0,
        createdAt: item.createdAt ? item.createdAt.toISOString() : null,
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
  }));

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: academy.name ?? "Academia", href: `/app/${academy.id}/dashboard` },
          { label: "Clases" },
        ]}
        title="Clases"
        description="Organiza tus clases, gestiona entrenadores y prepara sesiones con facilidad."
        icon={<Dumbbell className="h-5 w-5" strokeWidth={1.5} />}
      />

      <ClassesClientView
        academyId={academy.id}
        classes={classesList}
        availableCoaches={availableCoaches}
        groupOptions={groupRows.map((group) => ({
          id: group.id,
          name: group.name ?? "Grupo sin nombre",
          color: group.color ?? null,
        }))}
        filters={{ q: query, groupId: groupFilter }}
      />
    </div>
  );
}


