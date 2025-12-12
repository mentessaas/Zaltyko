import { db } from "@/db";
import { attendanceRecords, classSessions, athletes, classes, groups } from "@/db/schema";
import { eq, and, gte, lte, inArray, count, sql } from "drizzle-orm";
import { format } from "date-fns";

export interface AttendanceReportFilters {
  academyId: string;
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  athleteId?: string;
  groupId?: string;
  classId?: string;
}

export interface AttendanceStats {
  totalSessions: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendanceRate: number;
}

export interface AthleteAttendanceReport {
  athleteId: string;
  athleteName: string;
  groupName: string | null;
  stats: AttendanceStats;
  sessions: Array<{
    date: string;
    className: string;
    status: string;
  }>;
}

export interface GroupAttendanceReport {
  groupId: string;
  groupName: string;
  totalAthletes: number;
  averageAttendanceRate: number;
  athletes: Array<{
    athleteId: string;
    athleteName: string;
    attendanceRate: number;
  }>;
}

/**
 * Calcula estadísticas de asistencia para un atleta
 */
export async function calculateAthleteAttendance(
  filters: AttendanceReportFilters
): Promise<AthleteAttendanceReport | null> {
  if (!filters.athleteId) {
    return null;
  }

  const whereConditions = [
    eq(attendanceRecords.tenantId, filters.tenantId),
    eq(attendanceRecords.athleteId, filters.athleteId),
  ];

  if (filters.startDate) {
    whereConditions.push(gte(classSessions.sessionDate, format(filters.startDate, "yyyy-MM-dd")));
  }
  if (filters.endDate) {
    whereConditions.push(lte(classSessions.sessionDate, format(filters.endDate, "yyyy-MM-dd")));
  }
  if (filters.classId) {
    whereConditions.push(eq(classSessions.classId, filters.classId));
  }

  // Obtener registros de asistencia
  const records = await db
    .select({
      status: attendanceRecords.status,
      sessionDate: classSessions.sessionDate,
      className: classes.name,
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(and(...whereConditions));

  // Obtener información del atleta
  const [athlete] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      groupId: athletes.groupId,
      groupName: groups.name,
    })
    .from(athletes)
    .leftJoin(groups, eq(athletes.groupId, groups.id))
    .where(eq(athletes.id, filters.athleteId))
    .limit(1);

  if (!athlete) {
    return null;
  }

  // Calcular estadísticas
  const totalSessions = records.length;
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const late = records.filter((r) => r.status === "late").length;
  const excused = records.filter((r) => r.status === "excused").length;
  const attendanceRate = totalSessions > 0 ? (present / totalSessions) * 100 : 0;

  return {
    athleteId: athlete.id,
    athleteName: athlete.name || "Sin nombre",
    groupName: athlete.groupName,
    stats: {
      totalSessions,
      present,
      absent,
      late,
      excused,
      attendanceRate: Math.round(attendanceRate * 100) / 100,
    },
    sessions: records.map((r) => ({
      date: typeof r.sessionDate === "string" ? r.sessionDate.split("T")[0] : new Date(r.sessionDate).toISOString().split("T")[0],
      className: r.className || "Clase",
      status: r.status,
    })),
  };
}

/**
 * Calcula estadísticas de asistencia por grupo
 */
