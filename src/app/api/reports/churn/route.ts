export const dynamic = 'force-dynamic';

import { apiError, apiSuccess } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { calculateChurnReport, type ChurnReportFilters } from "@/lib/reports/churn-report";
import { logger } from "@/lib/logger";

const reportSchema = z.object({
  academyId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
  };

  const validated = reportSchema.parse({
    ...params,
    academyId: params.academyId || undefined,
  });

  if (!validated.academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const filters: ChurnReportFilters = {
    academyId: validated.academyId,
    tenantId: context.tenantId,
    startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    endDate: validated.endDate ? new Date(validated.endDate) : undefined,
  };

  try {
    const stats = await calculateChurnReport(filters);
    return apiSuccess({ data: stats });
  } catch (error: any) {
    logger.error("Error generating churn report:", error);
    return apiError("REPORT_FAILED", error.message, 500);
  }
});
