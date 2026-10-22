import { db } from "@/db";
import {
  athletes,
  charges,
  classSessions,
  attendanceRecords,
  classes,
} from "@/db/schema";
import { eq, and, gte, lte, count, sql, sum, isNull, or, gt } from "drizzle-orm";
import { subMonths, subDays } from "date-fns";
import { academies } from "@/db/schema";
import {
  addDaysToCalendarDate,
  formatDateToISOString,
  getMonthBoundariesInCountryTimezone,
} from "@/lib/date-utils";

export interface AdvancedMetrics {
  retentionRate: number; // Tasa de retención de atletas (%)
  averageAttendanceRate: number; // Tasa promedio de asistencia
  monthlyRecurringRevenue: number; // MRR en euros
  churnRate: number; // Tasa de abandono
  growthProjection: number; // Proyección de crecimiento (%)
  periodComparison: {
    current: {
      athletes: number;
      revenue: number;
      attendance: number;
    };
    previous: {
      athletes: number;
      revenue: number;
      attendance: number;
    };
    change: {
      athletes: number;
      revenue: number;
      attendance: number;
    };
  };
}

/**
 * Calcula métricas avanzadas para una academia
 */
export async function calculateAdvancedMetrics(
  academyId: string,
  tenantId: string
): Promise<AdvancedMetrics> {
  const [academy] = await db
    .select({ country: academies.country })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);
  const academyCountry = academy?.country ?? null;
  const now = new Date();
  const previousMonthReference = subMonths(now, 1);
  const { end: previousMonthEnd } = getMonthBoundariesInCountryTimezone(
    previousMonthReference,
    academyCountry
  );
  const todayKey = formatDateToISOString(now, academyCountry);
  const thirtyDaysAgoKey = addDaysToCalendarDate(todayKey, -30) ?? todayKey;
  const currentMonthStartKey = `${todayKey.slice(0, 7)}-01`;
  const previousMonthEndKey = addDaysToCalendarDate(currentMonthStartKey, -1) ?? currentMonthStartKey;
  const previousMonthStartKey = `${previousMonthEndKey.slice(0, 7)}-01`;
  const currentPeriod = currentMonthStartKey.slice(0, 7);
  const previousPeriod = previousMonthStartKey.slice(0, 7);
  const sixMonthsAgo = subMonths(now, 6);

  const activeNowScope = and(
    eq(athletes.academyId, academyId),
    eq(athletes.tenantId, tenantId),
    lte(athletes.createdAt, now),
    or(isNull(athletes.deletedAt), gt(athletes.deletedAt, now))
  );
  const activeSixMonthsAgoScope = and(
    eq(athletes.academyId, academyId),
    eq(athletes.tenantId, tenantId),
    lte(athletes.createdAt, sixMonthsAgo),
    or(isNull(athletes.deletedAt), gt(athletes.deletedAt, sixMonthsAgo))
  );

  // Retención real: de la cohorte que estaba activa hace seis meses, cuántos
  // siguen activos ahora. No se confunde con altas recientes.
  const [activeNow] = await db
    .select({ count: count() })
    .from(athletes)
    .where(activeNowScope);

  const [activeSixMonthsAgo] = await db
    .select({ count: count() })
    .from(athletes)
    .where(activeSixMonthsAgoScope);

  const [retainedCohort] = await db
    .select({ count: count() })
    .from(athletes)
    .where(
      and(
        activeNowScope,
        lte(athletes.createdAt, sixMonthsAgo)
      )
    );

  const retentionRate =
    Number(activeSixMonthsAgo?.count || 0) > 0
      ? (Number(retainedCohort?.count || 0) / Number(activeSixMonthsAgo.count)) * 100
      : 100;

  // Calcular tasa promedio de asistencia (últimos 30 días)
  const [totalAttendance] = await db
    .select({ count: count() })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classes.academyId, academyId),
        eq(classes.tenantId, tenantId),
        gte(classSessions.sessionDate, thirtyDaysAgoKey)
      )
    );

  const [presentAttendance] = await db
    .select({ count: count() })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classes.academyId, academyId),
        eq(classes.tenantId, tenantId),
        eq(attendanceRecords.status, "present"),
        gte(classSessions.sessionDate, thirtyDaysAgoKey)
      )
    );

  const averageAttendanceRate =
    Number(totalAttendance?.count || 0) > 0
      ? (Number(presentAttendance?.count || 0) / Number(totalAttendance.count)) * 100
      : 0;

  // Calcular MRR (Monthly Recurring Revenue) - ingresos recurrentes del mes actual
  const [mrrData] = await db
    .select({ total: sum(charges.amountCents) })
    .from(charges)
    .where(
      and(
        eq(charges.academyId, academyId),
        eq(charges.tenantId, tenantId),
        eq(charges.period, currentPeriod),
        eq(charges.status, "paid")
      )
    );

  const monthlyRecurringRevenue = Number(mrrData?.total || 0) / 100;

  // Calcular churn rate (atletas que dejaron de asistir en el último mes)
  // Simplificado: asumimos que atletas sin asistencia en 60 días han churned
  const sixtyDaysAgo = subDays(now, 60);
  const [churnedAthletes] = await db
    .select({ count: sql<number>`count(distinct ${athletes.id})` })
    .from(athletes)
    .leftJoin(
      attendanceRecords,
      and(
        eq(athletes.id, attendanceRecords.athleteId),
        gte(attendanceRecords.recordedAt, sixtyDaysAgo)
      )
    )
    .where(
      and(
        eq(athletes.academyId, academyId),
        eq(athletes.tenantId, tenantId),
        isNull(athletes.deletedAt),
        lte(athletes.createdAt, sixtyDaysAgo),
        sql`${attendanceRecords.id} IS NULL`
      )
    );

  const churnRate =
    Number(activeNow?.count || 0) > 0
      ? (Number(churnedAthletes?.count || 0) / Number(activeNow.count)) * 100
      : 0;

  // Comparación de períodos
  const currentAthletesCount = activeNow;
  const [previousAthletesCount] = await db
    .select({ count: count() })
    .from(athletes)
    .where(
      and(
        eq(athletes.academyId, academyId),
        eq(athletes.tenantId, tenantId),
        lte(athletes.createdAt, previousMonthEnd),
        or(isNull(athletes.deletedAt), gt(athletes.deletedAt, previousMonthEnd))
      )
    );

  const [currentRevenue] = await db
    .select({ total: sum(charges.amountCents) })
    .from(charges)
    .where(
      and(
        eq(charges.academyId, academyId),
        eq(charges.tenantId, tenantId),
        eq(charges.period, currentPeriod)
      )
    );

  const [previousRevenue] = await db
    .select({ total: sum(charges.amountCents) })
    .from(charges)
    .where(
      and(
        eq(charges.academyId, academyId),
        eq(charges.tenantId, tenantId),
        eq(charges.period, previousPeriod)
      )
    );

  const [currentAttendanceCount] = await db
    .select({ count: count() })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classes.academyId, academyId),
        eq(classes.tenantId, tenantId),
        gte(classSessions.sessionDate, currentMonthStartKey),
        lte(classSessions.sessionDate, todayKey)
      )
    );

  const [previousAttendanceCount] = await db
    .select({ count: count() })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classes.academyId, academyId),
        eq(classes.tenantId, tenantId),
        gte(classSessions.sessionDate, previousMonthStartKey),
        lte(classSessions.sessionDate, previousMonthEndKey)
      )
    );

  const currentRevenueValue = Number(currentRevenue?.total || 0) / 100;
  const previousRevenueValue = Number(previousRevenue?.total || 0) / 100;

  const revenueChange =
    previousRevenueValue > 0
      ? ((currentRevenueValue - previousRevenueValue) / previousRevenueValue) * 100
      : currentRevenueValue > 0
        ? 100
        : 0;

  // Sin un modelo de forecast ni estacionalidad suficiente, no presentamos
  // una predicción inventada. El campo legado conserva la tendencia observada
  // para no romper clientes, pero la UI la etiqueta como comparación real.
  const growthProjection = revenueChange;

  return {
    retentionRate: Math.round(retentionRate * 100) / 100,
    averageAttendanceRate: Math.round(averageAttendanceRate * 100) / 100,
    monthlyRecurringRevenue: Math.round(monthlyRecurringRevenue * 100) / 100,
    churnRate: Math.round(churnRate * 100) / 100,
    growthProjection: Math.round(growthProjection * 100) / 100,
    periodComparison: {
      current: {
        athletes: Number(currentAthletesCount?.count || 0),
        revenue: currentRevenueValue,
        attendance: Number(currentAttendanceCount?.count || 0),
      },
      previous: {
        athletes: Number(previousAthletesCount?.count || 0),
        revenue: previousRevenueValue,
        attendance: Number(previousAttendanceCount?.count || 0),
      },
      change: {
        athletes:
          Number(previousAthletesCount?.count || 0) > 0
            ? ((Number(currentAthletesCount?.count || 0) - Number(previousAthletesCount.count)) /
                Number(previousAthletesCount.count)) *
              100
            : Number(currentAthletesCount?.count || 0) > 0
              ? 100
              : 0,
        revenue: revenueChange,
        attendance:
          Number(previousAttendanceCount?.count || 0) > 0
            ? ((Number(currentAttendanceCount?.count || 0) -
                Number(previousAttendanceCount.count)) /
                Number(previousAttendanceCount.count)) *
              100
            : Number(currentAttendanceCount?.count || 0) > 0
              ? 100
              : 0,
      },
    },
  };
}
