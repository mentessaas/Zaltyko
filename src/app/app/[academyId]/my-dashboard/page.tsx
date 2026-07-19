import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { academies, memberships, profiles, athletes, guardians, guardianAthletes, groups, classes, classSessions, classEnrollments, attendanceRecords, charges, groupAthletes, coaches, billingItems, athleteAssessments } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { MyDashboardPage } from "./MyDashboardPage";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
  searchParams?: Promise<{
    athleteId?: string;
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
    title: `${name} · Mi Dashboard`,
    description: `Tu panel personal en ${name}.`,
  };
}

interface AthleteWithDetails {
  id: string;
  name: string;
  level: string | null;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  coachName: string | null;
}

interface GuardianWithAthletes {
  guardianId: string;
  athleteId: string;
  athleteName: string;
  athleteLevel: string | null;
  athleteGroupId: string | null;
  athleteGroupName: string | null;
  athleteGroupColor: string | null;
  athleteCoachName: string | null;
}

interface ChargeData {
  id: string;
  label: string;
  amountCents: number;
  period: string;
  status: string;
  dueDate: string | null;
  notes: string | null;
  billingItemName: string | null;
  billingItemDescription: string | null;
}

interface AttendanceData {
  total: number;
  present: number;
  absent: number;
  excused: number;
  recentRecords: {
    date: string;
    status: string;
    className: string;
  }[];
}

interface SessionData {
  id: string;
  classId: string;
  className: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  groupName: string | null;
  groupColor: string | null;
  coachName: string | null;
  technicalFocus: string | null;
  apparatus: string[];
  status: string;
}

