import { notFound } from "next/navigation";
import { and, asc, eq, ilike, or } from "drizzle-orm";

import { db } from "@/db";
import { academies, classCoachAssignments, classes, coaches, groups } from "@/db/schema";

import { ClassesTableView } from "@/components/classes/ClassesTableView";

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
      weekday: classes.weekday,
      startTime: classes.startTime,
      endTime: classes.endTime,
      capacity: classes.capacity,
      createdAt: classes.createdAt,
    })
    .from(classes)
    .where(whereClause)
    .orderBy(asc(classes.name));

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

  const classesList = classRows
    .map((item) => {
      const classCoaches = assignmentRows.filter((assignment) => assignment.classId === item.id);
      const linkedGroupsMap = new Map<string, { id: string; name: string; color: string | null }>();

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
        weekday: item.weekday,
        startTime: item.startTime,
        endTime: item.endTime,
        capacity: item.capacity,
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
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Clases</h1>
        <p className="text-sm text-muted-foreground">
          Organiza tus clases, gestiona entrenadores y prepara sesiones con facilidad.
        </p>
      </header>

      <ClassesTableView
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


