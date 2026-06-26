import { apiSuccess, apiError } from "@/lib/api-response";

import { withTenant } from "@/lib/authz";
import { calculateFinancialStats } from "@/lib/reports/financial-calculator";
import { logger } from "@/lib/logger";
import { verifyAcademyAccessForProfile } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const params = context.params as { academyId?: string };
  const academyId = params?.academyId;
  logger.debug("Financial metrics endpoint called - validating cache clear", { academyId });

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

    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [monthlyStats, globalStats] = await Promise.all([
      calculateFinancialStats({
        academyId,
        tenantId: context.tenantId,
        startDate: new Date(`${currentPeriod}-01T00:00:00.000Z`),
        endDate: now,
      }),
      calculateFinancialStats({
        academyId,
        tenantId: context.tenantId,
      }),
    ]);

    return apiSuccess({
      monthlyRevenue: monthlyStats.paidAmount,
      pendingPayments: globalStats.pendingAmount,
      pendingPaymentsCount: globalStats.pendingCharges,
      activeScholarships: globalStats.bySportConfig?.reduce((sum, item) => sum + item.activeScholarships, 0) ?? 0,
      bySportConfig: globalStats.bySportConfig ?? [],
    });
  } catch (error: unknown) {
    logger.error("Error calculating financial metrics", error, { academyId });
    return apiError("CALCULATION_FAILED", "Failed to calculate financial metrics", 500);
  }
});
