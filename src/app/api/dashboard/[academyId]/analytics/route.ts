import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { calculateAdvancedMetrics } from "@/lib/dashboard/metrics-calculator";

export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const academyId = (context.params as { academyId?: string } | undefined)?.academyId;

  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  try {
    const metrics = await calculateAdvancedMetrics(academyId, context.tenantId);
    return apiSuccess({ data: metrics });
  } catch (error: any) {
    console.error("Error calculating advanced metrics:", error);
    return apiError("METRICS_FAILED", error.message, 500);
  }
});

