import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant, type TenantContext } from "@/lib/authz";
import { logger } from "@/lib/logger";
import {
  analyzeDelinquency,
  calculateFinancialStats,
  calculateMonthlyRevenue,
  projectRevenue,
  type FinancialReportFilters,
} from "@/lib/reports/financial-calculator";
import { reportDateSchema, validateReportPeriod } from "@/lib/reports/query-schemas";
import { z } from "zod";

export type FinancialReportKind = "summary" | "monthly" | "delinquency" | "projections";

const reportSchema = z.object({
  academyId: z.string().uuid(),
  startDate: reportDateSchema,
  endDate: reportDateSchema,
  athleteId: z.string().uuid().optional(),
  sportConfigId: z.string().uuid().optional(),
  months: z.coerce.number().int().min(1).max(24).default(3),
}).superRefine(validateReportPeriod);

/**
 * Shared handler for the financial report family. Keeping the auth, query
 * validation and calculator selection in one place prevents child routes
 * such as `/monthly` and `/delinquency` from silently falling through to a
 * Next.js 404 while the client renders an empty chart.
 */
export async function handleFinancialReport(
  request: Request,
  context: TenantContext,
  kind: FinancialReportKind,
): Promise<Response> {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const url = new URL(request.url);
  const parsed = reportSchema.safeParse({
    academyId: url.searchParams.get("academyId") || undefined,
    startDate: url.searchParams.get("startDate") || undefined,
    endDate: url.searchParams.get("endDate") || undefined,
    athleteId: url.searchParams.get("athleteId") || undefined,
    sportConfigId: url.searchParams.get("sportConfigId") || undefined,
    months: url.searchParams.get("months") || undefined,
  });

  if (!parsed.success) {
    return apiError("INVALID_QUERY", "Parámetros del reporte inválidos", 400);
  }

  const validated = parsed.data;
  const filters: FinancialReportFilters = {
    academyId: validated.academyId,
    tenantId: context.tenantId,
    startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    endDate: validated.endDate ? new Date(validated.endDate) : undefined,
    athleteId: validated.athleteId,
    sportConfigId: validated.sportConfigId,
  };

  try {
    switch (kind) {
      case "monthly":
        return apiSuccess(await calculateMonthlyRevenue(filters));
      case "delinquency":
        return apiSuccess(await analyzeDelinquency(filters));
      case "projections":
        return apiSuccess(await projectRevenue(filters, validated.months));
      case "summary":
      default:
        return apiSuccess(await calculateFinancialStats(filters));
    }
  } catch (error: unknown) {
    logger.error("Error generating financial report:", error);
    return apiError("REPORT_FAILED", "Error al generar el reporte", 500);
  }
}

export function withFinancialReport(kind: FinancialReportKind) {
  return withTenant((request, context) => handleFinancialReport(request, context, kind));
}
