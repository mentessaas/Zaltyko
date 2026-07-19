import { db } from "@/db";
import {
  academySportConfigs,
  academyExpenses,
  athletes,
  charges,
  classCoachAssignments,
  classes,
  coachCompensation,
  discountUsageHistory,
  groups,
  scholarships,
  sportBranches,
  sportDisciplines,
  sportLocaleConfigs,
} from "@/db/schema";
import { eq, and, gte, lte, sql, sum, count } from "drizzle-orm";
import { format } from "date-fns";

export interface FinancialReportFilters {
  academyId: string;
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  athleteId?: string;
  sportConfigId?: string;
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
  bySportConfig?: SportFinancialBreakdown[];
}

export interface SportFinancialBreakdown {
  sportConfigId: string | null;
  label: string;
  disciplineName: string | null;
  branchName: string | null;
  totalRevenue: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  totalCharges: number;
  paidCharges: number;
  pendingCharges: number;
  overdueCharges: number;
  activeScholarships: number;
  discountAmount: number;
  coachCostAmount: number;
  directExpenseAmount: number;
  allocatedAcademyExpenseAmount: number;
  estimatedCostAmount: number;
  estimatedMarginAmount: number;
  estimatedMarginRate: number | null;
  profitabilityStatus: "profitable" | "at_risk" | "loss" | "unknown";
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
  sportConfigId: string | null;
  sportConfigLabel: string;
  totalOverdue: number;
  oldestOverdue: Date | null;
  overdueCharges: number;
}

const chargeSportConfigId = sql<string | null>`COALESCE(${classes.sportConfigId}, ${groups.sportConfigId}, ${athletes.primarySportConfigId})`;

function buildChargeConditions(filters: FinancialReportFilters) {
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
  if (filters.sportConfigId) {
    whereConditions.push(sql`${chargeSportConfigId} = ${filters.sportConfigId}`);
  }

  return whereConditions;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function calculateCoachMonthlyCostCents(row: {
  hourlyRateCents: number | null;
  monthlySalaryCents: number | null;
  estimatedWeeklyHours: number | null;
}) {
  const salary = Number(row.monthlySalaryCents ?? 0);
  const hourlyMonthlyEstimate = Math.round(
    (Number(row.hourlyRateCents ?? 0) * Number(row.estimatedWeeklyHours ?? 0) * 433) / 100
  );
  return salary + hourlyMonthlyEstimate;
}

function getProfitabilityStatus(marginAmount: number, marginRate: number | null): SportFinancialBreakdown["profitabilityStatus"] {
  if (marginRate === null) return "unknown";
  if (marginAmount < 0) return "loss";
  if (marginRate < 0.15) return "at_risk";
  return "profitable";
}

/**
 * Calcula estadísticas financieras generales
 */
export async function calculateFinancialStats(
  filters: FinancialReportFilters
): Promise<FinancialStats> {
  const whereConditions = buildChargeConditions(filters);

  // Obtener estadísticas agregadas
  const stats = await db
    .select({
      status: charges.status,
      totalAmount: sum(charges.amountCents),
      count: count(charges.id),
    })
    .from(charges)
    .innerJoin(athletes, eq(charges.athleteId, athletes.id))
    .leftJoin(classes, eq(charges.classId, classes.id))
    .leftJoin(groups, eq(classes.groupId, groups.id))
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
    .innerJoin(athletes, eq(charges.athleteId, athletes.id))
    .leftJoin(classes, eq(charges.classId, classes.id))
    .leftJoin(groups, eq(classes.groupId, groups.id))
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
    .innerJoin(athletes, eq(charges.athleteId, athletes.id))
    .leftJoin(classes, eq(charges.classId, classes.id))
    .leftJoin(groups, eq(classes.groupId, groups.id))
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
    bySportConfig: await calculateSportFinancialBreakdown(filters),
  };
}

/**
 * Calcula ingresos mensuales
 */
