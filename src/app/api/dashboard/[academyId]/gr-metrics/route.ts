import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { calculateGrMetrics } from "@/lib/dashboard/gr-metrics";
import { db } from "@/db";
import { athletes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { verifyAcademyAccessForProfile } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const defaultGrMetrics = {
  athletesByCategory: [],
  expiringLicenses: [],
  expiringLicensesThisWeek: 0,
  expiringLicensesThisMonth: 0,
  upcomingCompetitions: [],
  assessmentsThisMonth: 0,
  totalAthletesWithActiveLicense: 0,
};

export const GET = withTenant(async (_request, context) => {
  const params = context.params as { academyId?: string };
  const academyId = params?.academyId;

  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
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

    // Get all athlete IDs for this academy
    const athleteRows = await db
      .select({ id: athletes.id })
      .from(athletes)
      .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, context.tenantId)));

    const athleteIds = athleteRows.map((a) => a.id);

    // Calculate GR metrics
    const grMetrics = await calculateGrMetrics({
      academyId,
      tenantId: context.tenantId,
      athleteIds,
    });

    if (!grMetrics) {
      return apiError("METRICS_NOT_AVAILABLE", "GR metrics not available for this academy", 400);
    }

    return apiSuccess(grMetrics);
  } catch (error: unknown) {
    logger.error("Error calculating GR metrics:", error);
    return apiSuccess(defaultGrMetrics);
  }
});
