import { db } from "@/db";
import {
  athletes,
  charges,
  classSessions,
  attendanceRecords,
  classes,
} from "@/db/schema";
import { eq, and, gte, lte, count, sql, sum } from "drizzle-orm";
import { subMonths, subDays, startOfMonth, endOfMonth } from "date-fns";

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
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const previousMonthStart = startOfMonth(subMonths(now, 1));
  const previousMonthEnd = endOfMonth(subMonths(now, 1));
  const threeMonthsAgo = subMonths(now, 3);
  const sixMonthsAgo = subMonths(now, 6);

  // Calcular retención de atletas (atletas activos en los últimos 3 meses vs hace 6 meses)
  const [activeNow] = await db
    .select({ count: count() })
    .from(athletes)
    .where(
      and(
        eq(athletes.academyId, academyId),
        eq(athletes.tenantId, tenantId),
        gte(athletes.createdAt, threeMonthsAgo)
      )
    );

  const [activeSixMonthsAgo] = await db
    .select({ count: count() })
    .from(athletes)
    .where(
      and(
        eq(athletes.academyId, academyId),
        eq(athletes.tenantId, tenantId),
        gte(athletes.createdAt, sixMonthsAgo),
        lte(athletes.createdAt, threeMonthsAgo)
      )
    );

  const retentionRate =
    Number(activeSixMonthsAgo?.count || 0) > 0
      ? (Number(activeNow?.count || 0) / Number(activeSixMonthsAgo.count)) * 100
      : 100;

  // Calcular tasa promedio de asistencia (últimos 30 días)
  const thirtyDaysAgo = subDays(now, 30);
  const [totalAttendance] = await db
    .select({ count: count() })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classes.academyId, academyId),
        eq(classes.tenantId, tenantId),
        gte(classSessions.sessionDate, thirtyDaysAgo.toISOString().split("T")[0])
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
        gte(classSessions.sessionDate, thirtyDaysAgo.toISOString().split("T")[0])
      )
    );

  const averageAttendanceRate =
    Number(totalAttendance?.count || 0) > 0
      ? (Number(presentAttendance?.count || 0) / Number(totalAttendance.count)) * 100
      : 0;

  // Calcular MRR (Monthly Recurring Revenue) - ingresos recurrentes del mes actual
  const currentPeriod = formatPeriod(currentMonthStart);
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
  const [currentAthletes] = await db
    .select({ count: count() })
    .from(athletes)
    .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, tenantId)));

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
        sql`${attendanceRecords.id} IS NULL`
      )
    );

  const churnRate =
    Number(currentAthletes?.count || 0) > 0
      ? (Number(churnedAthletes?.count || 0) / Number(currentAthletes.count)) * 100
      : 0;

  // Comparación de períodos
  const [currentAthletesCount] = await db
    .select({ count: count() })
    .from(athletes)
    .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, tenantId)));

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
        eq(charges.period, formatPeriod(previousMonthStart))
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
        gte(classSessions.sessionDate, currentMonthStart.toISOString().split("T")[0]),
        lte(classSessions.sessionDate, currentMonthEnd.toISOString().split("T")[0])
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
        gte(classSessions.sessionDate, previousMonthStart.toISOString().split("T")[0]),
        lte(classSessions.sessionDate, previousMonthEnd.toISOString().split("T")[0])
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

  // Proyección de crecimiento basada en tendencia
  const growthProjection = revenueChange * 0.8; // Simplificado: 80% de la tendencia actual

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
        athletes: Number(currentAthletesCount?.count || 0), // Simplificado
        revenue: previousRevenueValue,
        attendance: Number(previousAttendanceCount?.count || 0),
      },
      change: {
        athletes: 0, // Simplificado
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

function formatPeriod(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