export default async function MyDashboard({ params, searchParams }: PageProps) {
  const { academyId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const devSession = await getDevSessionFromCookieStore(cookieStore);
  const userId = user?.id ?? devSession?.userId;

  if (!userId) {
    redirect("/auth/login");
  }

  // Obtener el perfil del usuario
  const [profile] = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      role: profiles.role,
      photoUrl: profiles.photoUrl,
      userId: profiles.userId,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!profile) {
    redirect("/auth/login");
  }

  // Obtener membership para verificar acceso
  const [membership] = await db
    .select({
      role: memberships.role,
    })
    .from(memberships)
    .where(
      and(eq(memberships.userId, userId), eq(memberships.academyId, academyId))
    )
    .limit(1);

  // Verificar que el usuario tiene rol athlete o parent
  const hasAccess = profile.role === "athlete" || profile.role === "parent";

  if (!hasAccess || !membership) {
    // Redirigir según el rol del perfil
    if (profile.role === "owner" || profile.role === "admin" || profile.role === "super_admin") {
      redirect(`/app/${academyId}/dashboard`);
    }
    redirect("/dashboard");
  }

  // Obtener datos de la academia
  const [academy] = await db
    .select({
      id: academies.id,
      tenantId: academies.tenantId,
      name: academies.name,
      country: academies.country,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    redirect("/dashboard");
  }

  // Obtener athlete(s) asociados al usuario
  let athleteData: AthleteWithDetails | null = null;
  let guardianAthletesList: GuardianWithAthletes[] = [];

  if (profile.role === "athlete") {
    // El usuario es un atleta - buscar por userId
    const [athlete] = await db
      .select({
        id: athletes.id,
        name: athletes.name,
        level: athletes.level,
        groupId: athletes.groupId,
      })
      .from(athletes)
      .where(
        and(
          eq(athletes.userId, userId),
          eq(athletes.tenantId, academy.tenantId),
          eq(athletes.academyId, academyId),
          isNull(athletes.deletedAt)
        )
      )
      .limit(1);

    if (athlete) {
      // Obtener detalles del grupo
      let groupName = null;
      let groupColor = null;
      let coachName = null;

      if (athlete.groupId) {
        const [group] = await db
          .select({
            name: groups.name,
            color: groups.color,
            coachId: groups.coachId,
          })
          .from(groups)
          .where(
            and(
              eq(groups.id, athlete.groupId),
              eq(groups.tenantId, academy.tenantId),
              eq(groups.academyId, academyId),
              isNull(groups.deletedAt)
            )
          )
          .limit(1);

        if (group) {
          groupName = group.name;
          groupColor = group.color;

          if (group.coachId) {
            const [coach] = await db
              .select({ name: coaches.name })
              .from(coaches)
              .where(
                and(
                  eq(coaches.id, group.coachId),
                  eq(coaches.tenantId, academy.tenantId),
                  eq(coaches.academyId, academyId)
                )
              )
              .limit(1);
            coachName = coach?.name ?? null;
          }
        }
      }

      athleteData = {
        ...athlete,
        groupName,
        groupColor,
        coachName,
      };
    }
  } else if (profile.role === "parent") {
    // El usuario es un padre/tutor - buscar los atletas asociados
    const [guardian] = await db
      .select({
        id: guardians.id,
      })
      .from(guardians)
      .where(
        and(
          eq(guardians.profileId, profile.id),
          eq(guardians.tenantId, academy.tenantId)
        )
      )
      .limit(1);

    if (guardian) {
      const athletesData = await db
        .select({
          athleteId: guardianAthletes.athleteId,
          athleteName: athletes.name,
          athleteLevel: athletes.level,
          athleteGroupId: athletes.groupId,
          groupName: groups.name,
          groupColor: groups.color,
          coachName: coaches.name,
        })
        .from(guardianAthletes)
        .leftJoin(athletes, eq(guardianAthletes.athleteId, athletes.id))
        .leftJoin(
          groups,
          and(
            eq(athletes.groupId, groups.id),
            eq(groups.tenantId, academy.tenantId),
            eq(groups.academyId, academyId)
          )
        )
        .leftJoin(
          coaches,
          and(
            eq(groups.coachId, coaches.id),
            eq(coaches.tenantId, academy.tenantId),
            eq(coaches.academyId, academyId)
          )
        )
        .where(
          and(
            eq(guardianAthletes.guardianId, guardian.id),
            eq(guardianAthletes.tenantId, academy.tenantId),
            eq(athletes.tenantId, academy.tenantId),
            eq(athletes.academyId, academyId),
            isNull(athletes.deletedAt)
          )
        );

      guardianAthletesList = athletesData.map((a) => ({
        guardianId: guardian.id,
        athleteId: a.athleteId,
        athleteName: a.athleteName ?? "Sin nombre",
        athleteLevel: a.athleteLevel ?? null,
        athleteGroupId: a.athleteGroupId ?? null,
        athleteGroupName: a.groupName ?? null,
        athleteGroupColor: a.groupColor ?? null,
        athleteCoachName: a.coachName ?? null,
      }));
    }
  }

  const selectedParentAthleteId =
    profile.role === "parent" && guardianAthletesList.length > 0
      ? guardianAthletesList.some((athlete) => athlete.athleteId === resolvedSearchParams.athleteId)
        ? resolvedSearchParams.athleteId
        : guardianAthletesList[0]?.athleteId
      : undefined;

  // Obtener clases próximas (para athlete o athlete seleccionado del padre)
  let upcomingClasses: SessionData[] = [];
  const targetAthleteId =
    profile.role === "athlete" ? athleteData?.id : selectedParentAthleteId;
  const targetGroupId =
    profile.role === "athlete"
      ? athleteData?.groupId
      : guardianAthletesList.find((athlete) => athlete.athleteId === selectedParentAthleteId)
          ?.athleteGroupId;

  if (targetAthleteId) {
    // Buscar inscripciones del atleta en clases
    const enrollments = await db
      .select({ classId: classEnrollments.classId })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.athleteId, targetAthleteId),
          eq(classEnrollments.tenantId, academy.tenantId),
          eq(classEnrollments.academyId, academyId)
        )
      );

    const enrolledClassIds = enrollments.map((e) => e.classId);

    // Buscar si el atleta pertenece a algún grupo
    const athleteGroupMemberships = await db
      .select({ groupId: groupAthletes.groupId })
      .from(groupAthletes)
      .where(
        and(
          eq(groupAthletes.athleteId, targetAthleteId),
          eq(groupAthletes.tenantId, academy.tenantId)
        )
      );

    const groupIds = athleteGroupMemberships.map((g) => g.groupId);

    // Obtener clases del grupo y clases inscritas
    let classIds: string[] = [...enrolledClassIds];

    if (groupIds.length > 0) {
      const groupClasses = await db
        .select({ id: classes.id })
        .from(classes)
        .where(
          and(
            inArray(classes.groupId, groupIds),
            eq(classes.tenantId, academy.tenantId),
            eq(classes.academyId, academyId),
            isNull(classes.deletedAt)
          )
        );

      classIds = [...new Set([...classIds, ...groupClasses.map((c) => c.id)])];
    }

    if (classIds.length > 0) {
      // Obtener sesiones próximas (hoy + 7 días)
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const todayStr = today.toISOString().split("T")[0];
      const nextWeekStr = nextWeek.toISOString().split("T")[0];

      const sessions = await db
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
          coachName: coaches.name,
          technicalFocus: classes.technicalFocus,
          apparatus: classes.apparatus,
        })
        .from(classSessions)
        .leftJoin(classes, eq(classSessions.classId, classes.id))
        .leftJoin(
          groups,
          and(
            eq(classes.groupId, groups.id),
            eq(groups.tenantId, academy.tenantId),
            eq(groups.academyId, academyId)
          )
        )
        .leftJoin(
          coaches,
          and(
            eq(classSessions.coachId, coaches.id),
            eq(coaches.tenantId, academy.tenantId),
            eq(coaches.academyId, academyId)
          )
        )
        .where(
          and(
            inArray(classSessions.classId, classIds),
            eq(classSessions.tenantId, academy.tenantId),
            eq(classes.tenantId, academy.tenantId),
            eq(classes.academyId, academyId),
            inArray(classSessions.status, ["scheduled", "in_progress"]),
            gte(classSessions.sessionDate, todayStr),
            lte(classSessions.sessionDate, nextWeekStr)
          )
        )
        .orderBy(classSessions.sessionDate, classSessions.startTime)
        .limit(10);

      upcomingClasses = sessions.map((s) => ({
        id: s.id,
        classId: s.classId,
        className: s.className ?? "Clase",
        sessionDate: s.sessionDate,
        startTime: s.startTime,
        endTime: s.endTime,
        groupName: s.groupName,
        groupColor: s.groupColor,
        coachName: s.coachName,
        technicalFocus: s.technicalFocus ?? null,
        apparatus: s.apparatus ?? [],
        status: s.status,
      }));
    }
  }

  // Obtener datos de asistencia
  let attendanceData: AttendanceData | null = null;

  if (targetAthleteId) {
    // Obtener últimos 30 días de asistencia
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const attendanceRecordsList = await db
      .select({
        id: attendanceRecords.id,
        status: attendanceRecords.status,
        recordedAt: attendanceRecords.recordedAt,
        sessionDate: classSessions.sessionDate,
        className: classes.name,
      })
      .from(attendanceRecords)
      .leftJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
      .leftJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          eq(attendanceRecords.athleteId, targetAthleteId),
          eq(attendanceRecords.tenantId, academy.tenantId),
          eq(classSessions.tenantId, academy.tenantId),
          eq(classes.tenantId, academy.tenantId),
          eq(classes.academyId, academyId),
          inArray(attendanceRecords.status, ["present", "absent", "excused"]),
          gte(classSessions.sessionDate, thirtyDaysAgoStr),
          lte(classSessions.sessionDate, new Date().toISOString().split("T")[0])
        )
      )
      .orderBy(classSessions.sessionDate)
      .limit(30);

    const present = attendanceRecordsList.filter((r) => r.status === "present").length;
    const absent = attendanceRecordsList.filter((r) => r.status === "absent").length;
    const excused = attendanceRecordsList.filter((r) => r.status === "excused").length;

    attendanceData = {
      total: attendanceRecordsList.length,
      present,
      absent,
      excused,
      recentRecords: attendanceRecordsList.slice(-5).map((r) => ({
        date: r.sessionDate ?? "",
        status: r.status,
        className: r.className ?? "Clase",
      })),
    };
  }

  // Obtener datos de pagos/charges
  let chargesData: ChargeData[] = [];

  if (targetAthleteId) {
    const chargesList = await db
      .select({
        id: charges.id,
        label: charges.label,
        amountCents: charges.amountCents,
        period: charges.period,
        status: charges.status,
        dueDate: charges.dueDate,
        notes: charges.notes,
        billingItemName: billingItems.name,
        billingItemDescription: billingItems.description,
      })
      .from(charges)
      .leftJoin(
        billingItems,
        and(
          eq(charges.billingItemId, billingItems.id),
          eq(billingItems.tenantId, academy.tenantId),
          eq(billingItems.academyId, academyId)
        )
      )
      .where(
        and(
          eq(charges.athleteId, targetAthleteId),
          eq(charges.tenantId, academy.tenantId),
          eq(charges.academyId, academyId),
          inArray(charges.status, ["pending", "overdue", "paid"])
        )
      )
      .orderBy(charges.dueDate)
      .limit(10);

    chargesData = chargesList.map((c) => ({
      id: c.id,
      label: c.label,
      amountCents: c.amountCents,
      period: c.period,
      status: c.status,
      dueDate: c.dueDate,
      notes: c.notes ?? null,
      billingItemName: c.billingItemName ?? null,
      billingItemDescription: c.billingItemDescription ?? null,
    }));
  }

  // Obtener información de horarios semanales (clases programadas por grupo)
  let weeklySchedule: { day: number; className: string; time: string }[] = [];

  if (targetAthleteId && targetGroupId) {
    const weeklyClasses = await db
      .select({
        weekday: classes.weekday,
        name: classes.name,
        startTime: classes.startTime,
        endTime: classes.endTime,
      })
      .from(classes)
      .where(
        and(
          eq(classes.groupId, targetGroupId),
          eq(classes.tenantId, academy.tenantId),
          eq(classes.academyId, academyId),
          isNull(classes.deletedAt)
        )
      );

    weeklySchedule = weeklyClasses.map((c) => ({
      day: c.weekday ?? 0,
      className: c.name ?? "Clase",
      time: c.startTime ? `${c.startTime.substring(0, 5)}${c.endTime ? ` - ${c.endTime.substring(0, 5)}` : ""}` : "Por definir",
    }));
  }

  let assessmentsData: {
    id: string;
    assessmentDate: string;
    apparatus: string | null;
    overallComment: string | null;
    assessedByName: string | null;
  }[] = [];

  if (targetAthleteId) {
    const assessmentRows = await db
      .select({
        id: athleteAssessments.id,
        assessmentDate: athleteAssessments.assessmentDate,
        apparatus: athleteAssessments.apparatus,
        overallComment: athleteAssessments.overallComment,
      })
      .from(athleteAssessments)
      .where(
        and(
          eq(athleteAssessments.athleteId, targetAthleteId),
          eq(athleteAssessments.tenantId, academy.tenantId),
          eq(athleteAssessments.academyId, academyId)
        )
      )
      .orderBy(athleteAssessments.assessmentDate)
      .limit(5);

    assessmentsData = assessmentRows
      .map((item) => ({
        id: item.id,
        assessmentDate: String(item.assessmentDate),
        apparatus: item.apparatus,
        overallComment: item.overallComment ?? null,
        assessedByName: null,
      }))
      .reverse();
  }

  let calendarSessions: {
    date: string;
    sessions: {
      id: string;
      className: string;
      startTime: string | null;
      endTime: string | null;
      groupName: string | null;
      groupColor: string | null;
      technicalFocus: string | null;
      apparatus: string[];
    }[];
  }[] = [];

  if (targetAthleteId) {
    const enrollments = await db
      .select({ classId: classEnrollments.classId })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.athleteId, targetAthleteId),
          eq(classEnrollments.tenantId, academy.tenantId),
          eq(classEnrollments.academyId, academyId)
        )
      );

    const enrolledClassIds = enrollments.map((e) => e.classId);
    const athleteGroupMemberships = await db
      .select({ groupId: groupAthletes.groupId })
      .from(groupAthletes)
      .where(
        and(
          eq(groupAthletes.athleteId, targetAthleteId),
          eq(groupAthletes.tenantId, academy.tenantId)
        )
      );

    const athleteGroupIds = athleteGroupMemberships.map((g) => g.groupId);
    let relatedClassIds: string[] = [...enrolledClassIds];

    if (athleteGroupIds.length > 0) {
      const groupClasses = await db
        .select({ id: classes.id })
        .from(classes)
        .where(
          and(
            inArray(classes.groupId, athleteGroupIds),
            eq(classes.tenantId, academy.tenantId),
            eq(classes.academyId, academyId),
            isNull(classes.deletedAt)
          )
        );

      relatedClassIds = [...new Set([...relatedClassIds, ...groupClasses.map((c) => c.id)])];
    }

    if (relatedClassIds.length > 0) {
      const today = new Date();
      const nextFourteenDays = new Date(today);
      nextFourteenDays.setDate(nextFourteenDays.getDate() + 14);
      const todayStr = today.toISOString().split("T")[0];
      const nextStr = nextFourteenDays.toISOString().split("T")[0];

      const calendarRows = await db
        .select({
          id: classSessions.id,
          classId: classSessions.classId,
          className: classes.name,
          sessionDate: classSessions.sessionDate,
          startTime: classSessions.startTime,
          endTime: classSessions.endTime,
          groupName: groups.name,
          groupColor: groups.color,
          technicalFocus: classes.technicalFocus,
          apparatus: classes.apparatus,
        })
        .from(classSessions)
        .leftJoin(classes, eq(classSessions.classId, classes.id))
        .leftJoin(
          groups,
          and(
            eq(classes.groupId, groups.id),
            eq(groups.tenantId, academy.tenantId),
            eq(groups.academyId, academyId)
          )
        )
        .where(
          and(
            inArray(classSessions.classId, relatedClassIds),
            eq(classSessions.tenantId, academy.tenantId),
            eq(classes.tenantId, academy.tenantId),
            eq(classes.academyId, academyId),
            inArray(classSessions.status, ["scheduled", "in_progress"]),
            gte(classSessions.sessionDate, todayStr),
            lte(classSessions.sessionDate, nextStr)
          )
        )
        .orderBy(classSessions.sessionDate, classSessions.startTime);

      const grouped = new Map<
        string,
        {
          id: string;
          className: string;
          startTime: string | null;
          endTime: string | null;
          groupName: string | null;
          groupColor: string | null;
          technicalFocus: string | null;
          apparatus: string[];
        }[]
      >();

      calendarRows.forEach((row) => {
        const key = row.sessionDate;
        const current = grouped.get(key) ?? [];
        current.push({
          id: row.id,
          className: row.className ?? "Clase",
          startTime: row.startTime,
          endTime: row.endTime,
          groupName: row.groupName,
          groupColor: row.groupColor,
          technicalFocus: row.technicalFocus ?? null,
          apparatus: row.apparatus ?? [],
        });
        grouped.set(key, current);
      });

      calendarSessions = Array.from(grouped.entries()).map(([date, sessions]) => ({
        date,
        sessions,
      }));
    }
  }

  return (
    <MyDashboardPage
      academyId={academyId}
      academyName={academy.name}
      academyCountry={academy.country}
      profileName={profile.name}
      profileRole={profile.role}
      profilePhotoUrl={profile.photoUrl}
      athleteData={athleteData}
      guardianAthletes={guardianAthletesList}
      upcomingClasses={upcomingClasses}
      attendanceData={attendanceData}
      chargesData={chargesData}
      weeklySchedule={weeklySchedule}
      assessmentsData={assessmentsData}
      calendarSessions={calendarSessions}
    />
  );
}
