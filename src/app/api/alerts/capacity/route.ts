export const dynamic = 'force-dynamic';

import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { detectCapacityAlerts } from "@/lib/alerts/capacity-alerts";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  academyId: z.string().uuid(),
  threshold: z.coerce.number().finite().min(0).max(100).optional(),
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

  const validated = querySchema.safeParse({
    ...params,
    academyId: params.academyId || undefined,
    threshold: params.threshold || undefined,
  });

  if (!validated.success) {
    return apiError("INVALID_QUERY", "Parámetros de alertas inválidos", 400);
  }

  if (!validated.data.academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "academyId requerido", 400);
  }

  try {
    const threshold = validated.data.threshold ?? 90;
    const alerts = await detectCapacityAlerts(
      validated.data.academyId,
      context.tenantId,
      threshold
    );

    return apiSuccess({ items: alerts });
  } catch (error: unknown) {
    logger.error("Error detecting capacity alerts:", error);
    return apiError(
      "CAPACITY_ALERTS_FAILED",
      "No se pudo analizar la capacidad de las clases. Inténtalo de nuevo.",
      500,
    );
  }
});
