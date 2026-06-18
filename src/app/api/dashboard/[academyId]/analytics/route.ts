import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { calculateAdvancedMetrics } from "@/lib/dashboard/metrics-calculator";
import { logger } from "@/lib/logger";
import { verifyAcademyAccessForProfile } from "@/lib/permissions";

export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const academyId = (context.params as { academyId?: string } | undefined)?.academyId;

  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  try {
    const access = await verifyAcademyAccessForProfile({
      academyId,
      tenantId: context.tenantId,
      profile: context.profile,
    });
    if (!access.allowed) {
      return apiError(access.reason ?? "FORBIDDEN", "Access denied", 403);
    }

    const metrics = await calculateAdvancedMetrics(academyId, context.tenantId);
    return apiSuccess({ data: metrics });
  } catch (error: any) {
    logger.error("Error calculating advanced metrics:", error);
    return apiError("METRICS_FAILED", "Failed to calculate metrics", 500);
  }
});
