import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { and, eq, inArray, isNull, desc } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  classCoachAssignments,
  classEnrollments,
  classSessions,
  classes,
  coaches,
  groups,
  groupAthletes,
  memberships,
  profiles,
  attendanceRecords,
  athleteAssessments,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { CoachDashboardPage } from "@/components/coach/CoachDashboardPage";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { academyId } = await params;
  const [academy] = await db
    .select({ name: academies.name })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  const name = academy?.name ?? "Academia";

  return {
    title: `${name} · Panel del Entrenador`,
    description: `Tu panel personal como entrenador en ${name}.`,
  };
}

interface CoachAthlete {
  id: string;
  name: string;
  level: string | null;
  ageCategory: string | null;
  competitiveLevel: string | null;
  groupName: string | null;
  groupColor: string | null;
}

interface CoachClass {
  id: string;
  name: string;
  weekday: number | null;
  startTime: string | null;
  endTime: string | null;
  groupName: string | null;
  groupColor: string | null;
  athleteCount: number;
  technicalFocus: string | null;
  apparatus: string[];
}

interface TodaySession {
  id: string;
  classId: string;
  className: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  groupName: string | null;
  groupColor: string | null;
  technicalFocus: string | null;
  apparatus: string[];
  status: string;
}

interface RecentAssessment {
  id: string;
  athleteId: string;
  athleteName: string;
  apparatus: string | null;
  assessmentDate: string;
  totalScore: number | null;
}

interface AttendanceStats {
  total: number;
  present: number;
  absent: number;
  excused: number;
}

