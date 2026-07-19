export const dynamic = "force-dynamic";

import type { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { charges } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { verifyAcademyAccess } from "@/lib/permissions";
import { collectCharge } from "@/lib/stripe/charge-collection-service";

/**
 * POST /api/charges/[chargeId]/collect
 *
 * Cobra un cargo con la tarjeta guardada de la familia (Stripe off-session).
 * Solo staff con acceso a la academia del cargo. Rate-limited.
 */
const collectHandler = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const chargeId = url.pathname.match(/^\/api\/charges\/([^/]+)\/collect/)?.[1];
    if (!chargeId) {
      return apiError("CHARGE_ID_REQUIRED", "Charge ID is required", 400);
    }
    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    const [charge] = await db
      .select({ academyId: charges.academyId })
      .from(charges)
      .where(eq(charges.id, chargeId))
      .limit(1);
    if (!charge) {
      return apiError("CHARGE_NOT_FOUND", "Cargo no encontrado", 404);
    }

    const access = await verifyAcademyAccess(charge.academyId, context.tenantId);
    if (!access.allowed) {
      return apiError(access.reason ?? "FORBIDDEN", "Access denied", 403);
    }

    const result = await collectCharge(chargeId);

    if (result.status === "paid") {
      return apiSuccess({ status: "paid", paymentIntentId: result.paymentIntentId });
    }
    if (result.status === "requires_action") {
      return apiError(
        "REQUIRES_ACTION",
        "El pago necesita autenticación del titular de la tarjeta (SCA).",
        409
      );
    }
    if (result.status === "skipped") {
      return apiError("COLLECTION_SKIPPED", result.reason, 409);
    }
    return apiError("COLLECTION_FAILED", result.reason, 402);
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