export async function calculateMonthlyRevenue(
  filters: FinancialReportFilters
): Promise<MonthlyRevenue[]> {
  const whereConditions = buildChargeConditions(filters);

  // Agrupar por mes y estado
  const monthlyStats = await db
    .select({
      period: charges.period,
      status: charges.status,
      totalAmount: sum(charges.amountCents),
    })
    .from(charges)
    .innerJoin(athletes, eq(charges.athleteId, athletes.id))
    .leftJoin(classes, eq(charges.classId, classes.id))
    .leftJoin(groups, eq(classes.groupId, groups.id))
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
    lte(charges.dueDate, format(today, "yyyy-MM-dd")),
  ];

  if (filters.athleteId) {
    whereConditions.push(eq(charges.athleteId, filters.athleteId));
  }
  if (filters.sportConfigId) {
    whereConditions.push(sql`${chargeSportConfigId} = ${filters.sportConfigId}`);
  }

  // Obtener cargos vencidos con información del atleta
  const overdueCharges = await db
    .select({
      athleteId: charges.athleteId,
      athleteName: athletes.name,
      sportConfigId: chargeSportConfigId,
      disciplineName: sportDisciplines.name,
      branchName: sportBranches.name,
      amountCents: charges.amountCents,
      dueDate: charges.dueDate,
    })
    .from(charges)
    .innerJoin(athletes, eq(charges.athleteId, athletes.id))
    .leftJoin(classes, eq(charges.classId, classes.id))
    .leftJoin(groups, eq(classes.groupId, groups.id))
    .leftJoin(academySportConfigs, eq(academySportConfigs.id, chargeSportConfigId))
    .leftJoin(sportLocaleConfigs, eq(academySportConfigs.sportLocaleConfigId, sportLocaleConfigs.id))
    .leftJoin(sportDisciplines, eq(sportLocaleConfigs.disciplineId, sportDisciplines.id))
    .leftJoin(sportBranches, eq(sportLocaleConfigs.branchId, sportBranches.id))
    .where(and(...whereConditions))
    .orderBy(charges.dueDate);

  // Agrupar por atleta
  const athleteMap = new Map<
    string,
    {
      name: string;
      sportConfigId: string | null;
      sportConfigLabel: string;
      total: number;
      oldest: Date | null;
      count: number;
    }
  >();

  for (const charge of overdueCharges) {
    const current = athleteMap.get(charge.athleteId) || {
      name: charge.athleteName || "Sin nombre",
      sportConfigId: charge.sportConfigId ?? null,
      sportConfigLabel:
        charge.branchName && charge.disciplineName
          ? `${charge.branchName} · ${charge.disciplineName}`
          : "Sin rama asignada",
      total: 0,
      oldest: null,
      count: 0,
    };

    const amount = Number(charge.amountCents) / 100;
    current.total += amount;
    current.count += 1;

    if (charge.dueDate) {
      const dueDate = typeof charge.dueDate === "string" ? new Date(charge.dueDate) : charge.dueDate;
      if (!current.oldest || dueDate < current.oldest) {
        current.oldest = dueDate;
      }
    }

    athleteMap.set(charge.athleteId, current);
  }

  return Array.from(athleteMap.entries()).map(([athleteId, data]) => ({
    athleteId,
    athleteName: data.name,
    sportConfigId: data.sportConfigId,
    sportConfigLabel: data.sportConfigLabel,
    totalOverdue: Math.round(data.total * 100) / 100,
    oldestOverdue: data.oldest,
    overdueCharges: data.count,
  }));
}