export default async function CoachDashboard({ params }: PageProps) {
  const { academyId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Obtener el perfil del usuario
  const [profile] = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      role: profiles.role,
      photoUrl: profiles.photoUrl,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect("/auth/login");
  }

  // Verificar membership y rol de coach
  const [membership] = await db
    .select({
      role: memberships.role,
    })
    .from(memberships)
    .where(
      and(eq(memberships.userId, user.id), eq(memberships.academyId, academyId))
    )
    .limit(1);

  // Solo coaches pueden acceder
  if (profile.role !== "coach" || !membership) {
    // Redirigir según el rol
    if (profile.role === "owner" || profile.role === "admin" || profile.role === "super_admin") {
      redirect(`/app/${academyId}/dashboard`);
    }
    redirect("/dashboard");
  }

  // Obtener el coach asociado al perfil
  const [coach] = await db
    .select({ id: coaches.id })
    .from(coaches)
    .where(
      and(
        eq(coaches.profileId, profile.id),
        eq(coaches.academyId, academyId)
      )
    )
    .limit(1);

  if (!coach) {
    redirect("/dashboard");
  }

  // Obtener datos de la academia
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      country: academies.country,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    redirect("/dashboard");
  }

  // === OBTENER ATLETAS DEL COACH ===
  const assignedClasses = await db
    .select({ classId: classCoachAssignments.classId })
    .from(classCoachAssignments)
    .where(eq(classCoachAssignments.coachId, coach.id));

  const assignedClassIds = assignedClasses.map((c) => c.classId);

  // Obtener grupos de esas clases
  let groupIds: string[] = [];
  if (assignedClassIds.length > 0) {
    const classGroups = await db
      .select({ groupId: classes.groupId })
      .from(classes)
      .where(inArray(classes.id, assignedClassIds));

    groupIds = classGroups
      .map((g) => g.groupId)
      .filter((id): id is string => id !== null);
  }

  // Obtener atletas via groupAthletes
  let coachAthletes: CoachAthlete[] = [];
  if (groupIds.length > 0) {
    const athleteRows = await db
      .select({
        athleteId: groupAthletes.athleteId,
        athleteName: athletes.name,
        athleteLevel: athletes.level,
        athleteAgeCategory: athletes.ageCategory,
        athleteCompetitiveLevel: athletes.competitiveLevel,
        groupName: groups.name,
        groupColor: groups.color,
      })
      .from(groupAthletes)
      .innerJoin(athletes, eq(groupAthletes.athleteId, athletes.id))
      .leftJoin(groups, eq(groupAthletes.groupId, groups.id))
      .where(
        and(
          inArray(groupAthletes.groupId, groupIds),
          isNull(athletes.deletedAt)
        )
      );

    coachAthletes = athleteRows.map((a) => ({
      id: a.athleteId,
      name: a.athleteName,
      level: a.athleteLevel,
      ageCategory: a.athleteAgeCategory,
      competitiveLevel: a.athleteCompetitiveLevel,
      groupName: a.groupName,
      groupColor: a.groupColor,
    }));
  }

  // Obtener atletas via classEnrollments
  if (assignedClassIds.length > 0) {
    const enrollmentRows = await db
      .select({
        athleteId: classEnrollments.athleteId,
        athleteName: athletes.name,
        athleteLevel: athletes.level,
        athleteAgeCategory: athletes.ageCategory,
        athleteCompetitiveLevel: athletes.competitiveLevel,
      })
      .from(classEnrollments)
      .innerJoin(athletes, eq(classEnrollments.athleteId, athletes.id))
      .where(
        and(
          inArray(classEnrollments.classId, assignedClassIds),
          isNull(athletes.deletedAt)
        )
      );

    const existingIds = new Set(coachAthletes.map((a) => a.id));
    enrollmentRows.forEach((a) => {
      if (!existingIds.has(a.athleteId)) {
        existingIds.add(a.athleteId);
        coachAthletes.push({
          id: a.athleteId,
          name: a.athleteName,
          level: a.athleteLevel,
          ageCategory: a.athleteAgeCategory,
          competitiveLevel: a.athleteCompetitiveLevel,
          groupName: null,
          groupColor: null,
        });
      }
    });
  }

  // === OBTENER CLASES DEL COACH ===
  const coachClasses: CoachClass[] = [];
  if (assignedClassIds.length > 0) {
    const classRows = await db
      .select({
        id: classes.id,
        name: classes.name,
        weekday: classes.weekday,
        startTime: classes.startTime,
        endTime: classes.endTime,
        groupId: classes.groupId,
        technicalFocus: classes.technicalFocus,
        apparatus: classes.apparatus,
      })
      .from(classes)
      .where(
        and(
          inArray(classes.id, assignedClassIds),
          isNull(classes.deletedAt)
        )
      );

    // Obtener athlete counts por clase
    const athleteCountMap = new Map<string, number>();
    for (const classId of assignedClassIds) {
      // Count from groupAthletes (via group)
      const groupForClass = classRows.find((c) => c.id === classId)?.groupId;
      if (groupForClass) {
        const count = await db
          .select({ count: groupAthletes.id })
          .from(groupAthletes)
          .where(eq(groupAthletes.groupId, groupForClass));
        athleteCountMap.set(classId, (athleteCountMap.get(classId) ?? 0) + count.length);
      }
      // Count from classEnrollments
      const enrollCount = await db
        .select({ count: classEnrollments.id })
        .from(classEnrollments)
        .where(eq(classEnrollments.classId, classId));
      athleteCountMap.set(classId, (athleteCountMap.get(classId) ?? 0) + enrollCount.length);
    }

    // Obtener grupos para cada clase
    const classGroupMap = new Map<string, { name: string | null; color: string | null }>();
    if (groupIds.length > 0) {
      const groupsData = await db
        .select({ id: groups.id, name: groups.name, color: groups.color })
        .from(groups)
        .where(inArray(groups.id, groupIds));

      groupsData.forEach((g) => {
        classGroupMap.set(g.id, { name: g.name, color: g.color });
      });
    }

    coachClasses.push(
      ...classRows.map((c) => {
        const groupInfo = c.groupId ? classGroupMap.get(c.groupId) : null;
        return {
          id: c.id,
          name: c.name,
          weekday: c.weekday,
          startTime: c.startTime,
          endTime: c.endTime,
          groupName: groupInfo?.name ?? null,
          groupColor: groupInfo?.color ?? null,
          athleteCount: athleteCountMap.get(c.id) ?? 0,
          technicalFocus: c.technicalFocus ?? null,
          apparatus: c.apparatus ?? [],
        };
      })
    );
  }

  // === OBTENER SESIONES DE HOY ===
  const today = new Date().toISOString().split("T")[0];
  let todaySessions: TodaySession[] = [];

  if (assignedClassIds.length > 0) {
    const sessionRows = await db
      .select({
        id: classSessions.id,
        classId: classSessions.classId,
        className: classes.name,
        sessionDate: classSessions.sessionDate,
        startTime: classSessions.startTime,
        endTime: classSessions.endTime,
        status: classSessions.status,
        groupName: groups.name,
        groupColor: groups.color,
        technicalFocus: classes.technicalFocus,
        apparatus: classes.apparatus,
      })
      .from(classSessions)
      .leftJoin(classes, eq(classSessions.classId, classes.id))
      .leftJoin(groups, eq(classes.groupId, groups.id))
      .where(
        and(
          inArray(classSessions.classId, assignedClassIds),
          eq(classSessions.sessionDate, today),
          inArray(classSessions.status, ["scheduled", "in_progress"])
        )
      )
      .orderBy(classSessions.startTime);

    todaySessions = sessionRows.map((s) => ({
      id: s.id,
      classId: s.classId,
      className: s.className ?? "Clase",
      sessionDate: s.sessionDate,
      startTime: s.startTime,
      endTime: s.endTime,
      groupName: s.groupName,
      groupColor: s.groupColor,
      technicalFocus: s.technicalFocus ?? null,
      apparatus: s.apparatus ?? [],
      status: s.status,
    }));
  }

  // === OBTENER ESTADÍSTICAS DE ASISTENCIA (últimos 7 días) ===
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const attendanceStats: AttendanceStats = { total: 0, present: 0, absent: 0, excused: 0 };

  if (coachAthletes.length > 0) {
    const athleteIds = coachAthletes.map((a) => a.id);

    const recentAttendance = await db
      .select({ status: attendanceRecords.status, recordedAt: attendanceRecords.recordedAt })
      .from(attendanceRecords)
      .where(
        and(
          inArray(attendanceRecords.athleteId, athleteIds),
          inArray(attendanceRecords.status, ["present", "absent", "excused"])
        )
      );

    // Filtrar por fecha - últimos 7 días
    const last7DaysAttendance = recentAttendance.filter((r) => {
      if (!r.recordedAt) return false;
      const recordedDate = new Date(r.recordedAt);
      return recordedDate >= sevenDaysAgo;
    });

    attendanceStats.total = last7DaysAttendance.length;
    attendanceStats.present = last7DaysAttendance.filter((r) => r.status === "present").length;
    attendanceStats.absent = last7DaysAttendance.filter((r) => r.status === "absent").length;
    attendanceStats.excused = last7DaysAttendance.filter((r) => r.status === "excused").length;
  }

  // === OBTENER EVALUACIONES RECIENTES ===
  const recentAssessments: RecentAssessment[] = [];
  if (coachAthletes.length > 0) {
    const athleteIds = coachAthletes.map((a) => a.id);

    const assessmentRows = await db
      .select({
        id: athleteAssessments.id,
        athleteId: athleteAssessments.athleteId,
        athleteName: athletes.name,
        apparatus: athleteAssessments.apparatus,
        assessmentDate: athleteAssessments.assessmentDate,
        totalScore: athleteAssessments.totalScore,
      })
      .from(athleteAssessments)
      .innerJoin(athletes, eq(athleteAssessments.athleteId, athletes.id))
      .where(inArray(athleteAssessments.athleteId, athleteIds))
      .orderBy(desc(athleteAssessments.assessmentDate))
      .limit(5);

    recentAssessments.push(
      ...assessmentRows.map((a) => ({
        id: a.id,
        athleteId: a.athleteId,
        athleteName: a.athleteName ?? "Atleta",
        apparatus: a.apparatus,
        assessmentDate: a.assessmentDate ? a.assessmentDate.toString() : "",
        totalScore: a.totalScore ? parseFloat(a.totalScore) : null,
      }))
    );
  }

  return (
    <CoachDashboardPage
      academyId={academyId}
      academyName={academy.name}
      academyCountry={academy.country}
      profileName={profile.name ?? user.email ?? null}
      profilePhotoUrl={profile.photoUrl}
      coachId={coach.id}
      athletes={coachAthletes}
      classes={coachClasses}
      todaySessions={todaySessions}
      attendanceStats={attendanceStats}
      recentAssessments={recentAssessments}
    />
  );
}
