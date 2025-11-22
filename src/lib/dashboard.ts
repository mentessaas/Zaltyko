import { addDays, endOfWeek, formatISO, startOfWeek, subDays } from "date-fns";
import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  athleteAssessments,
  attendanceRecords,
  auditLogs,
  classCoachAssignments,
  classSessions,
  classes,
  classWeekdays,
  coaches,
  groupAthletes,
  groups,
  plans,
  profiles,
  subscriptions,
} from "@/db/schema";
import { getActiveSubscription } from "@/lib/limits";

export interface DashboardMetrics {
  athletes: number;
  coaches: number;
  groups: number;
  classesThisWeek: number;
  assessments: number;
  attendancePercent: number;
}

export interface DashboardPlanUsage {
  planCode: string;
  planNickname: string | null;
  status: string;
  athleteLimit: number | null;
  classLimit: number | null;
  usedAthletes: number;
  usedClasses: number;
  athletePercent: number;
  classPercent: number;
}

export interface DashboardUpcomingClass {
  id: string;
  classId: string;
  className: string | null;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  coaches: Array<{ id: string; name: string | null }>;
  groupName: string | null;
  groupColor: string | null;
  isSessionPlaceholder?: boolean;
}

export interface DashboardActivity {
  id: string;
  action: string;
  description: string;
  createdAt: Date;
  userName: string | null;
}

export interface DashboardGroupSummary {
  id: string;
  name: string;
  discipline: string;
  color: string | null;
  coachName: string | null;
  athleteCount: number;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  plan: DashboardPlanUsage;
  upcomingClasses: DashboardUpcomingClass[];
  recentActivity: DashboardActivity[];
  groups: DashboardGroupSummary[];
}

function getWeekBoundaries(): { start: Date; end: Date } {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 });
  const end = endOfWeek(new Date(), { weekStartsOn: 1 });
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function normalizeDate(date: Date | string): string {
  if (typeof date === "string") return date;
  return formatISO(date, { representation: "date" });
}

function describeWeekdays(weekdays: number[] | undefined): string {
  if (!weekdays || weekdays.length === 0) {
    return "Sin días asignados";
  }
  const labels = weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day] ?? `Día ${day + 1}`);
  return labels.join(", ");
}

function summarizeActivity(action: string, meta: Record<string, unknown> | null): string {
  const name = typeof meta?.name === "string" ? meta.name : undefined;
  const entity = typeof meta?.entity === "string" ? meta.entity : undefined;

  switch (action) {
    case "athlete.created":
      return `Nuevo atleta ${name ?? ""}`.trim();
    case "coach.created":
      return `Entrenador incorporado ${name ?? ""}`.trim();
    case "group.created":
      return `Grupo creado ${name ?? ""}`.trim();
    case "assessment.created":
      return `Evaluación registrada${name ? ` para ${name}` : ""}`.trim();
    case "class.created":
      return `Clase creada ${name ?? ""}`.trim();
    case "class.session.created":
      return "Sesión de clase programada";
    default:
      return entity ? `${entity} actualizado` : action.replace(".", " ");
  }
}

