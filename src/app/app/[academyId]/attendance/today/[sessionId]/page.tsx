import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { attendanceRecords, classSessions, classes } from "@/db/schema";
import { getClassAthletes } from "@/lib/classes/get-class-athletes";
import { AttendanceSheet } from "@/components/attendance/AttendanceSheet";

interface PageProps {
  params: Promise<{ academyId: string; sessionId: string }>;
}

export default async function AttendanceTodaySessionPage({ params }: PageProps) {
  const { academyId, sessionId } = await params;

  const [session] = await db
    .select({
      id: classSessions.id,
      classId: classes.id,
      className: classes.name,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(and(eq(classSessions.id, sessionId), eq(classes.academyId, academyId)))
    .limit(1);

  if (!session) {
    notFound();
  }

  const classAthletes = await getClassAthletes(session.classId, academyId);
  const athleteIds = classAthletes.map((athlete) => athlete.id);

  const existingRecords =
    athleteIds.length === 0
      ? []
      : await db
          .select({ athleteId: attendanceRecords.athleteId, status: attendanceRecords.status })
          .from(attendanceRecords)
          .where(and(eq(attendanceRecords.sessionId, sessionId), inArray(attendanceRecords.athleteId, athleteIds)));

  const initialStatuses = Object.fromEntries(
    existingRecords.map((record) => [record.athleteId, record.status as "present" | "absent" | "late" | "excused"])
  );

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6">
      <AttendanceSheet
        academyId={academyId}
        sessionId={session.id}
        className={session.className ?? "Clase"}
        athletes={classAthletes.map((athlete) => ({
          id: athlete.id,
          name: athlete.name,
          groupName: athlete.groupName,
        }))}
        initialStatuses={initialStatuses}
        backHref={`/app/${academyId}/attendance/today`}
      />
    </div>
  );
}
