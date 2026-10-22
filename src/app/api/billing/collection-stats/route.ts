import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademyAccess } from "@/lib/permissions";
import { currentPeriod, getCollectionStats } from "@/lib/billing/collection-stats";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  academyId: z.string().uuid(),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable()
    .optional(),
});

/**
 * GET /api/billing/collection-stats?academyId=&period=YYYY-MM
 * Métricas de cobro del periodo (cobrado, pendiente, fallidos, morosos, auto/manual, % éxito).
 */
export const GET = withTenant(async (request, context) => {
  try {
    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID requerido", 400);
    }
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Datos inválidos", 400, parsed.error.issues);
    }

    const access = await verifyAcademyAccess(parsed.data.academyId, context.tenantId);
    if (!access.allowed) {
      return apiError(access.reason ?? "FORBIDDEN", "Access denied", 403);
    }

    const period = parsed.data.period ?? currentPeriod();
    const stats = await getCollectionStats(parsed.data.academyId, period);
    return apiSuccess(stats);
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/billing/collection-stats",
      method: "GET",
    }) as NextResponse;
  }
});
