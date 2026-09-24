import { formatISO } from "date-fns";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

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
  events,
  federativeLicenses,
  groupAthletes,
  groups,
  profiles,
} from "@/db/schema";
import { getActiveSubscription } from "@/lib/limits";
import { logger } from "@/lib/logger";
import {
  addDaysToCalendarDate,
  formatDateToISOString,
  getTimezoneForCountry,
  getWeekCalendarDateKeys,
} from "@/lib/date-utils";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";

export interface DashboardMetrics {
  athletes: number;
  coaches: number;
  groups: number;
  classesThisWeek: number;
  /** Plantillas recurrentes activas; no son sesiones impartibles todavía. */
  classTemplates?: number;
  assessments: number;
  attendancePercent: number;
}

export interface DashboardSportConfigBreakdown {
  sportConfigId: string;
  label: string;
  disciplineName: string;
  branchName: string;
  athletes: number;
  groups: number;
  classes: number;
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

export interface AthleteCategoryCount {
  category: string;
  count: number;
}

export interface ExpiringLicense {
  id: string;
  personId: string;
  personName: string | null;
  licenseType: string;
  federation: string;
  validUntil: string;
  daysUntilExpiry: number;
}

export interface UpcomingCompetition {
  id: string;
  title: string;
  startDate: string;
  level: string;
  status: string;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  plan: DashboardPlanUsage;
  upcomingClasses: DashboardUpcomingClass[];
  recentActivity: DashboardActivity[];
  groups: DashboardGroupSummary[];
  sportConfigBreakdown: DashboardSportConfigBreakdown[];
  // GR-specific metrics
  grMetrics?: {
    athletesByCategory: AthleteCategoryCount[];
    expiringLicenses: ExpiringLicense[];
    expiringLicensesThisWeek: number;
    expiringLicensesThisMonth: number;
    upcomingCompetitions: UpcomingCompetition[];
    assessmentsThisMonth: number;
    totalAthletesWithActiveLicense: number;
  };
}

function resolveDashboardTimezone(input: {
  timezone?: string | null;
  countryCode?: string | null;
  country?: string | null;
}): string {
  const fallback = getTimezoneForCountry(input.countryCode ?? input.country);
  const candidate = input.timezone?.trim();

  if (!candidate) return fallback;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return fallback;
  }
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
  academy: {
    id: string;
    name: string | null;
    academyType: string | null;
    tenantId: string | null;
    country: string | null;
    timezone: string;
  };
  data: DashboardData;
}> {
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      tenantId: academies.tenantId,
      academyType: academies.academyType,
      country: academies.country,
      countryCode: academies.countryCode,
      timezone: academies.timezone,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    throw new Error("ACADEMY_NOT_FOUND");
  }

  // Todas las métricas del panel deben usar el mismo alcance de academia y
  // tenant. Sin este filtro, registros legacy o eliminados pueden inflar KPIs
  // y, con una consulta privilegiada, aparecer en el panel equivocado.
  const tenantId = academy.tenantId;
  const activeAthleteScope = and(
    eq(athletes.academyId, academyId),
    eq(athletes.tenantId, tenantId),
    isNull(athletes.deletedAt)
  );
  const activeCoachScope = and(
    eq(coaches.academyId, academyId),
    eq(coaches.tenantId, tenantId)
  );
  const activeGroupScope = and(
    eq(groups.academyId, academyId),
    eq(groups.tenantId, tenantId),
    isNull(groups.deletedAt)
  );
  const activeClassScope = and(
    eq(classes.academyId, academyId),
    eq(classes.tenantId, tenantId),
    isNull(classes.deletedAt)
  );

  const academyTimezone = resolveDashboardTimezone({
    timezone: academy.timezone,
    countryCode: academy.countryCode,
    country: academy.country,
  });
  const week = getWeekCalendarDateKeys(new Date(), academyTimezone);
  const weekStartIso = week.start;
  const weekEndIso = week.end;

  // Calcular % de asistencia de los últimos 7 días
  const now = new Date();
  const nowIso = formatDateToISOString(now, academy.country);
  const sevenDaysAgoIso = addDaysToCalendarDate(nowIso, -7) ?? nowIso;

  // Ejecutar todas las consultas de métricas en paralelo para mejor rendimiento
  const [
    athleteResult,
    coachResult,
    groupResult,
    classesWeekResult,
    scheduledClassesResult,
    assessmentsResult,
    totalAttendanceResult,
    presentAttendanceResult,
    classesTotalResult,
  ] = await Promise.all([
    // unbounded-read-ok: dashboard aggregate count
    db.select({ value: count() }).from(athletes).where(activeAthleteScope),
    // unbounded-read-ok: dashboard aggregate count
    db.select({ value: count() }).from(coaches).where(activeCoachScope),
    // unbounded-read-ok: dashboard aggregate count
    db.select({ value: count() }).from(groups).where(activeGroupScope),
    // unbounded-read-ok: dashboard aggregate count over scoped week
    db
      .select({ value: count() })
      .from(classSessions)
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          activeClassScope,
          gte(classSessions.sessionDate, weekStartIso),
          lte(classSessions.sessionDate, weekEndIso)
        )
      ),
    db
      .select({ value: sql<number>`count(distinct ${classWeekdays.classId})` })
      .from(classWeekdays)
      .innerJoin(classes, eq(classWeekdays.classId, classes.id))
      .where(activeClassScope),
    db
      .select({ value: count() })
      .from(athleteAssessments)
      .where(and(eq(athleteAssessments.academyId, academyId), eq(athleteAssessments.tenantId, tenantId))),
    db
      .select({ value: count() })
      .from(attendanceRecords)
      .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          activeClassScope,
          gte(classSessions.sessionDate, sevenDaysAgoIso),
          lte(classSessions.sessionDate, nowIso)
        )
      ),
    db
      .select({ value: count() })
      .from(attendanceRecords)
      .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          activeClassScope,
          eq(attendanceRecords.status, "present"),
          gte(classSessions.sessionDate, sevenDaysAgoIso),
          lte(classSessions.sessionDate, nowIso)
        )
      ),
    db.select({ value: count() }).from(classes).where(activeClassScope),
  ]);

  const athleteCount = athleteResult[0]?.value ?? 0;
  const coachCount = coachResult[0]?.value ?? 0;
  const groupCount = groupResult[0]?.value ?? 0;
  const classesWeekCount = classesWeekResult[0]?.value ?? 0;
  const classTemplatesCount = scheduledClassesResult[0]?.value ?? 0;
  const assessmentsCount = assessmentsResult[0]?.value ?? 0;
  const totalAttendanceCount = totalAttendanceResult[0]?.value ?? 0;
  const presentCount = presentAttendanceResult[0]?.value ?? 0;
  const classesTotal = classesTotalResult[0]?.value ?? 0;

  // Calcular % de asistencia (present / total registros)
  const totalAttendances = Number(totalAttendanceCount ?? 0);
  const presentAttendances = Number(presentCount ?? 0);
  const attendancePercent =
    totalAttendances > 0 ? Math.round((presentAttendances / totalAttendances) * 100) : 0;

  const metrics: DashboardMetrics = {
    athletes: Number(athleteCount ?? 0),
    coaches: Number(coachCount ?? 0),
    groups: Number(groupCount ?? 0),
    classesThisWeek: Number(classesWeekCount ?? 0),
    classTemplates: Number(classTemplatesCount ?? 0),
    assessments: Number(assessmentsCount ?? 0),
    attendancePercent,
  };

  const sportConfigs = await getAcademySportConfigOptions(academyId);
  const activeSportConfigIds = sportConfigs.map((config) => config.id);
  const [athleteSportCounts, groupSportCounts, classSportCounts] =
    activeSportConfigIds.length > 0
      ? await Promise.all([
          db
            .select({
              sportConfigId: athletes.primarySportConfigId,
              count: count(),
            })
            .from(athletes)
            .where(and(activeAthleteScope, inArray(athletes.primarySportConfigId, activeSportConfigIds)))
            .groupBy(athletes.primarySportConfigId),
          db
            .select({
              sportConfigId: groups.sportConfigId,
              count: count(),
            })
            .from(groups)
            .where(and(activeGroupScope, inArray(groups.sportConfigId, activeSportConfigIds)))
            .groupBy(groups.sportConfigId),
          db
            .select({
              sportConfigId: classes.sportConfigId,
              count: count(),
            })
            .from(classes)
            .where(and(activeClassScope, inArray(classes.sportConfigId, activeSportConfigIds)))
            .groupBy(classes.sportConfigId),
        ])
      : [[], [], []];

  const athleteCountBySport = new Map(athleteSportCounts.map((row) => [row.sportConfigId, Number(row.count ?? 0)]));
  const groupCountBySport = new Map(groupSportCounts.map((row) => [row.sportConfigId, Number(row.count ?? 0)]));
  const classCountBySport = new Map(classSportCounts.map((row) => [row.sportConfigId, Number(row.count ?? 0)]));
  const sportConfigBreakdown: DashboardSportConfigBreakdown[] = sportConfigs.map((config) => ({
    sportConfigId: config.id,
    label: config.branchName,
    disciplineName: config.disciplineName,
    branchName: config.branchName,
    athletes: athleteCountBySport.get(config.id) ?? 0,
    groups: groupCountBySport.get(config.id) ?? 0,
    classes: classCountBySport.get(config.id) ?? 0,
  }));

  const activePlan = await getActiveSubscription(academyId);
  
  const plan: DashboardPlanUsage = {
    planCode: activePlan.planCode,
    planNickname: activePlan.planNickname ?? null,
    status: activePlan.status ?? "active",
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

  const lookAheadIso = addDaysToCalendarDate(nowIso, 7) ?? nowIso;

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
        activeClassScope,
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
      .where(inArray(classCoachAssignments.classId, classIds))
      .limit(100);
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
      .where(and(activeGroupScope, inArray(groups.coachId, coachIds)))
      .limit(100);

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
      .where(activeClassScope)
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
              .where(inArray(classWeekdays.classId, fallbackIds))
              .limit(1000);

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
        .where(activeAthleteScope)
        .orderBy(desc(athletes.createdAt))
        .limit(5),
      db
        .select({
          id: coaches.id,
          name: coaches.name,
          createdAt: coaches.createdAt,
        })
        .from(coaches)
        .where(activeCoachScope)
        .orderBy(desc(coaches.createdAt))
        .limit(5),
      db
        .select({
          id: groups.id,
          name: groups.name,
          createdAt: groups.createdAt,
        })
        .from(groups)
        .where(activeGroupScope)
        .orderBy(desc(groups.createdAt))
        .limit(5),
      db
        .select({
          id: classes.id,
          name: classes.name,
          createdAt: classes.createdAt,
        })
        .from(classes)
        .where(activeClassScope)
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
      athleteCount: sql<number>`count(distinct ${athletes.id})`,
    })
    .from(groups)
    .leftJoin(coaches, and(eq(groups.coachId, coaches.id), eq(coaches.tenantId, tenantId)))
    .leftJoin(
      groupAthletes,
      and(eq(groupAthletes.groupId, groups.id), eq(groupAthletes.tenantId, tenantId))
    )
    .leftJoin(
      athletes,
      and(
        or(eq(groupAthletes.athleteId, athletes.id), eq(athletes.groupId, groups.id)),
        eq(athletes.tenantId, tenantId),
        isNull(athletes.deletedAt)
      )
    )
    .where(activeGroupScope)
    .groupBy(groups.id, coaches.name)
    .orderBy(desc(sql`count(distinct ${athletes.id})`), asc(groups.name))
    .limit(5);

  const groupsList: DashboardGroupSummary[] = groupSummaries.map((row) => ({
    id: row.id,
    name: row.name ?? "Grupo sin nombre",
    discipline: row.discipline ?? "general",
    color: row.color,
    coachName: row.coachName,
    athleteCount: Number(row.athleteCount ?? 0),
  }));

  // GR-specific metrics if academy has a template (ritmica or artistica)
  let grMetrics = undefined;
  if (academy.academyType === "ritmica" || academy.academyType === "artistica") {
    try {
      const today = new Date();
      const todayIso = formatDateToISOString(today, academy.country);
      const firstDayOfMonthIso = `${todayIso.slice(0, 7)}-01`;

      const academyAthletesResult = await db
        .select({ id: athletes.id })
        .from(athletes)
        .where(activeAthleteScope)
        .limit(5000);

      const athleteIdsForLicenses = academyAthletesResult.map((a) => a.id);

      const athleteLevelsResult = await db
        // unbounded-read-ok: grouped aggregate by athlete level
        .select({
          level: athletes.level,
          count: count(),
        })
        .from(athletes)
        .where(activeAthleteScope)
        .groupBy(athletes.level);

      const athletesByCategory: AthleteCategoryCount[] = athleteLevelsResult
        .filter((row) => row.level !== null)
        .map((row) => ({
          category: row.level ?? "sin nivel",
          count: Number(row.count ?? 0),
        }));

      let expiringLicenses: ExpiringLicense[] = [];
      let expiringLicensesThisWeek = 0;
      let expiringLicensesThisMonth = 0;
      let totalAthletesWithActiveLicense = 0;

      if (athleteIdsForLicenses.length > 0) {
        const athleteLicensesResult = await db
          .select({
            id: federativeLicenses.id,
            personId: federativeLicenses.personId,
            personName: athletes.name,
            licenseType: federativeLicenses.licenseType,
            federation: federativeLicenses.federation,
            validUntil: federativeLicenses.validUntil,
            status: federativeLicenses.status,
          })
          .from(federativeLicenses)
          .leftJoin(
            athletes,
            and(
              eq(federativeLicenses.personId, athletes.id),
              eq(athletes.tenantId, tenantId),
              isNull(athletes.deletedAt)
            )
          )
          .where(
            and(
              eq(federativeLicenses.tenantId, academy.tenantId),
              eq(federativeLicenses.personType, "athlete"),
              inArray(federativeLicenses.personId, athleteIdsForLicenses)
            )
          )
          .limit(500);

        const now = new Date();
        const processedLicenses = athleteLicensesResult
          .filter((l) => l.validUntil !== null)
          .map((l) => {
            const expiryDate = new Date(l.validUntil as string);
            const daysUntil = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return {
              id: l.id,
              personId: l.personId,
              personName: l.personName,
              licenseType: l.licenseType,
              federation: l.federation,
              validUntil: l.validUntil as string,
              daysUntilExpiry: daysUntil,
            };
          });

        expiringLicensesThisWeek = processedLicenses.filter(
          (l) => l.daysUntilExpiry >= 0 && l.daysUntilExpiry <= 7
        ).length;

        expiringLicensesThisMonth = processedLicenses.filter(
          (l) => l.daysUntilExpiry > 7 && l.daysUntilExpiry <= 30
        ).length;

        totalAthletesWithActiveLicense = processedLicenses.filter(
          (l) => l.daysUntilExpiry > 0
        ).length;

        expiringLicenses = processedLicenses
          .filter((l) => l.daysUntilExpiry >= 0 && l.daysUntilExpiry <= 30)
          .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
          .slice(0, 5);
      }

      const sixtyDaysFromNowIso = addDaysToCalendarDate(todayIso, 60) ?? todayIso;

      const upcomingCompetitionsResult = await db
        .select({
          id: events.id,
          title: events.title,
          startDate: events.startDate,
          level: events.level,
          status: events.status,
        })
        .from(events)
        .where(
          and(
            eq(events.academyId, academyId),
            eq(events.tenantId, tenantId),
            gte(events.startDate, todayIso),
            lte(events.startDate, sixtyDaysFromNowIso),
            eq(events.status, "published")
          )
        )
        .orderBy(events.startDate)
        .limit(5);

      const upcomingCompetitions: UpcomingCompetition[] = upcomingCompetitionsResult.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: e.startDate as string,
        level: e.level,
        status: e.status,
      }));

      const assessmentsThisMonthResult = await db
        // unbounded-read-ok: aggregate count for current month
        .select({ count: count() })
        .from(athleteAssessments)
        .where(
          and(
            eq(athleteAssessments.academyId, academyId),
            eq(athleteAssessments.tenantId, tenantId),
            gte(athleteAssessments.assessmentDate, firstDayOfMonthIso),
            lte(athleteAssessments.assessmentDate, todayIso)
          )
        );

      const assessmentsThisMonth = Number(assessmentsThisMonthResult[0]?.count ?? 0);

      grMetrics = {
        athletesByCategory,
        expiringLicenses,
        expiringLicensesThisWeek,
        expiringLicensesThisMonth,
        upcomingCompetitions,
        assessmentsThisMonth,
        totalAthletesWithActiveLicense,
      };
    } catch (error) {
      logger.warn("Dashboard GR metrics unavailable", {
        academyId,
        academyType: academy.academyType,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      grMetrics = undefined;
    }
  }

  return {
    academy: {
      id: academy.id,
      name: academy.name,
      tenantId: academy.tenantId,
      academyType: academy.academyType,
      country: academy.country ?? null,
      timezone: academyTimezone,
    },
    data: {
      metrics,
      plan,
      upcomingClasses,
      recentActivity: activityFeed,
      groups: groupsList,
      sportConfigBreakdown,
      grMetrics,
    },
  };
}
