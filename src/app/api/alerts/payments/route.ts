import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { detectPaymentAlerts } from "@/lib/alerts/payment-alerts";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  academyId: z.string().uuid(),
  daysOverdue: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    daysOverdue: url.searchParams.get("daysOverdue"),
  };

  const validated = querySchema.parse({
    ...params,
    academyId: params.academyId || undefined,
  });

  if (!validated.academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "academyId requerido", 400);
  }

  try {
    const daysOverdue = validated.daysOverdue ? parseInt(validated.daysOverdue) : 7;
    const alerts = await detectPaymentAlerts(
      validated.academyId,
      context.tenantId,
      daysOverdue
    );

    return apiSuccess({ items: alerts });
  } catch (error: any) {
    logger.error("Error detecting payment alerts:", error);
    return apiError("ALERTS_FAILED", error.message, 500);
  }
});
