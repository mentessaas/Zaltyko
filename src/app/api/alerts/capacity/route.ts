export const dynamic = 'force-dynamic';

import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { detectCapacityAlerts } from "@/lib/alerts/capacity-alerts";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  academyId: z.string().uuid(),
  threshold: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    threshold: url.searchParams.get("threshold"),
  };

  const validated = querySchema.parse({
    ...params,
    academyId: params.academyId || undefined,
  });

  if (!validated.academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "academyId requerido", 400);
  }

  try {
    const threshold = validated.threshold ? parseFloat(validated.threshold) : 90;
    const alerts = await detectCapacityAlerts(
      validated.academyId,
      context.tenantId,
      threshold
    );

    return apiSuccess({ items: alerts });
  } catch (error: any) {
    logger.error("Error detecting capacity alerts:", error);
    return apiError("ALERTS_FAILED", error.message, 500);
  }
});
