export const dynamic = 'force-dynamic';

import { apiError, apiSuccess } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { logger } from "@/lib/logger";
import {
  calculateFinancialStats,
  calculateMonthlyRevenue,
  analyzeDelinquency,
  projectRevenue,
  type FinancialReportFilters,
} from "@/lib/reports/financial-calculator";

const reportSchema = z.object({
  academyId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  athleteId: z.string().uuid().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const url = new URL(request.url);
  const path = url.pathname;

  const params = {
    academyId: url.searchParams.get("academyId"),
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
    athleteId: url.searchParams.get("athleteId"),
  };

  const validated = reportSchema.parse({
    ...params,
    academyId: params.academyId || undefined,
  });

  if (!validated.academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const filters: FinancialReportFilters = {
    academyId: validated.academyId,
    tenantId: context.tenantId,
    startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    endDate: validated.endDate ? new Date(validated.endDate) : undefined,
    athleteId: validated.athleteId,
  };

  try {
    if (path.includes("/monthly")) {
      const monthlyData = await calculateMonthlyRevenue(filters);
      return apiSuccess({ data: monthlyData });
    }

    if (path.includes("/delinquency")) {
      const delinquencyData = await analyzeDelinquency(filters);
      return apiSuccess({ data: delinquencyData });
    }

    if (path.includes("/projections")) {
      const months = parseInt(url.searchParams.get("months") || "3");
      const projections = await projectRevenue(filters, months);
      return apiSuccess({ data: projections });
    }

    // Reporte general
    const stats = await calculateFinancialStats(filters);
    return apiSuccess({ data: stats });
  } catch (error: any) {
    logger.error("Error generating financial report:", error);
    return apiError("REPORT_FAILED", error.message, 500);
  }
});

