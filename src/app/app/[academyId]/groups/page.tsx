import { notFound } from "next/navigation";
import { asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  coaches,
  groupAthletes,
  groups,
} from "@/db/schema";
import { GroupsDashboard } from "@/components/groups/GroupsDashboard";
import { AthleteOption, CoachOption, GroupSummary } from "@/components/groups/types";

/**
 * AcademyGroupsPage - Vista principal de gestión de grupos
 * 
 * Permite crear y gestionar grupos de entrenamiento, organizando atletas por niveles
 * y equipos para conectar clases, asistencia y evaluaciones.
 */
interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function AcademyGroupsPage({ params }: PageProps) {
  const { academyId } = params;

  const [academy] = await db
    .select({ id: academies.id, name: academies.name })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }

  // Primero obtener los grupos con el coach
  const groupRows = await db
    .select({
      id: groups.id,
      name: groups.name,
      discipline: groups.discipline,
      level: groups.level,
      color: groups.color,
      coachId: groups.coachId,
      assistantIds: groups.assistantIds,
      monthlyFeeCents: groups.monthlyFeeCents,
      billingItemId: groups.billingItemId,
      createdAt: groups.createdAt,
      coachName: coaches.name,
    })
    .from(groups)
    .leftJoin(coaches, eq(groups.coachId, coaches.id))
    .where(eq(groups.academyId, academyId))
    .orderBy(asc(groups.createdAt));

  // Obtener el conteo de atletas por grupo usando una subconsulta
  const groupIds = groupRows.map((g) => g.id);
  const athleteCountsMap = new Map<string, number>();

  if (groupIds.length > 0) {
    const athleteCountRows = await db
      .select({
        groupId: groupAthletes.groupId,
        count: sql<number>`count(distinct ${groupAthletes.athleteId})`,
      })
      .from(groupAthletes)
      .where(inArray(groupAthletes.groupId, groupIds))
      .groupBy(groupAthletes.groupId);

    athleteCountRows.forEach((row) => {
      athleteCountsMap.set(row.groupId, Number(row.count ?? 0));
    });
  }

  // Combinar los resultados
  const groupRowsWithCount: Array<typeof groupRows[number] & { athleteCount: number }> = groupRows.map((group) => ({
    ...group,
    athleteCount: athleteCountsMap.get(group.id) ?? 0,
  }));

  const coachRows = await db
    .select({ id: coaches.id, name: coaches.name, email: coaches.email })
    .from(coaches)
    .where(eq(coaches.academyId, academyId))
    .orderBy(asc(coaches.name));

  const athleteRows = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
    })
    .from(athletes)
    .where(eq(athletes.academyId, academyId))
    .orderBy(asc(athletes.name));

  const coachNameMap = new Map(coachRows.map((coach) => [coach.id, coach.name]));

  const initialGroups: GroupSummary[] = groupRowsWithCount.map((group) => ({
    id: group.id,
    academyId,
    name: group.name,
    discipline: group.discipline,
    level: group.level ?? null,
    color: group.color ?? null,
    coachId: group.coachId ?? null,
    coachName: group.coachName ?? null,
    assistantIds: Array.isArray(group.assistantIds) ? group.assistantIds : [],
    assistantNames: Array.isArray(group.assistantIds)
      ? group.assistantIds.map((assistantId) => coachNameMap.get(assistantId) ?? "Sin nombre")
      : [],
    athleteCount: Number(group.athleteCount ?? 0),
    createdAt: group.createdAt ? group.createdAt.toISOString() : new Date().toISOString(),
    monthlyFeeCents: group.monthlyFeeCents ?? null,
    billingItemId: group.billingItemId ?? null,
  }));

  const coachOptions: CoachOption[] = coachRows.map((coach) => ({
    id: coach.id,
    name: coach.name,
    email: coach.email,
  }));

  const athleteOptions: AthleteOption[] = athleteRows.map((athlete) => ({
    id: athlete.id,
    name: athlete.name,
    level: athlete.level ?? null,
    status: athlete.status,
  }));

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-2 py-6">
        <h1 className="text-3xl font-semibold">Grupos</h1>
        <p className="text-sm text-muted-foreground">
          Organiza a tus atletas por niveles y equipos para conectar clases, asistencia y evaluaciones.
        </p>
      </header>

      <GroupsDashboard
        academyId={academy.id}
        initialGroups={initialGroups}
        coaches={coachOptions}
        athletes={athleteOptions}
      />
    </div>
  );
}
