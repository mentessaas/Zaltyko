import { NextResponse } from "next/server";

import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { calculateGrMetrics } from "@/lib/dashboard/gr-metrics";
import { db } from "@/db";
import { athletes } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

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
    // Get all athlete IDs for this academy
    const athleteRows = await db
      .select({ id: athletes.id })
      .from(athletes)
      .where(eq(athletes.academyId, academyId));

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
  } catch (error: any) {
    console.error("Error calculating GR metrics:", error);
    return apiError("INTERNAL_ERROR", "Failed to calculate GR metrics", 500);
  }
});
