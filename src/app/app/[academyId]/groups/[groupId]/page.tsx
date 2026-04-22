import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  classCoachAssignments,
  classWeekdays,
  classes,
  coaches,
  groupAthletes,
  groups,
} from "@/db/schema";
import { GroupView } from "@/components/groups/GroupView";
import { AthleteOption, CoachOption, GroupDetail } from "@/components/groups/types";
import { resolveAcademySpecialization } from "@/lib/specialization/registry";
import { getGroupTechnicalGuidance } from "@/lib/specialization/technical-guidance";

interface PageProps {
  params: Promise<{
    academyId: string;
    groupId: string;
  }>;
}

export default async function GroupDetailPage({ params }: PageProps) {
  const { academyId, groupId } = await params;

  const [groupRow] = await db
    .select({
      id: groups.id,
      academyId: groups.academyId,
      tenantId: groups.tenantId,
      name: groups.name,
      discipline: groups.discipline,
      level: groups.level,
      technicalFocus: groups.technicalFocus,
      apparatus: groups.apparatus,
      sessionBlocks: groups.sessionBlocks,
      color: groups.color,
      coachId: groups.coachId,
      assistantIds: groups.assistantIds,
      createdAt: groups.createdAt,
    })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!groupRow || groupRow.academyId !== academyId) {
    notFound();
  }

  const [academy] = await db
    .select({
      id: academies.id,
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
  const guidance = getGroupTechnicalGuidance(specialization, groupRow.level);

  const [coach] = groupRow.coachId
    ? await db
        .select({ id: coaches.id, name: coaches.name, email: coaches.email })
        .from(coaches)
        .where(eq(coaches.id, groupRow.coachId))
        .limit(1)
    : [];

  const assistantIds = Array.isArray(groupRow.assistantIds) ? groupRow.assistantIds : [];
  const assistantRows = assistantIds.length
    ? await db
        .select({ id: coaches.id, name: coaches.name, email: coaches.email })
        .from(coaches)
        .where(inArray(coaches.id, assistantIds))
    : [];

  const assistants = assistantIds
    .map((id) => assistantRows.find((assistant) => assistant.id === id))
    .filter(Boolean) as CoachOption[];

  const members = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
    })
    .from(groupAthletes)
    .innerJoin(athletes, eq(groupAthletes.athleteId, athletes.id))
    .where(eq(groupAthletes.groupId, groupId))
    .orderBy(asc(athletes.name));

  const availableCoaches: CoachOption[] = await db
    .select({ id: coaches.id, name: coaches.name, email: coaches.email })
    .from(coaches)
    .where(eq(coaches.academyId, academyId))
    .orderBy(asc(coaches.name));

  const availableAthletes: AthleteOption[] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
    })
    .from(athletes)
    .where(eq(athletes.academyId, academyId))
    .orderBy(asc(athletes.name));

  const coachIdsForClasses = [
    ...(groupRow.coachId ? [groupRow.coachId] : []),
    ...assistantIds,
  ].filter(Boolean);

  let classSummaries: GroupDetail["classes"] = [];

  if (coachIdsForClasses.length > 0) {
    const classRows = await db
      .select({
        classId: classes.id,
        className: classes.name,
        startTime: classes.startTime,
        endTime: classes.endTime,
        coachName: coaches.name,
      })
      .from(classCoachAssignments)
      .innerJoin(classes, eq(classCoachAssignments.classId, classes.id))
      .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
      .where(
        and(eq(classes.academyId, academyId), inArray(classCoachAssignments.coachId, coachIdsForClasses))
      )
      .orderBy(asc(classes.name));

    const classIdSet = Array.from(new Set(classRows.map((row) => row.classId)));

    const weekdayRows =
      classIdSet.length > 0
        ? await db
            .select({
              classId: classWeekdays.classId,
              weekday: classWeekdays.weekday,
            })
            .from(classWeekdays)
            .where(inArray(classWeekdays.classId, classIdSet))
        : [];

    const weekdayMap = new Map<string, number[]>();
    weekdayRows.forEach((row) => {
      const next = weekdayMap.get(row.classId) ?? [];
      next.push(row.weekday);
      weekdayMap.set(row.classId, next);
    });

    const classMap = new Map<string, GroupDetail["classes"][number]>();

    classRows.forEach((row) => {
      if (!row.classId) return;
      if (!classMap.has(row.classId)) {
        classMap.set(row.classId, {
          id: row.classId,
          name: row.className ?? "Clase sin nombre",
          startTime: row.startTime ? String(row.startTime) : null,
          endTime: row.endTime ? String(row.endTime) : null,
          weekdays: [],
          coachNames: row.coachName ? [row.coachName] : [],
        });
      } else if (row.coachName) {
        const existing = classMap.get(row.classId);
        if (existing && !existing.coachNames.includes(row.coachName)) {
          existing.coachNames.push(row.coachName);
        }
      }
    });

    weekdayMap.forEach((weekdayList, classId) => {
      const summary = classMap.get(classId);
      if (summary) {
        summary.weekdays = Array.from(new Set(weekdayList)).sort((a, b) => a - b);
      }
    });

    classSummaries = Array.from(classMap.values());
  }

  const detail: GroupDetail = {
    id: groupRow.id,
    academyId: groupRow.academyId,
    name: groupRow.name,
    discipline: groupRow.discipline,
    level: groupRow.level ?? null,
    technicalFocus: groupRow.technicalFocus ?? guidance.focusAreas.join(". "),
    apparatus: groupRow.apparatus?.length ? groupRow.apparatus : guidance.apparatus,
    sessionBlocks: groupRow.sessionBlocks?.length ? groupRow.sessionBlocks : guidance.suggestedSessionBlocks,
    color: groupRow.color ?? null,
    coachId: groupRow.coachId ?? null,
    coachName: coach?.name ?? null,
    coachEmail: coach?.email ?? null,
    assistantIds,
    assistantNames: assistants.map((assistant) => assistant.name),
    assistants,
    members: members.map((member) => ({
      id: member.id,
      name: member.name,
      level: member.level,
      status: member.status,
    })),
    athleteCount: members.length,
    createdAt: groupRow.createdAt ? groupRow.createdAt.toISOString() : new Date().toISOString(),
    classes: classSummaries,
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <GroupView
        academyId={academyId}
        group={detail}
        availableAthletes={availableAthletes}
        availableCoaches={availableCoaches}
      />
    </div>
  );
}
