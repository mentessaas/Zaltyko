import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademyAccess } from "@/lib/permissions";
import { getConnectAccount, isConnectReady } from "@/lib/stripe/connect-service";

const QuerySchema = z.object({
  academyId: z.string().uuid(),
});

/**
 * GET /api/payments/connect/status?academyId=...
 *
 * Estado de conexion Stripe Connect de una academia (lectura tenant-scoped).
 */
export const GET = withTenant(async (request, context) => {
  try {
    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID requerido", 400);
    }

    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Datos invalidos", 400, parsed.error.issues);
    }

    const access = await verifyAcademyAccess(parsed.data.academyId, context.tenantId);
    if (!access.allowed) {
      return apiError(access.reason ?? "FORBIDDEN", "Access denied", 403);
    }

    const account = await getConnectAccount(parsed.data.academyId);

    return apiSuccess({
      connected: !!account,
      ready: isConnectReady(account),
      status: account?.onboardingStatus ?? "not_connected",
      chargesEnabled: account?.chargesEnabled ?? false,
      payoutsEnabled: account?.payoutsEnabled ?? false,
      detailsSubmitted: account?.detailsSubmitted ?? false,
      country: account?.country ?? null,
      lastSyncedAt: account?.lastSyncedAt ?? null,
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/payments/connect/status",
      method: "GET",
    }) as NextResponse;
  }
});
