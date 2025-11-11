import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";

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

  const groupRows = await db
    .select({
      id: groups.id,
      name: groups.name,
      discipline: groups.discipline,
      level: groups.level,
      color: groups.color,
      coachId: groups.coachId,
      assistantIds: groups.assistantIds,
      createdAt: groups.createdAt,
      coachName: coaches.name,
      athleteCount: sql<number>`count(distinct ${groupAthletes.athleteId})`,
    })
    .from(groups)
    .leftJoin(coaches, eq(groups.coachId, coaches.id))
    .leftJoin(groupAthletes, eq(groupAthletes.groupId, groups.id))
    .where(eq(groups.academyId, academyId))
    .groupBy(groups.id, coaches.name)
    .orderBy(asc(groups.createdAt));

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

  const initialGroups: GroupSummary[] = groupRows.map((group) => ({
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
      <GroupsDashboard
        academyId={academy.id}
        initialGroups={initialGroups}
        coaches={coachOptions}
        athletes={athleteOptions}
      />
    </div>
  );
}
