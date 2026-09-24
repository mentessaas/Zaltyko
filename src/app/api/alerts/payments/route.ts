import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { detectPaymentAlerts } from "@/lib/alerts/payment-alerts";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  academyId: z.string().uuid(),
  daysOverdue: z.coerce.number().int().min(0).max(3650).optional(),
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

  const validated = querySchema.safeParse({
    ...params,
    academyId: params.academyId || undefined,
    daysOverdue: params.daysOverdue || undefined,
  });

  if (!validated.success) {
    return apiError("INVALID_QUERY", "Parámetros de alertas inválidos", 400);
  }

  if (!validated.data.academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "academyId requerido", 400);
  }

  try {
    const daysOverdue = validated.data.daysOverdue ?? 7;
    const alerts = await detectPaymentAlerts(
      validated.data.academyId,
      context.tenantId,
      daysOverdue
    );

    return apiSuccess({ items: alerts });
  } catch (error: unknown) {
    logger.error("Error detecting payment alerts:", error);
    return apiError(
      "PAYMENT_ALERTS_FAILED",
      "No se pudieron cargar los pagos atrasados. Inténtalo de nuevo.",
      500,
    );
  }
});
