import { db } from "@/db";
import { charges, athletes, billingItems } from "@/db/schema";
import { eq, and, gte, lte, sql, sum, count } from "drizzle-orm";
import { format } from "date-fns";

export interface FinancialReportFilters {
  academyId: string;
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  athleteId?: string;
}

export interface FinancialStats {
  totalRevenue: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  totalCharges: number;
  paidCharges: number;
  pendingCharges: number;
  overdueCharges: number;
  averagePaymentTime: number; // días
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  paid: number;
  pending: number;
}

export interface DelinquencyAnalysis {
  athleteId: string;
  athleteName: string;
  totalOverdue: number;
  oldestOverdue: Date | null;
  overdueCharges: number;
}

/**
 * Calcula estadísticas financieras generales
 */
export async function calculateFinancialStats(
  filters: FinancialReportFilters
): Promise<FinancialStats> {
  const whereConditions = [
    eq(charges.tenantId, filters.tenantId),
    eq(charges.academyId, filters.academyId),
  ];

  if (filters.startDate) {
    whereConditions.push(gte(charges.dueDate, format(filters.startDate, "yyyy-MM-dd")));
  }
  if (filters.endDate) {
    whereConditions.push(lte(charges.dueDate, format(filters.endDate, "yyyy-MM-dd")));
  }
  if (filters.athleteId) {
    whereConditions.push(eq(charges.athleteId, filters.athleteId));
  }

  // Obtener estadísticas agregadas
  const stats = await db
    .select({
      status: charges.status,
      totalAmount: sum(charges.amountCents),
      count: count(charges.id),
    })
    .from(charges)
    .where(and(...whereConditions))
    .groupBy(charges.status);

  let totalRevenue = 0;
  let paidAmount = 0;
  let pendingAmount = 0;
  let overdueAmount = 0;
  let totalCharges = 0;
  let paidCharges = 0;
  let pendingCharges = 0;
  let overdueCharges = 0;

  const today = new Date();

  for (const stat of stats) {
    const amount = Number(stat.totalAmount || 0) / 100; // Convertir de centavos a euros
    const count = Number(stat.count || 0);

    totalCharges += count;
    totalRevenue += amount;

    if (stat.status === "paid") {
      paidAmount += amount;
      paidCharges += count;
    } else if (stat.status === "pending") {
      pendingAmount += amount;
      pendingCharges += count;
    }
  }

  // Calcular morosidad (cargos pendientes con fecha de vencimiento pasada)
  const overdueStats = await db
    .select({
      totalAmount: sum(charges.amountCents),
      count: count(charges.id),
    })
    .from(charges)
    .where(
      and(
        ...whereConditions,
        eq(charges.status, "pending"),
        lte(charges.dueDate, format(today, "yyyy-MM-dd"))
      )
    );

  if (overdueStats[0]) {
    overdueAmount = Number(overdueStats[0].totalAmount || 0) / 100;
    overdueCharges = Number(overdueStats[0].count || 0);
  }

  // Calcular tiempo promedio de pago (días entre creación y pago)
  const paymentTimes = await db
    .select({
      days: sql<number>`EXTRACT(EPOCH FROM (${charges.paidAt} - ${charges.createdAt})) / 86400`,
    })
    .from(charges)
    .where(
      and(
        ...whereConditions,
        eq(charges.status, "paid"),
        sql`${charges.paidAt} IS NOT NULL`
      )
    )
    .limit(100);

  const averagePaymentTime =
    paymentTimes.length > 0
      ? paymentTimes.reduce((sum, pt) => sum + Number(pt.days || 0), 0) / paymentTimes.length
      : 0;

  return {
    totalRevenue,
    paidAmount,
    pendingAmount,
    overdueAmount,
    totalCharges,
    paidCharges,
    pendingCharges,
    overdueCharges,
    averagePaymentTime: Math.round(averagePaymentTime * 100) / 100,
  };
}

/**
 * Calcula ingresos mensuales
 */
