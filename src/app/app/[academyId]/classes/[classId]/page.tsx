import { notFound } from "next/navigation";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  attendanceRecords,
  classCoachAssignments,
  classSessions,
  classWeekdays,
  classes,
  coaches,
  coachSportConfigs,
  groups,
  groupAthletes,
} from "@/db/schema";
import { getClassAthletes } from "@/lib/classes/get-class-athletes";

import { ClassDetailView } from "@/components/classes/ClassDetailView";
import { resolveAcademySpecialization } from "@/lib/specialization/registry";
import { getGroupTechnicalGuidance } from "@/lib/specialization/technical-guidance";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";

interface PageProps {
  params: Promise<{
    academyId: string;
    classId: string;
  }>;
}

export default async function ClassDetailPage({ params }: PageProps) {
  const { academyId, classId } = await params;

  const [academy] = await db
    .select({
      id: academies.id,
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

  const [classRow] = await db
    .select({
      id: classes.id,
      name: classes.name,
      academyId: classes.academyId,
      tenantId: classes.tenantId,
      startTime: classes.startTime,
      endTime: classes.endTime,
      capacity: classes.capacity,
      technicalFocus: classes.technicalFocus,
      apparatus: classes.apparatus,
      sportConfigId: classes.sportConfigId,
    })
    .from(classes)
    .where(
      and(
        eq(classes.id, classId),
        eq(classes.academyId, academyId),
        eq(classes.tenantId, academy.tenantId),
        isNull(classes.deletedAt)
      )
    )
    .limit(1);

  const weekdayRows = await db
    .select({
      weekday: classWeekdays.weekday,
    })
    .from(classWeekdays)
    .where(and(eq(classWeekdays.classId, classId), eq(classWeekdays.tenantId, academy.tenantId)))
    .limit(7);


  if (!classRow) {
    notFound();
  }

  const coachAssignments = await db
    .select({
      coachId: coaches.id,
      coachName: coaches.name,
      coachEmail: coaches.email,
    })
    .from(classCoachAssignments)
    .innerJoin(
      coaches,
      and(
        eq(classCoachAssignments.coachId, coaches.id),
        eq(coaches.tenantId, academy.tenantId),
        eq(coaches.academyId, academyId)
      )
    )
    .where(
      and(
        eq(classCoachAssignments.classId, classId),
        eq(classCoachAssignments.tenantId, academy.tenantId)
      )
    )
    .orderBy(asc(coaches.name))
    .limit(100);

  const sessionRows = await db
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      status: classSessions.status,
      notes: classSessions.notes,
      sportConfigId: classSessions.sportConfigId,
      coachId: classSessions.coachId,
      coachName: coaches.name,
    })
    .from(classSessions)
    .leftJoin(
      coaches,
      and(
        eq(classSessions.coachId, coaches.id),
        eq(coaches.tenantId, academy.tenantId),
        eq(coaches.academyId, academyId)
      )
    )
    .where(and(eq(classSessions.classId, classId), eq(classSessions.tenantId, academy.tenantId)))
    .orderBy(desc(classSessions.sessionDate), desc(classSessions.startTime))
    .limit(30);

  const sessionIds = sessionRows.map((session) => session.id);

  const attendanceSummaryRows =
    sessionIds.length === 0
      ? []
      : await db
          .select({
            sessionId: attendanceRecords.sessionId,
            status: attendanceRecords.status,
            total: count(attendanceRecords.id),
          })
          .from(attendanceRecords)
          .where(
            and(
              inArray(attendanceRecords.sessionId, sessionIds),
              eq(attendanceRecords.tenantId, academy.tenantId)
            )
          )
          .groupBy(attendanceRecords.sessionId, attendanceRecords.status);

  const summaryBySession = new Map<
    string,
    {
      total: number;
      present: number;
    }
  >();

  for (const row of attendanceSummaryRows) {
    const current = summaryBySession.get(row.sessionId) ?? { total: 0, present: 0 };
    current.total += Number(row.total ?? 0);
    if (row.status === "present") {
      current.present += Number(row.total ?? 0);
    }
    summaryBySession.set(row.sessionId, current);
  }

  const sessions = sessionRows.map((session) => ({
    ...session,
    attendanceSummary: summaryBySession.get(session.id) ?? { total: 0, present: 0 },
  }));

  // Obtener atletas de la clase (grupo base + enrollments)
  const classAthletes = await getClassAthletes(classId, academyId);

  // También obtener todos los atletas de la academia para el AttendanceDialog
  // (necesario para permitir añadir atletas a la asistencia)
  const athleteRows = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      groupId: athletes.groupId,
      groupName: groups.name,
      groupColor: groups.color,
      groupSportConfigId: groups.sportConfigId,
      primarySportConfigId: athletes.primarySportConfigId,
    })
    .from(athletes)
    .leftJoin(
      groups,
      and(
        eq(athletes.groupId, groups.id),
        eq(groups.academyId, academyId),
        eq(groups.tenantId, academy.tenantId),
        isNull(groups.deletedAt)
      )
    )
    .where(
      and(
        eq(athletes.academyId, academyId),
        eq(athletes.tenantId, academy.tenantId),
        isNull(athletes.deletedAt)
      )
    )
    .orderBy(asc(athletes.name))
    .limit(5000);

  const membershipRows = athleteRows.length === 0
    ? []
    : await db
        .select({ athleteId: groupAthletes.athleteId, groupId: groupAthletes.groupId, groupName: groups.name, groupColor: groups.color })
        .from(groupAthletes)
        .innerJoin(
          groups,
          and(
            eq(groupAthletes.groupId, groups.id),
            eq(groups.academyId, academyId),
            eq(groups.tenantId, academy.tenantId),
            isNull(groups.deletedAt)
          )
        )
        .where(
          and(
            inArray(groupAthletes.athleteId, athleteRows.map((athlete) => athlete.id)),
            eq(groupAthletes.tenantId, academy.tenantId)
          )
        )
        .limit(10000);
  const membershipsByAthlete = new Map<string, { id: string; name: string; color: string | null }[]>();
  membershipRows.forEach((row) => {
    const current = membershipsByAthlete.get(row.athleteId) ?? [];
    current.push({ id: row.groupId, name: row.groupName ?? "Grupo sin nombre", color: row.groupColor ?? null });
    membershipsByAthlete.set(row.athleteId, current);
  });

  const coachOptions = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
    })
    .from(coaches)
    .where(and(eq(coaches.academyId, academyId), eq(coaches.tenantId, academy.tenantId)))
    .orderBy(asc(coaches.name))
    .limit(500);
  const coachScopeRows =
    coachOptions.length === 0
      ? []
      : await db
          .select({
            coachId: coachSportConfigs.coachId,
            sportConfigId: coachSportConfigs.academySportConfigId,
          })
          .from(coachSportConfigs)
          .where(inArray(coachSportConfigs.coachId, coachOptions.map((coach) => coach.id)))
          .limit(2000);
  const sportConfigIdsByCoach = new Map<string, string[]>();
  coachScopeRows.forEach((row) => {
    const current = sportConfigIdsByCoach.get(row.coachId) ?? [];
    current.push(row.sportConfigId);
    sportConfigIdsByCoach.set(row.coachId, current);
  });

  const specialization = resolveAcademySpecialization(academy);
  const classTechnicalGuidance = getGroupTechnicalGuidance(specialization);
  const sportConfigs = await getAcademySportConfigOptions(academyId);

  const classInfo = {
    id: classRow.id,
    academyId: classRow.academyId,
    academyCountry: academy.country,
    name: classRow.name ?? "Clase",
    weekdays: weekdayRows.map((row) => row.weekday).sort((a, b) => a - b),
    startTime: classRow.startTime,
    endTime: classRow.endTime,
    capacity: classRow.capacity,
    technicalFocus: classRow.technicalFocus ?? classTechnicalGuidance.focusAreas.join(". "),
    apparatus: classRow.apparatus ?? classTechnicalGuidance.apparatus,
    sportConfigId: classRow.sportConfigId ?? null,
    coaches: coachAssignments.map((assignment) => ({
      id: assignment.coachId,
      name: assignment.coachName ?? "Sin nombre",
      email: assignment.coachEmail ?? null,
    })),
  };

  return (
    <div className="space-y-6 py-6 lg:py-8">
      <ClassDetailView
        classInfo={classInfo}
        sessions={sessions}
        classAthletes={classAthletes}
        athleteOptions={athleteRows.map((athlete) => ({
          id: athlete.id,
          name: athlete.name ?? "Sin nombre",
          groupId: athlete.groupId,
          groupName: athlete.groupName,
          groupColor: athlete.groupColor,
          groups: membershipsByAthlete.get(athlete.id) ?? [],
          primarySportConfigId: athlete.primarySportConfigId,
          groupSportConfigId: athlete.groupSportConfigId ?? null,
        }))}
        coachOptions={coachOptions.map((coach) => ({
          id: coach.id,
          name: coach.name ?? "Sin nombre",
          email: coach.email,
          sportConfigIds: sportConfigIdsByCoach.get(coach.id) ?? [],
        }))}
        sportConfigs={sportConfigs}
      />
    </div>
  );
}
