import { notFound } from "next/navigation";
import { asc, count, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  classCoachAssignments,
  classSessions,
  classes,
  coaches,
  attendanceRecords,
  groups,
} from "@/db/schema";

import { ClassDetailView } from "@/components/classes/ClassDetailView";

interface PageProps {
  params: {
    academyId: string;
    classId: string;
  };
}

export default async function ClassDetailPage({ params }: PageProps) {
  const { academyId, classId } = params;

  const [classRow] = await db
    .select({
      id: classes.id,
      name: classes.name,
      academyId: classes.academyId,
      weekday: classes.weekday,
      startTime: classes.startTime,
      endTime: classes.endTime,
      capacity: classes.capacity,
    })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);

  if (!classRow || classRow.academyId !== academyId) {
    notFound();
  }

  const coachAssignments = await db
    .select({
      coachId: coaches.id,
      coachName: coaches.name,
      coachEmail: coaches.email,
    })
    .from(classCoachAssignments)
    .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
    .where(eq(classCoachAssignments.classId, classId))
    .orderBy(asc(coaches.name));

  const sessionRows = await db
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      status: classSessions.status,
      notes: classSessions.notes,
      coachId: classSessions.coachId,
      coachName: coaches.name,
    })
    .from(classSessions)
    .leftJoin(coaches, eq(classSessions.coachId, coaches.id))
    .where(eq(classSessions.classId, classId))
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
          .where(inArray(attendanceRecords.sessionId, sessionIds))
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

  const athleteRows = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      groupId: athletes.groupId,
      groupName: groups.name,
      groupColor: groups.color,
    })
    .from(athletes)
    .leftJoin(groups, eq(athletes.groupId, groups.id))
    .where(eq(athletes.academyId, academyId))
    .orderBy(asc(athletes.name));

  const coachOptions = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
    })
    .from(coaches)
    .where(eq(coaches.academyId, academyId))
    .orderBy(asc(coaches.name));

  const classInfo = {
    id: classRow.id,
    academyId: classRow.academyId,
    name: classRow.name ?? "Clase",
    weekday: classRow.weekday,
    startTime: classRow.startTime,
    endTime: classRow.endTime,
    capacity: classRow.capacity,
    coaches: coachAssignments.map((assignment) => ({
      id: assignment.coachId,
      name: assignment.coachName ?? "Sin nombre",
      email: assignment.coachEmail ?? null,
    })),
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <ClassDetailView
        classInfo={classInfo}
        sessions={sessions}
        athleteOptions={athleteRows.map((athlete) => ({
          id: athlete.id,
          name: athlete.name ?? "Sin nombre",
          groupId: athlete.groupId,
          groupName: athlete.groupName,
          groupColor: athlete.groupColor,
        }))}
        coachOptions={coachOptions.map((coach) => ({
          id: coach.id,
          name: coach.name ?? "Sin nombre",
          email: coach.email,
        }))}
      />
    </div>
  );
}


