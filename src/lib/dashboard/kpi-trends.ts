import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  athletes,
  attendanceRecords,
  classSessions,
  classes,
  coaches,
  groups,
  academies,
} from "@/db/schema";
import { addDaysToCalendarDate, formatDateToISOString } from "@/lib/date-utils";

/**
 * Series temporales reales para los sparklines del dashboard.
 *
 * Importante: NO se inventan datos. Cada punto se deriva de timestamps que ya
 * existen en la base de datos:
 *  - athletes / coaches / groups: conteo acumulado de altas vigentes hasta cada
 *    día (createdAt <= día y, si la tabla tiene deletedAt, no eliminado a esa fecha).
 *  - attendance: % de asistencia real por día (registros "present" / total) a
 *    partir de attendance_records unidos a class_sessions por fecha de sesión.
 *
 * No requiere tablas nuevas ni un proceso programado: se calcula bajo demanda.
 */
export interface KpiTrends {
  /** Atletas vigentes por día (acumulado). */
  athletes: number[];
  /** Entrenadores dados de alta por día (acumulado). */
  coaches: number[];
  /** Grupos vigentes por día (acumulado). */
  groups: number[];
  /** % de asistencia real por día (0 si ese día no hubo registros). */
  attendance: number[];
}

const EMPTY_TRENDS: KpiTrends = {
  athletes: [],
  coaches: [],
  groups: [],
  attendance: [],
};

function toDateIso(
  value: Date | string | null | undefined,
  country: string | null | undefined
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Las fechas ISO (YYYY-MM-DD) se comparan correctamente como strings.
  return formatDateToISOString(date, country);
}

/**
 * Cuenta filas vigentes a una fecha dada: dadas de alta antes o el mismo día y
 * no eliminadas a esa fecha. Las fechas ISO se comparan lexicográficamente.
 */
function cumulativeOn(
  rows: Array<{ createdAt: Date | string | null; deletedAt?: Date | string | null }>,
  dayIso: string,
  country: string | null | undefined
): number {
  let total = 0;
  for (const row of rows) {
    const created = toDateIso(row.createdAt, country);
    if (created === null || created > dayIso) continue;
    const deleted = toDateIso(row.deletedAt ?? null, country);
    if (deleted !== null && deleted <= dayIso) continue;
    total += 1;
  }
  return total;
}

/**
 * Devuelve las series de los últimos `days` días (orden cronológico: más antiguo
 * primero, hoy al final), ya filtradas por academia y tenant.
 */
export async function getKpiTrends(
  academyId: string,
  tenantId: string | null,
  days = 14
): Promise<KpiTrends> {
  const safeDays = Math.min(Math.max(days, 2), 90);
  const [academy] = await db
    .select({ country: academies.country })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);
  const academyCountry = academy?.country ?? null;
  const todayKey = formatDateToISOString(new Date(), academyCountry);

  // Lista de días (más antiguo -> hoy) como strings YYYY-MM-DD.
  const dayList: string[] = [];
  for (let i = safeDays - 1; i >= 0; i -= 1) {
    dayList.push(addDaysToCalendarDate(todayKey, -i) ?? todayKey);
  }
  const oldestIso = dayList[0];
  const todayIso = dayList[dayList.length - 1];

  // Filtro defensivo por tenant cuando está disponible (drizzle ignora undefined).
  const athleteWhere = and(
    eq(athletes.academyId, academyId),
    tenantId ? eq(athletes.tenantId, tenantId) : undefined
  );
  const coachWhere = and(
    eq(coaches.academyId, academyId),
    tenantId ? eq(coaches.tenantId, tenantId) : undefined
  );
  const groupWhere = and(
    eq(groups.academyId, academyId),
    tenantId ? eq(groups.tenantId, tenantId) : undefined
  );

  const [athleteRows, coachRows, groupRows, attendanceRows] = await Promise.all([
    db
      .select({ createdAt: athletes.createdAt, deletedAt: athletes.deletedAt })
      .from(athletes)
      .where(athleteWhere).limit(10000),
    db
      .select({ createdAt: coaches.createdAt })
      .from(coaches)
      .where(coachWhere).limit(5000),
    db
      .select({ createdAt: groups.createdAt, deletedAt: groups.deletedAt })
      .from(groups)
      .where(groupWhere).limit(5000),
    db
      .select({
        sessionDate: classSessions.sessionDate,
        status: attendanceRecords.status,
      })
      .from(attendanceRecords)
      .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          eq(classes.academyId, academyId),
          gte(classSessions.sessionDate, oldestIso),
          lte(classSessions.sessionDate, todayIso)
        )
      )
      .limit(10000),
  ]);

  // Agrupar asistencia por día (present / total).
  const attendanceByDay = new Map<string, { present: number; total: number }>();
  for (const row of attendanceRows) {
    const day = String(row.sessionDate);
    const bucket = attendanceByDay.get(day) ?? { present: 0, total: 0 };
    bucket.total += 1;
    if (row.status === "present") bucket.present += 1;
    attendanceByDay.set(day, bucket);
  }

  return {
    athletes: dayList.map((day) => cumulativeOn(athleteRows, day, academyCountry)),
    coaches: dayList.map((day) => cumulativeOn(coachRows, day, academyCountry)),
    groups: dayList.map((day) => cumulativeOn(groupRows, day, academyCountry)),
    attendance: dayList.map((day) => {
      const bucket = attendanceByDay.get(day);
      if (!bucket || bucket.total === 0) return 0;
      return Math.round((bucket.present / bucket.total) * 100);
    }),
  };
}

export { EMPTY_TRENDS };
