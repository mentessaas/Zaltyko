export const dynamic = 'force-dynamic';

import { apiError, apiSuccess } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { calculateChurnReport, type ChurnReportFilters } from "@/lib/reports/churn-report";
import { logger } from "@/lib/logger";
import { reportDateSchema, validateReportPeriod } from "@/lib/reports/query-schemas";

const reportSchema = z.object({
  academyId: z.string().uuid(),
  startDate: reportDateSchema,
  endDate: reportDateSchema,
  sportConfigId: z.string().uuid().optional(),
}).superRefine(validateReportPeriod);

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
    sportConfigId: url.searchParams.get("sportConfigId"),
  };

  const parsed = reportSchema.safeParse({
    ...params,
    academyId: params.academyId || undefined,
  });
  if (!parsed.success) {
    return apiError("INVALID_QUERY", "Parámetros del reporte inválidos", 400);
  }
  const validated = parsed.data;

  if (!validated.academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const filters: ChurnReportFilters = {
    academyId: validated.academyId,
    tenantId: context.tenantId,
    startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    endDate: validated.endDate ? new Date(validated.endDate) : undefined,
    sportConfigId: validated.sportConfigId,
  };

  try {
    const stats = await calculateChurnReport(filters);
    return apiSuccess(stats);
  } catch (error: unknown) {
    logger.error("Error generating churn report:", error);
    return apiError("REPORT_FAILED", "Error al generar el reporte", 500);
  }
});