export async function calculateSportFinancialBreakdown(
  filters: FinancialReportFilters
): Promise<SportFinancialBreakdown[]> {
  const today = format(new Date(), "yyyy-MM-dd");
  const chargeConditions = buildChargeConditions(filters);

  const chargeRows = await db
    .select({
      sportConfigId: chargeSportConfigId,
      status: charges.status,
      totalAmount: sum(charges.amountCents),
      totalCharges: count(charges.id),
    })
    .from(charges)
    .innerJoin(athletes, eq(charges.athleteId, athletes.id))
    .leftJoin(classes, eq(charges.classId, classes.id))
    .leftJoin(groups, eq(classes.groupId, groups.id))
    .where(and(...chargeConditions))
    .groupBy(chargeSportConfigId, charges.status);

  const overdueRows = await db
    .select({
      sportConfigId: chargeSportConfigId,
      totalAmount: sum(charges.amountCents),
      totalCharges: count(charges.id),
    })
    .from(charges)
    .innerJoin(athletes, eq(charges.athleteId, athletes.id))
    .leftJoin(classes, eq(charges.classId, classes.id))
    .leftJoin(groups, eq(classes.groupId, groups.id))
    .where(
      and(
        ...chargeConditions,
        eq(charges.status, "pending"),
        lte(charges.dueDate, today)
      )
    )
    .groupBy(chargeSportConfigId);

  const scholarshipConditions = [
    eq(scholarships.tenantId, filters.tenantId),
    eq(scholarships.academyId, filters.academyId),
    eq(scholarships.isActive, true),
    lte(scholarships.startDate, today),
    sql`(${scholarships.endDate} IS NULL OR ${scholarships.endDate} >= ${today})`,
  ];
  if (filters.sportConfigId) {
    scholarshipConditions.push(eq(athletes.primarySportConfigId, filters.sportConfigId));
  }

  const scholarshipRows = await db
    .select({
      sportConfigId: athletes.primarySportConfigId,
      totalScholarships: count(scholarships.id),
    })
    .from(scholarships)
    .innerJoin(athletes, eq(scholarships.athleteId, athletes.id))
    .where(and(...scholarshipConditions))
    .groupBy(athletes.primarySportConfigId);

  const discountSportConfigId = sql<string | null>`COALESCE(${classes.sportConfigId}, ${groups.sportConfigId}, ${athletes.primarySportConfigId})`;
  const discountConditions = [
    eq(discountUsageHistory.tenantId, filters.tenantId),
    eq(discountUsageHistory.academyId, filters.academyId),
  ];
  if (filters.startDate) {
    discountConditions.push(gte(discountUsageHistory.usedAt, filters.startDate));
  }
  if (filters.endDate) {
    discountConditions.push(lte(discountUsageHistory.usedAt, filters.endDate));
  }
  if (filters.sportConfigId) {
    discountConditions.push(sql`${discountSportConfigId} = ${filters.sportConfigId}`);
  }

  const discountRows = await db
    .select({
      sportConfigId: discountSportConfigId,
      discountAmount: sum(discountUsageHistory.discountAmount),
    })
    .from(discountUsageHistory)
    .leftJoin(charges, eq(discountUsageHistory.chargeId, charges.id))
    .leftJoin(athletes, eq(discountUsageHistory.athleteId, athletes.id))
    .leftJoin(classes, eq(charges.classId, classes.id))
    .leftJoin(groups, eq(classes.groupId, groups.id))
    .where(and(...discountConditions))
    .groupBy(discountSportConfigId);

  const classCostSportConfigId = sql<string | null>`COALESCE(${classes.sportConfigId}, ${groups.sportConfigId})`;
  const classCostRows = await db
    .select({
      classId: classes.id,
      sportConfigId: classCostSportConfigId,
      coachId: classCoachAssignments.coachId,
      hourlyRateCents: coachCompensation.hourlyRateCents,
      monthlySalaryCents: coachCompensation.monthlySalaryCents,
      estimatedWeeklyHours: coachCompensation.estimatedWeeklyHours,
    })
    .from(classes)
    .leftJoin(groups, eq(classes.groupId, groups.id))
    .leftJoin(classCoachAssignments, eq(classCoachAssignments.classId, classes.id))
    .leftJoin(
      coachCompensation,
      and(
        eq(coachCompensation.coachId, classCoachAssignments.coachId),
        eq(coachCompensation.academyId, filters.academyId),
        eq(coachCompensation.tenantId, filters.tenantId),
        eq(coachCompensation.isActive, true)
      )
    )
    .where(
      and(
        eq(classes.tenantId, filters.tenantId),
        eq(classes.academyId, filters.academyId),
        filters.sportConfigId ? sql`${classCostSportConfigId} = ${filters.sportConfigId}` : sql`true`
      )
    );

  const classSportConfigById = new Map(classCostRows.map((row) => [row.classId, row.sportConfigId ?? null]));
  const assignmentsByCoach = new Map<string, number>();
  for (const row of classCostRows) {
    if (!row.coachId) continue;
    assignmentsByCoach.set(row.coachId, (assignmentsByCoach.get(row.coachId) ?? 0) + 1);
  }

  const expenseConditions = [
    eq(academyExpenses.tenantId, filters.tenantId),
    eq(academyExpenses.academyId, filters.academyId),
    eq(academyExpenses.isActive, true),
  ];
  if (filters.startDate) {
    expenseConditions.push(gte(academyExpenses.expenseDate, format(filters.startDate, "yyyy-MM-dd")));
  }
  if (filters.endDate) {
    expenseConditions.push(lte(academyExpenses.expenseDate, format(filters.endDate, "yyyy-MM-dd")));
  }

  const expenseRows = await db
    .select({
      appliesToType: academyExpenses.appliesToType,
      appliesToId: academyExpenses.appliesToId,
      amountCents: academyExpenses.amountCents,
    })
    .from(academyExpenses)
    .where(and(...expenseConditions));

  const sportConfigRows = await db
    .select({
      sportConfigId: academySportConfigs.id,
      disciplineName: sportDisciplines.name,
      branchName: sportBranches.name,
    })
    .from(academySportConfigs)
    .innerJoin(sportLocaleConfigs, eq(academySportConfigs.sportLocaleConfigId, sportLocaleConfigs.id))
    .innerJoin(sportDisciplines, eq(sportLocaleConfigs.disciplineId, sportDisciplines.id))
    .innerJoin(sportBranches, eq(sportLocaleConfigs.branchId, sportBranches.id))
    .where(
      and(
        eq(academySportConfigs.tenantId, filters.tenantId),
        eq(academySportConfigs.academyId, filters.academyId),
        eq(academySportConfigs.isActive, true),
        filters.sportConfigId ? eq(academySportConfigs.id, filters.sportConfigId) : sql`true`
      )
    );

  const labels = new Map(
    sportConfigRows.map((row) => [
      row.sportConfigId,
      {
        disciplineName: row.disciplineName,
        branchName: row.branchName,
        label: `${row.branchName} · ${row.disciplineName}`,
      },
    ])
  );

  const breakdown = new Map<string, SportFinancialBreakdown>();
  const ensure = (sportConfigId: string | null) => {
    const key = sportConfigId ?? "unassigned";
    const label = sportConfigId ? labels.get(sportConfigId) : null;
    if (!breakdown.has(key)) {
      breakdown.set(key, {
        sportConfigId,
        label: label?.label ?? "Sin rama asignada",
        disciplineName: label?.disciplineName ?? null,
        branchName: label?.branchName ?? null,
        totalRevenue: 0,
        paidAmount: 0,
        pendingAmount: 0,
        overdueAmount: 0,
        totalCharges: 0,
        paidCharges: 0,
        pendingCharges: 0,
        overdueCharges: 0,
        activeScholarships: 0,
        discountAmount: 0,
        coachCostAmount: 0,
        directExpenseAmount: 0,
        allocatedAcademyExpenseAmount: 0,
        estimatedCostAmount: 0,
        estimatedMarginAmount: 0,
        estimatedMarginRate: null,
        profitabilityStatus: "unknown",
      });
    }
    return breakdown.get(key)!;
  };

  for (const row of sportConfigRows) {
    ensure(row.sportConfigId);
  }

  for (const row of chargeRows) {
    const current = ensure(row.sportConfigId ?? null);
    const amount = Number(row.totalAmount || 0) / 100;
    const chargeCount = Number(row.totalCharges || 0);
    current.totalRevenue += amount;
    current.totalCharges += chargeCount;
    if (row.status === "paid") {
      current.paidAmount += amount;
      current.paidCharges += chargeCount;
    } else if (row.status === "pending") {
      current.pendingAmount += amount;
      current.pendingCharges += chargeCount;
    }
  }

  for (const row of overdueRows) {
    const current = ensure(row.sportConfigId ?? null);
    current.overdueAmount += Number(row.totalAmount || 0) / 100;
    current.overdueCharges += Number(row.totalCharges || 0);
  }

  for (const row of scholarshipRows) {
    ensure(row.sportConfigId ?? null).activeScholarships += Number(row.totalScholarships || 0);
  }

  for (const row of discountRows) {
    ensure(row.sportConfigId ?? null).discountAmount += Number(row.discountAmount || 0);
  }

  for (const row of classCostRows) {
    if (!row.coachId) continue;
    const assignmentCount = Math.max(assignmentsByCoach.get(row.coachId) ?? 1, 1);
    ensure(row.sportConfigId ?? null).coachCostAmount += calculateCoachMonthlyCostCents(row) / assignmentCount / 100;
  }

  let academyExpenseAmount = 0;
  for (const row of expenseRows) {
    const amount = Number(row.amountCents || 0) / 100;
    if (row.appliesToType === "sport_config") {
      ensure(row.appliesToId ?? null).directExpenseAmount += amount;
      continue;
    }
    if (row.appliesToType === "class") {
      ensure(classSportConfigById.get(row.appliesToId ?? "") ?? null).directExpenseAmount += amount;
      continue;
    }
    if (row.appliesToType === "academy") {
      academyExpenseAmount += amount;
    }
  }

  const allocationTargets = Array.from(breakdown.values()).filter((item) => !filters.sportConfigId || item.sportConfigId === filters.sportConfigId);
  const totalRevenueForAllocation = allocationTargets.reduce((sum, item) => sum + item.totalRevenue, 0);
  const targetCount = Math.max(allocationTargets.length, 1);
  for (const item of allocationTargets) {
    const share =
      totalRevenueForAllocation > 0 ? item.totalRevenue / totalRevenueForAllocation : 1 / targetCount;
    item.allocatedAcademyExpenseAmount += academyExpenseAmount * share;
  }

  return Array.from(breakdown.values())
    .map((item) => {
      const estimatedCostAmount = item.coachCostAmount + item.directExpenseAmount + item.allocatedAcademyExpenseAmount;
      const estimatedMarginAmount = item.totalRevenue - estimatedCostAmount;
      const estimatedMarginRate = item.totalRevenue > 0 ? estimatedMarginAmount / item.totalRevenue : null;
      return {
        ...item,
        totalRevenue: roundMoney(item.totalRevenue),
        paidAmount: roundMoney(item.paidAmount),
        pendingAmount: roundMoney(item.pendingAmount),
        overdueAmount: roundMoney(item.overdueAmount),
        discountAmount: roundMoney(item.discountAmount),
        coachCostAmount: roundMoney(item.coachCostAmount),
        directExpenseAmount: roundMoney(item.directExpenseAmount),
        allocatedAcademyExpenseAmount: roundMoney(item.allocatedAcademyExpenseAmount),
        estimatedCostAmount: roundMoney(estimatedCostAmount),
        estimatedMarginAmount: roundMoney(estimatedMarginAmount),
        estimatedMarginRate: estimatedMarginRate === null ? null : Math.round(estimatedMarginRate * 10000) / 10000,
        profitabilityStatus: getProfitabilityStatus(estimatedMarginAmount, estimatedMarginRate),
      };
    })
    .filter((item) => {
      if (!filters.sportConfigId) return true;
      return item.sportConfigId === filters.sportConfigId;
    })
    .sort((a, b) => a.label.localeCompare(b.label));
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