export async function getDashboardData(academyId: string): Promise<{
  academy: { id: string; name: string | null; academyType: string | null; tenantId: string | null };
  data: DashboardData;
}> {
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      tenantId: academies.tenantId,
      academyType: academies.academyType,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    throw new Error("ACADEMY_NOT_FOUND");
  }

  const [{ value: athleteCount }] = await db
    .select({ value: count() })
    .from(athletes)
    .where(eq(athletes.academyId, academyId));

  const [{ value: coachCount }] = await db
    .select({ value: count() })
    .from(coaches)
    .where(eq(coaches.academyId, academyId));

  const [{ value: groupCount }] = await db
    .select({ value: count() })
    .from(groups)
    .where(eq(groups.academyId, academyId));

  const week = getWeekBoundaries();
  const weekStartIso = formatISO(week.start, { representation: "date" });
  const weekEndIso = formatISO(week.end, { representation: "date" });

  const [{ value: classesWeekCount }] = await db
    .select({ value: count() })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classes.academyId, academyId),
        gte(classSessions.sessionDate, weekStartIso),
        lte(classSessions.sessionDate, weekEndIso)
      )
    );

  const [{ value: scheduledClassesCount }] = await db
    .select({ value: sql<number>`count(distinct ${classWeekdays.classId})` })
    .from(classWeekdays)
    .innerJoin(classes, eq(classWeekdays.classId, classes.id))
    .where(eq(classes.academyId, academyId));

  const [{ value: assessmentsCount }] = await db
    .select({ value: count() })
    .from(athleteAssessments)
    .where(eq(athleteAssessments.academyId, academyId));

  const classesMetric =
    Number(classesWeekCount ?? 0) > 0
      ? Number(classesWeekCount ?? 0)
      : Number(scheduledClassesCount ?? 0);

  // Calcular % de asistencia de los últimos 7 días
  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);
  const sevenDaysAgoIso = formatISO(sevenDaysAgo, { representation: "date" });
  const nowIso = formatISO(now, { representation: "date" });

  // Contar total de registros de asistencia de los últimos 7 días
  const [{ value: totalAttendanceCount }] = await db
    .select({ value: count() })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classes.academyId, academyId),
        gte(classSessions.sessionDate, sevenDaysAgoIso),
        lte(classSessions.sessionDate, nowIso)
      )
    );

  // Contar asistencias "present" de los últimos 7 días
  const [{ value: presentCount }] = await db
    .select({ value: count() })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classes.academyId, academyId),
        eq(attendanceRecords.status, "present"),
        gte(classSessions.sessionDate, sevenDaysAgoIso),
        lte(classSessions.sessionDate, nowIso)
      )
    );

  // Calcular % de asistencia (present / total registros)
  const totalAttendances = Number(totalAttendanceCount ?? 0);
  const presentAttendances = Number(presentCount ?? 0);
  const attendancePercent =
    totalAttendances > 0 ? Math.round((presentAttendances / totalAttendances) * 100) : 0;

  const metrics: DashboardMetrics = {
    athletes: Number(athleteCount ?? 0),
    coaches: Number(coachCount ?? 0),
    groups: Number(groupCount ?? 0),
    classesThisWeek: classesMetric,
    assessments: Number(assessmentsCount ?? 0),
    attendancePercent,
  };

  const activePlan = await getActiveSubscription(academyId);
  
  // Get subscription from academy owner
  let subscription: { status: string | null; planCode: string | null; nickname: string | null } | null = null;
  
  const [academyWithOwner] = await db
    .select({
      ownerId: academies.ownerId,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (academyWithOwner?.ownerId) {
    const [owner] = await db
      .select({
        userId: profiles.userId,
      })
      .from(profiles)
      .where(eq(profiles.id, academyWithOwner.ownerId))
      .limit(1);

    if (owner) {
      const [sub] = await db
        .select({
          status: subscriptions.status,
          planCode: plans.code,
          nickname: plans.nickname,
        })
        .from(subscriptions)
        .leftJoin(plans, eq(subscriptions.planId, plans.id))
        .where(eq(subscriptions.userId, owner.userId))
        .limit(1);
      subscription = sub ?? null;
    }
  }

  const [{ value: classesTotal }] = await db
    .select({ value: count() })
    .from(classes)
    .where(eq(classes.academyId, academyId));

  const plan: DashboardPlanUsage = {
    planCode: (subscription?.planCode as string | undefined) ?? activePlan.planCode,
    planNickname: subscription?.nickname ?? null,
    status: subscription?.status ?? "active",
    athleteLimit: activePlan.athleteLimit,
    classLimit: activePlan.classLimit,
    usedAthletes: metrics.athletes,
    usedClasses: Number(classesTotal ?? 0),
    athletePercent:
      activePlan.athleteLimit != null && activePlan.athleteLimit > 0
        ? Math.min(100, Math.round((metrics.athletes / activePlan.athleteLimit) * 100))
        : 0,
    classPercent:
      activePlan.classLimit != null && activePlan.classLimit > 0
        ? Math.min(100, Math.round((Number(classesTotal ?? 0) / activePlan.classLimit) * 100))
        : 0,
  };

  const lookAheadEnd = addDays(now, 7);
  const lookAheadIso = formatISO(lookAheadEnd, { representation: "date" });

  const upcomingSessionRows = await db
    .select({
      sessionId: classSessions.id,
      classId: classes.id,
      className: classes.name,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classes.academyId, academyId),
        gte(classSessions.sessionDate, nowIso),
        lte(classSessions.sessionDate, lookAheadIso)
      )
    )
    .orderBy(asc(classSessions.sessionDate), asc(classSessions.startTime))
    .limit(10);

  const classIds = upcomingSessionRows.map((session) => session.classId);

  let classCoachRows: Array<{ classId: string; coachId: string; coachName: string | null }> = [];
  if (classIds.length > 0) {
    classCoachRows = await db
      .select({
        classId: classCoachAssignments.classId,
        coachId: classCoachAssignments.coachId,
        coachName: coaches.name,
      })
      .from(classCoachAssignments)
      .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
      .where(inArray(classCoachAssignments.classId, classIds));
  }

  const coachIds = Array.from(
    new Set(classCoachRows.map((assignment) => assignment.coachId).filter(Boolean))
  );

  let groupsByCoach: Map<string, { name: string | null; color: string | null }> = new Map();
  if (coachIds.length > 0) {
    const coachGroups = await db
      .select({
        coachId: groups.coachId,
        name: groups.name,
        color: groups.color,
      })
      .from(groups)
      .where(and(eq(groups.academyId, academyId), inArray(groups.coachId, coachIds)));

    groupsByCoach = coachGroups.reduce((accumulator, current) => {
      if (current.coachId) {
        accumulator.set(current.coachId, {
          name: current.name ?? null,
          color: current.color ?? null,
        });
      }
      return accumulator;
    }, new Map<string, { name: string | null; color: string | null }>());
  }

  let upcomingClasses: DashboardUpcomingClass[] = upcomingSessionRows.slice(0, 3).map((session) => {
    const assignedCoaches = classCoachRows
      .filter((assignment) => assignment.classId === session.classId)
      .map((assignment) => ({
        id: assignment.coachId,
        name: assignment.coachName,
      }));

    const primaryCoach = assignedCoaches[0];
    const groupInfo = primaryCoach ? groupsByCoach.get(primaryCoach.id) ?? null : null;

    return {
      id: session.sessionId,
      classId: session.classId,
      className: session.className,
      sessionDate: session.sessionDate ? normalizeDate(session.sessionDate) : normalizeDate(new Date()),
      startTime: session.startTime,
      endTime: session.endTime,
      coaches: assignedCoaches,
      groupName: groupInfo?.name ?? null,
      groupColor: groupInfo?.color ?? null,
    };
  });

  if (upcomingClasses.length === 0) {
    const fallbackClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        startTime: classes.startTime,
        endTime: classes.endTime,
      })
      .from(classes)
      .where(eq(classes.academyId, academyId))
      .orderBy(asc(classes.name))
      .limit(3);

    if (fallbackClasses.length > 0) {
      const fallbackIds = fallbackClasses.map((item) => item.id);
      const weekdayRows =
        fallbackIds.length === 0
          ? []
          : await db
              .select({
                classId: classWeekdays.classId,
                weekday: classWeekdays.weekday,
              })
              .from(classWeekdays)
              .where(inArray(classWeekdays.classId, fallbackIds));

      const weekdayMap = weekdayRows.reduce((acc, row) => {
        const current = acc.get(row.classId) ?? [];
        current.push(row.weekday);
        acc.set(row.classId, current);
        return acc;
      }, new Map<string, number[]>());

      upcomingClasses = fallbackClasses.map((item) => ({
        id: item.id,
        classId: item.id,
        className: item.name,
        sessionDate: describeWeekdays(weekdayMap.get(item.id)),
        startTime: item.startTime,
        endTime: item.endTime,
        coaches: [],
        groupName: null,
        groupColor: null,
        isSessionPlaceholder: true,
      }));
    }
  }

  const activities = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      meta: auditLogs.meta,
      createdAt: auditLogs.createdAt,
      userName: profiles.name,
    })
    .from(auditLogs)
    .leftJoin(profiles, eq(profiles.userId, auditLogs.userId))
    .where(eq(auditLogs.tenantId, academy.tenantId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(8);

  const recentActivity: DashboardActivity[] = activities.map((row) => ({
    id: row.id,
    action: row.action,
    description: summarizeActivity(
      row.action,
      (row.meta as Record<string, unknown> | null) ?? null
    ),
    createdAt: row.createdAt ?? new Date(),
    userName: row.userName ?? null,
  }));

  let activityFeed = recentActivity;

  if (activityFeed.length === 0) {
    const [recentAthletes, recentCoaches, recentGroups, recentClasses] = await Promise.all([
      db
        .select({
          id: athletes.id,
          name: athletes.name,
          createdAt: athletes.createdAt,
        })
        .from(athletes)
        .where(eq(athletes.academyId, academyId))
        .orderBy(desc(athletes.createdAt))
        .limit(5),
      db
        .select({
          id: coaches.id,
          name: coaches.name,
          createdAt: coaches.createdAt,
        })
        .from(coaches)
        .where(eq(coaches.academyId, academyId))
        .orderBy(desc(coaches.createdAt))
        .limit(5),
      db
        .select({
          id: groups.id,
          name: groups.name,
          createdAt: groups.createdAt,
        })
        .from(groups)
        .where(eq(groups.academyId, academyId))
        .orderBy(desc(groups.createdAt))
        .limit(5),
      db
        .select({
          id: classes.id,
          name: classes.name,
          createdAt: classes.createdAt,
        })
        .from(classes)
        .where(eq(classes.academyId, academyId))
        .orderBy(desc(classes.createdAt))
        .limit(5),
    ]);

    const fallbackEntries: DashboardActivity[] = [
      ...recentAthletes.map((row) => ({
        id: `athlete-${row.id}`,
        action: "athlete.created",
        description: summarizeActivity("athlete.created", { name: row.name ?? undefined }),
        createdAt: row.createdAt ?? new Date(),
        userName: null,
      })),
      ...recentCoaches.map((row) => ({
        id: `coach-${row.id}`,
        action: "coach.created",
        description: summarizeActivity("coach.created", { name: row.name ?? undefined }),
        createdAt: row.createdAt ?? new Date(),
        userName: null,
      })),
      ...recentGroups.map((row) => ({
        id: `group-${row.id}`,
        action: "group.created",
        description: summarizeActivity("group.created", { name: row.name ?? undefined }),
        createdAt: row.createdAt ?? new Date(),
        userName: null,
      })),
      ...recentClasses.map((row) => ({
        id: `class-${row.id}`,
        action: "class.created",
        description: summarizeActivity("class.created", { name: row.name ?? undefined }),
        createdAt: row.createdAt ?? new Date(),
        userName: null,
      })),
    ];

    activityFeed = fallbackEntries
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 8);
  }

  const groupSummaries = await db
    .select({
      id: groups.id,
      name: groups.name,
      discipline: groups.discipline,
      color: groups.color,
      coachName: coaches.name,
      athleteCount: sql<number>`count(distinct ${groupAthletes.athleteId})`,
    })
    .from(groups)
    .leftJoin(coaches, eq(groups.coachId, coaches.id))
    .leftJoin(groupAthletes, eq(groupAthletes.groupId, groups.id))
    .where(eq(groups.academyId, academyId))
    .groupBy(groups.id, coaches.name)
    .orderBy(desc(sql`count(distinct ${groupAthletes.athleteId})`), asc(groups.name))
    .limit(5);

  const groupsList: DashboardGroupSummary[] = groupSummaries.map((row) => ({
    id: row.id,
    name: row.name ?? "Grupo sin nombre",
    discipline: row.discipline ?? "general",
    color: row.color,
    coachName: row.coachName,
    athleteCount: Number(row.athleteCount ?? 0),
  }));

  return {
    academy: {
      id: academy.id,
      name: academy.name,
      tenantId: academy.tenantId,
      academyType: academy.academyType,
    },
    data: {
      metrics,
      plan,
      upcomingClasses,
      recentActivity: activityFeed,
      groups: groupsList,
    },
  };
}

