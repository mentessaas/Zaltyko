import { notFound } from "next/navigation";
import { asc, count, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import {
  academies,
  athletes,
  attendanceRecords,
  classSessions,
  classes,
  familyContacts,
  guardianAthletes,
  guardians,
  groups,
} from "@/db/schema";
import { AthleteAccountSection } from "@/components/athletes/AthleteAccountSection";
import { AthleteBaseClassesSection } from "@/components/athletes/AthleteBaseClassesSection";
import { AthleteExtraClassesSection } from "@/components/athletes/AthleteExtraClassesSection";
import { AthleteDetailTabs } from "@/components/athletes/AthleteDetailTabs";
import { coaches } from "@/db/schema";

interface PageProps {
  params: Promise<{
    academyId: string;
    athleteId: string;
  }>;
}

export default async function AthleteDetailPage({ params }: PageProps) {
  const { academyId, athleteId } = await params;

  const [athleteRow] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
      dob: athletes.dob,
      createdAt: athletes.createdAt,
      groupId: athletes.groupId,
      groupName: groups.name,
      groupColor: groups.color,
      tenantId: athletes.tenantId,
      academyOwner: athletes.academyId,
    })
    .from(athletes)
    .leftJoin(groups, eq(athletes.groupId, groups.id))
    .where(eq(athletes.id, athleteId))
    .limit(1);

  if (!athleteRow || athleteRow.academyOwner !== academyId) {
    notFound();
  }

  const age = (() => {
    if (!athleteRow.dob) return null;
    const date = typeof athleteRow.dob === "string" ? new Date(athleteRow.dob) : athleteRow.dob;
    if (Number.isNaN(date.getTime())) return null;
    const today = new Date();
    let a = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
      a -= 1;
    }
    return a;
  })();

  const contacts = await db
    .select({
      id: familyContacts.id,
      name: familyContacts.name,
      relationship: familyContacts.relationship,
      email: familyContacts.email,
      phone: familyContacts.phone,
      notifyEmail: familyContacts.notifyEmail,
      notifySms: familyContacts.notifySms,
    })
    .from(familyContacts)
    .where(eq(familyContacts.athleteId, athleteId))
    .orderBy(asc(familyContacts.name));

  const guardiansList = await db
    .select({
      id: guardians.id,
      name: guardians.name,
      email: guardians.email,
      phone: guardians.phone,
      relationship: guardianAthletes.relationship,
      isPrimary: guardianAthletes.isPrimary,
    })
    .from(guardianAthletes)
    .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
    .where(eq(guardianAthletes.athleteId, athleteId))
    .orderBy(desc(guardianAthletes.isPrimary), asc(guardians.name));

  const attendanceSummary = await db
    .select({
      status: attendanceRecords.status,
      total: count(attendanceRecords.id),
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(eq(attendanceRecords.athleteId, athleteId))
    .groupBy(attendanceRecords.status);

  const recentSessions = await db
    .select({
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      status: attendanceRecords.status,
      recordedAt: attendanceRecords.recordedAt,
      className: classes.name,
      classId: classes.id,
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(eq(attendanceRecords.athleteId, athleteId))
    .orderBy(desc(attendanceRecords.recordedAt))
    .limit(10);

  const availableCoaches = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
    })
    .from(coaches)
    .where(eq(coaches.academyId, academyId))
    .orderBy(asc(coaches.name));

  let formattedDob: string | null = null;
  if (athleteRow.dob) {
    if (typeof athleteRow.dob === "string") {
      formattedDob = athleteRow.dob.slice(0, 10);
    } else {
      const dobDate = athleteRow.dob as Date;
      formattedDob = dobDate.toISOString().slice(0, 10);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <Link
        href={`/app/${academyId}/athletes`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
      >
        ← Volver a atletas
      </Link>

      <AthleteDetailTabs
        academyId={academyId}
        athlete={{
          id: athleteRow.id,
          name: athleteRow.name,
          level: athleteRow.level,
          status: athleteRow.status,
          dob: athleteRow.dob,
          createdAt: athleteRow.createdAt,
          groupId: athleteRow.groupId,
          groupName: athleteRow.groupName,
          groupColor: athleteRow.groupColor,
        }}
        age={age}
        formattedDob={formattedDob}
        contacts={contacts}
        guardians={guardiansList}
        attendanceSummary={attendanceSummary}
        recentSessions={recentSessions.map((s) => ({
          sessionDate: s.sessionDate,
          startTime: s.startTime,
          endTime: s.endTime,
          status: s.status,
          recordedAt: s.recordedAt,
          className: s.className,
          classId: s.classId,
        }))}
        accountSection={
          <AthleteAccountSection academyId={academyId} athleteId={athleteId} />
        }
        classesSection={
          <>
            <AthleteBaseClassesSection
              academyId={academyId}
              athleteId={athleteId}
              groupId={athleteRow.groupId}
              groupName={athleteRow.groupName}
            />
            <AthleteExtraClassesSection
              academyId={academyId}
              athleteId={athleteId}
              availableCoaches={availableCoaches.map((coach) => ({
                id: coach.id,
                name: coach.name ?? "Sin nombre",
                email: coach.email,
              }))}
            />
          </>
        }
      />
    </div>
  );
}