export async function calculateMonthlyRevenue(
  filters: FinancialReportFilters
): Promise<MonthlyRevenue[]> {
  const whereConditions = [
    eq(charges.tenantId, filters.tenantId),
    eq(charges.academyId, filters.academyId),
  ];

  if (filters.startDate) {
    whereConditions.push(gte(charges.dueDate, format(filters.startDate, "yyyy-MM-dd")));
  }
  if (filters.endDate) {
    whereConditions.push(lte(charges.dueDate, format(filters.endDate, "yyyy-MM-dd")));
  }

  // Agrupar por mes y estado
  const monthlyStats = await db
    .select({
      period: charges.period,
      status: charges.status,
      totalAmount: sum(charges.amountCents),
    })
    .from(charges)
    .where(and(...whereConditions))
    .groupBy(charges.period, charges.status);

  // Agrupar por mes
  const monthlyMap = new Map<string, { revenue: number; paid: number; pending: number }>();

  for (const stat of monthlyStats) {
    const month = stat.period;
    const amount = Number(stat.totalAmount || 0) / 100;

    const current = monthlyMap.get(month) || { revenue: 0, paid: 0, pending: 0 };
    current.revenue += amount;

    if (stat.status === "paid") {
      current.paid += amount;
    } else if (stat.status === "pending") {
      current.pending += amount;
    }

    monthlyMap.set(month, current);
  }

  return Array.from(monthlyMap.entries())
    .map(([month, data]) => ({
      month,
      revenue: Math.round(data.revenue * 100) / 100,
      paid: Math.round(data.paid * 100) / 100,
      pending: Math.round(data.pending * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Analiza morosidad
 */
export async function analyzeDelinquency(
  filters: FinancialReportFilters
): Promise<DelinquencyAnalysis[]> {
  const today = new Date();

  const whereConditions = [
    eq(charges.tenantId, filters.tenantId),
    eq(charges.academyId, filters.academyId),
    eq(charges.status, "pending"),
    lte(charges.dueDate, today),
  ];

  if (filters.athleteId) {
    whereConditions.push(eq(charges.athleteId, filters.athleteId));
  }

  // Obtener cargos vencidos con información del atleta
  const overdueCharges = await db
    .select({
      athleteId: charges.athleteId,
      athleteName: athletes.name,
      amountCents: charges.amountCents,
      dueDate: charges.dueDate,
    })
    .from(charges)
    .innerJoin(athletes, eq(charges.athleteId, athletes.id))
    .where(and(...whereConditions))
    .orderBy(charges.dueDate);

  // Agrupar por atleta
  const athleteMap = new Map<
    string,
    { name: string; total: number; oldest: Date | null; count: number }
  >();

  for (const charge of overdueCharges) {
    const current = athleteMap.get(charge.athleteId) || {
      name: charge.athleteName || "Sin nombre",
      total: 0,
      oldest: null,
      count: 0,
    };

    const amount = Number(charge.amountCents) / 100;
    current.total += amount;
    current.count += 1;

    if (!current.oldest || (charge.dueDate && charge.dueDate < current.oldest)) {
      current.oldest = charge.dueDate || null;
    }

    athleteMap.set(charge.athleteId, current);
  }

  return Array.from(athleteMap.entries()).map(([athleteId, data]) => ({
    athleteId,
    athleteName: data.name,
    totalOverdue: Math.round(data.total * 100) / 100,
    oldestOverdue: data.oldest,
    overdueCharges: data.count,
  }));
}

/**
 * Proyecta ingresos futuros
 */
export async function projectRevenue(
  filters: FinancialReportFilters,
  months: number = 3
): Promise<MonthlyRevenue[]> {
  // Obtener promedio de ingresos de los últimos meses
  const endDate = filters.endDate || new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 3);

  const historical = await calculateMonthlyRevenue({
    ...filters,
    startDate,
    endDate,
  });

  const averageRevenue =
    historical.length > 0
      ? historical.reduce((sum, m) => sum + m.revenue, 0) / historical.length
      : 0;

  // Generar proyecciones
  const projections: MonthlyRevenue[] = [];
  const currentDate = new Date(endDate);
  currentDate.setMonth(currentDate.getMonth() + 1);

  for (let i = 0; i < months; i++) {
    const month = format(currentDate, "yyyy-MM");
    projections.push({
      month,
      revenue: Math.round(averageRevenue * 100) / 100,
      paid: Math.round(averageRevenue * 0.8 * 100) / 100, // Asumir 80% de pago
      pending: Math.round(averageRevenue * 0.2 * 100) / 100,
    });
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  return projections;
}

import { format } from "date-fns";