export async function calculateGroupAttendance(
  filters: AttendanceReportFilters
): Promise<GroupAttendanceReport[]> {
  if (!filters.groupId) {
    return [];
  }

  // Obtener atletas del grupo
  const groupAthletes = await db
    .select({
      athleteId: athletes.id,
      athleteName: athletes.name,
    })
    .from(athletes)
    .where(and(eq(athletes.groupId, filters.groupId), eq(athletes.tenantId, filters.tenantId)));

  const athleteIds = groupAthletes.map((a) => a.athleteId);

  if (athleteIds.length === 0) {
    return [];
  }

  const whereConditions = [
    eq(attendanceRecords.tenantId, filters.tenantId),
    inArray(attendanceRecords.athleteId, athleteIds),
  ];

  if (filters.startDate) {
    whereConditions.push(gte(classSessions.sessionDate, format(filters.startDate, "yyyy-MM-dd")));
  }
  if (filters.endDate) {
    whereConditions.push(lte(classSessions.sessionDate, format(filters.endDate, "yyyy-MM-dd")));
  }

  // Obtener estadísticas por atleta
  const stats = await db
    .select({
      athleteId: attendanceRecords.athleteId,
      status: attendanceRecords.status,
      total: count(attendanceRecords.id),
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .where(and(...whereConditions))
    .groupBy(attendanceRecords.athleteId, attendanceRecords.status);

  // Agrupar por atleta
  const athleteStats = new Map<string, { present: number; total: number }>();
  for (const stat of stats) {
    const current = athleteStats.get(stat.athleteId) || { present: 0, total: 0 };
    current.total += Number(stat.total);
    if (stat.status === "present") {
      current.present += Number(stat.total);
    }
    athleteStats.set(stat.athleteId, current);
  }

  // Obtener información del grupo
  const [group] = await db
    .select({
      id: groups.id,
      name: groups.name,
    })
    .from(groups)
    .where(eq(groups.id, filters.groupId))
    .limit(1);

  if (!group) {
    return [];
  }

  const athletesData = groupAthletes.map((athlete) => {
    const stats = athleteStats.get(athlete.athleteId) || { present: 0, total: 0 };
    const attendanceRate = stats.total > 0 ? (stats.present / stats.total) * 100 : 0;
    return {
      athleteId: athlete.athleteId,
      athleteName: athlete.athleteName || "Sin nombre",
      attendanceRate: Math.round(attendanceRate * 100) / 100,
    };
  });

  const averageAttendanceRate =
    athletesData.length > 0
      ? athletesData.reduce((sum, a) => sum + a.attendanceRate, 0) / athletesData.length
      : 0;

  return [
    {
      groupId: group.id,
      groupName: group.name || "Sin nombre",
      totalAthletes: athletesData.length,
      averageAttendanceRate: Math.round(averageAttendanceRate * 100) / 100,
      athletes: athletesData,
    },
  ];
}

/**
 * Calcula estadísticas generales de asistencia
 */
export async function calculateGeneralAttendance(
  filters: AttendanceReportFilters
): Promise<AttendanceStats> {
  const whereConditions = [eq(attendanceRecords.tenantId, filters.tenantId)];

  if (filters.startDate) {
    whereConditions.push(gte(classSessions.sessionDate, format(filters.startDate, "yyyy-MM-dd")));
  }
  if (filters.endDate) {
    whereConditions.push(lte(classSessions.sessionDate, format(filters.endDate, "yyyy-MM-dd")));
  }
  if (filters.athleteId) {
    whereConditions.push(eq(attendanceRecords.athleteId, filters.athleteId));
  }
  if (filters.classId) {
    whereConditions.push(eq(classSessions.classId, filters.classId));
  }

  const stats = await db
    .select({
      status: attendanceRecords.status,
      total: count(attendanceRecords.id),
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .where(and(...whereConditions))
    .groupBy(attendanceRecords.status);

  let totalSessions = 0;
  let present = 0;
  let absent = 0;
  let late = 0;
  let excused = 0;

  for (const stat of stats) {
    const count = Number(stat.total);
    totalSessions += count;
    switch (stat.status) {
      case "present":
        present = count;
        break;
      case "absent":
        absent = count;
        break;
      case "late":
        late = count;
        break;
      case "excused":
        excused = count;
        break;
    }
  }

  const attendanceRate = totalSessions > 0 ? (present / totalSessions) * 100 : 0;

  return {
    totalSessions,
    present,
    absent,
    late,
    excused,
    attendanceRate: Math.round(attendanceRate * 100) / 100,
  };
}

