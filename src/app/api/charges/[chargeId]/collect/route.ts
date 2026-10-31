export const dynamic = "force-dynamic";

import type { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { charges } from "@/db/schema";
import { apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { handleApiError } from "@/lib/api-error-handler";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import {
  FAMILY_AUTOMATIC_COLLECTION_DISABLED,
  FAMILY_AUTOMATIC_COLLECTION_DISABLED_MESSAGE,
} from "@/lib/stripe/family-automatic-collection-disabled";
import { z } from "zod";

/**
 * POST /api/charges/[chargeId]/collect
 *
 * Conserva el scope del staff, pero no cobra cuotas familiares con tarjeta en
 * el lanzamiento manual-only. Rate-limited.
 */
const collectHandler = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const chargeId = url.pathname.match(/^\/api\/charges\/([^/]+)\/collect/)?.[1];
    if (!chargeId) {
      return apiError("CHARGE_ID_REQUIRED", "Charge ID is required", 400);
    }
    if (!z.guid().safeParse(chargeId).success) {
      return apiError("INVALID_CHARGE_ID", "Charge ID is invalid", 400);
    }
    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    const [charge] = await db
      .select({ tenantId: charges.tenantId, academyId: charges.academyId })
      .from(charges)
      .where(and(eq(charges.id, chargeId), eq(charges.tenantId, context.tenantId)))
      .limit(1);
    if (!charge) {
      return apiError("CHARGE_NOT_FOUND", "Cargo no encontrado", 404);
    }

    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: charge.tenantId,
      academyId: charge.academyId,
      permission: "billing:update",
    });
    if (!scope.allowed) {
      return apiError(scope.reason ?? "FORBIDDEN", "Access denied", 403);
    }

    return apiError(
      FAMILY_AUTOMATIC_COLLECTION_DISABLED,
      FAMILY_AUTOMATIC_COLLECTION_DISABLED_MESSAGE,
      410,
      undefined,
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/charges/[chargeId]/collect",
      method: "POST",
    });
  }
});

export const POST = withRateLimit(
  async (request, context) => (await collectHandler(request, context ?? {})) as NextResponse,
  { identifier: getUserIdentifier, limit: 10, window: 60 }
);
