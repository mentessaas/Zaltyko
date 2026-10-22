export const dynamic = 'force-dynamic';

import { apiError, apiSuccess } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { calculateClassReport, type ClassReportFilters } from "@/lib/reports/class-report";
import { logger } from "@/lib/logger";
import { reportDateSchema, validateReportPeriod } from "@/lib/reports/query-schemas";

const reportSchema = z.object({
  academyId: z.string().uuid(),
  startDate: reportDateSchema,
  endDate: reportDateSchema,
  classId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
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
    classId: url.searchParams.get("classId"),
    groupId: url.searchParams.get("groupId"),
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

  const filters: ClassReportFilters = {
    academyId: validated.academyId,
    tenantId: context.tenantId,
    startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    endDate: validated.endDate ? new Date(validated.endDate) : undefined,
    classId: validated.classId,
    groupId: validated.groupId,
    sportConfigId: validated.sportConfigId,
  };

  try {
    const stats = await calculateClassReport(filters);
    return apiSuccess(stats);
  } catch (error: unknown) {
    logger.error("Error generating class report:", error);
    return apiError("REPORT_FAILED", "Error al generar el reporte", 500);
  }
});
