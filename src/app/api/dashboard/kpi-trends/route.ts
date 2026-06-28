import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getKpiTrends, EMPTY_TRENDS } from "@/lib/dashboard/kpi-trends";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  academyId: z.string().uuid(),
  days: z.coerce.number().int().min(2).max(90).optional(),
});

/**
 * GET /api/dashboard/kpi-trends?academyId=<uuid>&days=14
 *
 * Devuelve series temporales reales para los sparklines de los KPIs del
 * dashboard. Aislamiento multi-tenant garantizado por withTenant + filtro por
 * tenantId dentro de getKpiTrends.
 */
export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    academyId: url.searchParams.get("academyId") || undefined,
    days: url.searchParams.get("days") || undefined,
  });

  if (!parsed.success) {
    return apiError("INVALID_PARAMS", "Parámetros inválidos", 400, parsed.error.flatten());
  }

  try {
    const trends = await getKpiTrends(
      parsed.data.academyId,
      context.tenantId,
      parsed.data.days ?? 14
    );
    return apiSuccess(trends);
  } catch (error: unknown) {
    logger.error("Error computing KPI trends:", error);
    // Degradación elegante: el dashboard sigue funcionando sin sparklines.
    return apiSuccess(EMPTY_TRENDS);
  }
});
