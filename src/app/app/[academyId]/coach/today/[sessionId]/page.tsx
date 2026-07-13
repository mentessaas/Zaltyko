import { and, count, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { CoachSessionWorkspace } from "@/components/coach/CoachSessionWorkspace";
import type { SessionWorkspaceApparatus } from "@/components/coach/session-workspace-types";
import { db } from "@/db";
import {
  academies,
  athleteAssessments,
  attendanceRecords,
  classSessions,
  classes,
  coaches,
  groups,
  memberships,
  profiles,
} from "@/db/schema";
import { conversations } from "@/db/schema/direct-messages";
import { getClassAthletes } from "@/lib/classes/get-class-athletes";
import { formatLongDateForCountry, formatTimeForCountry } from "@/lib/date-utils";
import { verifyCoachClassScope } from "@/lib/permissions";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";
import { createClient } from "@/lib/supabase/server";

interface CoachSessionPageProps {
  params: Promise<{
    academyId: string;
    sessionId: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function CoachSessionPage({ params }: CoachSessionPageProps) {
  const { academyId, sessionId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const [profile] = await db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      name: profiles.name,
      role: profiles.role,
      tenantId: profiles.tenantId,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) redirect("/dashboard");

  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      tenantId: academies.tenantId,
      ownerId: academies.ownerId,
      country: academies.country,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) notFound();

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.academyId, academyId), eq(memberships.userId, user.id)))
    .limit(1);

  const hasAcademyAccess =
    profile.role === "super_admin" ||
    academy.ownerId === profile.id ||
    (Boolean(membership) && profile.tenantId === academy.tenantId);
  if (!hasAcademyAccess) redirect("/dashboard");

  const [session] = await db
    .select({
      id: classSessions.id,
      tenantId: classSessions.tenantId,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      status: classSessions.status,
      sessionSportConfigId: classSessions.sportConfigId,
      classId: classes.id,
      className: classes.name,
      classSportConfigId: classes.sportConfigId,
      technicalFocus: classes.technicalFocus,
      classApparatus: classes.apparatus,
      groupId: classes.groupId,
      groupName: groups.name,
      groupColor: groups.color,
      groupSportConfigId: groups.sportConfigId,
      groupApparatus: groups.apparatus,
      coachName: coaches.name,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .leftJoin(groups, eq(classes.groupId, groups.id))
    .leftJoin(coaches, eq(classSessions.coachId, coaches.id))
    .where(
      and(
        eq(classSessions.id, sessionId),
        eq(classSessions.tenantId, academy.tenantId),
        eq(classes.tenantId, academy.tenantId),
        eq(classes.academyId, academyId)
      )
    )
    .limit(1);

  if (!session) notFound();

  const scope = await verifyCoachClassScope({
    tenantId: academy.tenantId,
    academyId,
    classId: session.classId,
    profile,
  });
  if (!scope.allowed) redirect(`/app/${academyId}/coach`);

  const [classAthletes, sportConfigs, attendanceRows, assessmentCountRows, existingConversations] =
    await Promise.all([
      getClassAthletes(session.classId, academyId),
      getAcademySportConfigOptions(academyId),
      db
        .select({
          athleteId: attendanceRecords.athleteId,
          status: attendanceRecords.status,
          notes: attendanceRecords.notes,
        })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.tenantId, academy.tenantId),
            eq(attendanceRecords.sessionId, session.id)
          )
        ),
      db
        .select({ total: count(athleteAssessments.id) })
        .from(athleteAssessments)
        .where(
          and(
            eq(athleteAssessments.tenantId, academy.tenantId),
            eq(athleteAssessments.academyId, academyId),
            eq(athleteAssessments.sessionId, session.id)
          )
        ),
      db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.tenantId, academy.tenantId),
            eq(conversations.academyId, academyId),
            sql`${conversations.metadata}->>'sessionId' = ${session.id}`
          )
        )
        .limit(1),
    ]);

  const configById = new Map(sportConfigs.map((config) => [config.id, config]));
  const effectiveSessionSportConfigId =
    session.sessionSportConfigId ?? session.classSportConfigId ?? session.groupSportConfigId ?? null;
  const sessionConfig = effectiveSessionSportConfigId
    ? configById.get(effectiveSessionSportConfigId)
    : sportConfigs[0];
  const terminology = getTerminologyForSportConfig(sportConfigs, effectiveSessionSportConfigId);

  const apparatusLabelByCode = new Map<string, string>();
  sportConfigs.forEach((config) => {
    config.apparatus.forEach((item) => apparatusLabelByCode.set(item.code, item.name));
  });

  const fallbackApparatusCodes = Array.from(
    new Set([...(session.classApparatus ?? []), ...(session.groupApparatus ?? [])])
  );
  const configuredSessionApparatus =
    sessionConfig?.apparatus.map((item) => ({ code: item.code, name: item.name })) ?? [];
  const sessionApparatus: SessionWorkspaceApparatus[] =
    configuredSessionApparatus.length > 0
      ? configuredSessionApparatus
      : fallbackApparatusCodes.map((code) => ({
          code,
          name: apparatusLabelByCode.get(code) ?? code,
        }));

  const athletes = classAthletes.map((athlete) => {
    const sportConfigId =
      athlete.primarySportConfigId ??
      athlete.groupSportConfigId ??
      effectiveSessionSportConfigId;
    const config = sportConfigId ? configById.get(sportConfigId) : sessionConfig;

    return {
      id: athlete.id,
      name: athlete.name,
      groupName: athlete.groupName,
      groupColor: athlete.groupColor,
      sportConfigId: sportConfigId ?? null,
      disciplineName: config?.disciplineName ?? "Gimnasia",
      branchName: config?.branchName ?? "Modalidad general",
      apparatus:
        config?.apparatus.map((item) => ({ code: item.code, name: item.name })) ??
        sessionApparatus,
    };
  });

  const formattedStart = session.startTime
    ? formatTimeForCountry(`${session.sessionDate}T${session.startTime}`, academy.country)
    : "Sin horario";
  const formattedEnd = session.endTime
    ? formatTimeForCountry(`${session.sessionDate}T${session.endTime}`, academy.country)
    : null;

  const athleteIds = new Set(athletes.map((athlete) => athlete.id));
  const currentAttendanceRows = attendanceRows.filter((row) => athleteIds.has(row.athleteId));

  return (
    <CoachSessionWorkspace
      academyId={academyId}
      academyName={academy.name ?? "Academia"}
      coachName={session.coachName ?? profile.name ?? terminology.coach}
      session={{
        id: session.id,
        classId: session.classId,
        className: session.className,
        sessionDate: session.sessionDate,
        formattedDate: formatLongDateForCountry(session.sessionDate, academy.country),
        formattedTime: formattedEnd ? `${formattedStart} – ${formattedEnd}` : formattedStart,
        groupName: session.groupName,
        groupColor: session.groupColor,
        status: session.status,
        technicalFocus: session.technicalFocus,
        apparatus: sessionApparatus,
      }}
      athletes={athletes}
      initialAttendance={currentAttendanceRows.map((row) => ({
        athleteId: row.athleteId,
        status: row.status as "present" | "absent" | "late" | "excused",
        notes: row.notes,
      }))}
      initialAssessmentCount={Number(assessmentCountRows[0]?.total ?? 0)}
      initialConversationId={existingConversations[0]?.id ?? null}
      terminology={{
        athlete: terminology.athlete,
        athletes: terminology.athletes,
        apparatus: terminology.apparatus,
        attendance: terminology.attendance,
      }}
    />
  );
}
