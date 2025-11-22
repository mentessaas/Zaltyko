import Link from "next/link";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { academies, classCoachAssignments, classes, coaches, groups } from "@/db/schema";

import { CoachesTableView } from "@/components/coaches/CoachesTableView";

/**
 * AcademyCoachesPage - Vista principal de gestión de entrenadores
 * 
 * Permite listar, filtrar y gestionar entrenadores del staff técnico, con búsqueda
 * por nombre/correo y filtrado por grupo. Incluye acceso a creación y edición.
 */
interface PageProps {
  params: {
    academyId: string;
  };
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function AcademyCoachesPage({ params, searchParams }: PageProps) {
  const { academyId } = params;

  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }

  const searchQuery =
    typeof searchParams.q === "string" && searchParams.q.trim().length > 0
      ? searchParams.q.trim()
      : undefined;

  const groupFilter =
    typeof searchParams.group === "string" && searchParams.group.trim().length > 0
      ? searchParams.group.trim()
      : undefined;

  const searchCondition = searchQuery
    ? or(
        ilike(coaches.name, `%${searchQuery}%`),
        ilike(coaches.email, `%${searchQuery}%`),
        ilike(coaches.phone, `%${searchQuery}%`)
      )
    : undefined;

  const conditions = [
    eq(coaches.academyId, academyId),
    searchCondition,
  ].filter(Boolean) as any[];

  const whereClause = conditions.reduce<any>(
    (accumulator, condition) => (accumulator ? and(accumulator, condition) : condition),
    undefined
  );

  const coachRows = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
      phone: coaches.phone,
      createdAt: coaches.createdAt,
    })
    .from(coaches)
    .where(whereClause)
    .orderBy(asc(coaches.name));

  const assignmentRows = await db
    .select({
      coachId: classCoachAssignments.coachId,
      classId: classes.id,
      className: classes.name,
    })
    .from(classCoachAssignments)
    .innerJoin(classes, eq(classCoachAssignments.classId, classes.id))
    .where(eq(classes.academyId, academyId));

  const classRows = await db
    .select({
      id: classes.id,
      name: classes.name,
    })
    .from(classes)
    .where(eq(classes.academyId, academyId))
    .orderBy(asc(classes.name));

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

  const groupsByCoach = new Map<string, { id: string; name: string; color: string | null; role: "principal" | "asistente" }[]>();

  groupRows.forEach((group) => {
    const baseInfo = {
      id: group.id,
      name: group.name ?? "Grupo sin nombre",
      color: group.color ?? null,
    };
    if (group.coachId) {
      const list = groupsByCoach.get(group.coachId) ?? [];
      if (!list.some((entry) => entry.id === baseInfo.id)) {
        list.push({ ...baseInfo, role: "principal" });
      }
      groupsByCoach.set(group.coachId, list);
    }
    if (Array.isArray(group.assistantIds)) {
      group.assistantIds.forEach((assistantId) => {
        const list = groupsByCoach.get(assistantId) ?? [];
        if (!list.some((entry) => entry.id === baseInfo.id)) {
          list.push({ ...baseInfo, role: "asistente" });
        }
        groupsByCoach.set(assistantId, list);
      });
    }
  });

  const coachesList = coachRows.map((coach) => ({
    id: coach.id,
    name: coach.name,
    email: coach.email,
    phone: coach.phone,
    createdAt: coach.createdAt ? coach.createdAt.toISOString() : null,
    classes: assignmentRows
      .filter((assignment) => assignment.coachId === coach.id)
      .map((assignment) => ({
        id: assignment.classId,
        name: assignment.className ?? "Sin nombre",
      })),
    groups: groupsByCoach.get(coach.id) ?? [],
  }));

  const filteredCoaches = groupFilter
    ? coachesList.filter((coach) => coach.groups.some((group) => group.id === groupFilter))
    : coachesList;

  const classOptions = classRows.map((entry) => ({
    id: entry.id,
    name: entry.name ?? "Sin nombre",
  }));

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-2 py-6">
        <h1 className="text-3xl font-semibold">Entrenadores</h1>
        <p className="text-sm text-muted-foreground">
          Controla al staff técnico, asigna clases y mantén sus datos de contacto al día.
        </p>
      </header>

      <CoachesTableView
        academyId={academy.id}
        coaches={filteredCoaches}
        classes={classOptions}
        groupOptions={groupRows.map((group) => ({
          id: group.id,
          name: group.name ?? "Grupo sin nombre",
          color: group.color ?? null,
        }))}
        filters={{ q: searchQuery, groupId: groupFilter }}
      />
    </div>
  );
}


