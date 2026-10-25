import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademyAccess } from "@/lib/permissions";
import { FAMILY_AUTOMATIC_COLLECTION_DISABLED } from "@/lib/stripe/family-automatic-collection-disabled";

const QuerySchema = z.object({
  academyId: z.guid(),
});

/**
 * GET /api/payments/connect/status?academyId=...
 *
 * Capacidad manual-only de la academia, con validación tenant-scoped y sin
 * consultar el estado Connect histórico.
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

    const response = apiSuccess({
      connected: false,
      ready: false,
      status: "disabled",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      country: null,
      lastSyncedAt: null,
      collectionMode: "manual",
      manualCollectionAvailable: true,
      automaticCollectionEnabled: false,
      disabledReason: FAMILY_AUTOMATIC_COLLECTION_DISABLED,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/payments/connect/status",
      method: "GET",
    }) as NextResponse;
  }
});
