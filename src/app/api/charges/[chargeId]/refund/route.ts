export const dynamic = "force-dynamic";

/** @resource-scope academy — actual charge academy ownership is verified. */

import type { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { charges } from "@/db/schema";
import { apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { getBillingAcademyAccess } from "@/lib/billing/access";
import {
  FAMILY_AUTOMATIC_COLLECTION_DISABLED,
} from "@/lib/stripe/family-automatic-collection-disabled";

const BodySchema = z.object({
  amountCents: z.number().int().positive().nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
});

/**
 * POST /api/charges/[chargeId]/refund
 *
 * Conserva el scope Owner; los reembolsos familiares desde la aplicación están
 * deshabilitados y se derivan a soporte. Rate-limited.
 */
const refundHandler = withTenant(async (request, context) => {
  try {
    const chargeId = new URL(request.url).pathname.match(
      /^\/api\/charges\/([^/]+)\/refund/
    )?.[1];
    if (!chargeId) {
      return apiError("CHARGE_ID_REQUIRED", "Charge ID is required", 400);
    }
    if (!z.string().uuid().safeParse(chargeId).success) {
      return apiError("INVALID_CHARGE_ID", "Charge ID is invalid", 400);
    }

    const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Datos inválidos", 400, parsed.error.issues);
    }

    const [charge] = await db
      .select({ academyId: charges.academyId })
      .from(charges)
      .where(and(eq(charges.id, chargeId), eq(charges.tenantId, context.tenantId)))
      .limit(1);
    if (!charge) {
      return apiError("CHARGE_NOT_FOUND", "Cargo no encontrado", 404);
    }

    const academy = await getBillingAcademyAccess({
      academyId: charge.academyId,
      userId: context.userId,
      profileId: context.profile.id,
      profileRole: context.profile.role,
    });
    if (!academy) {
      return apiError("REFUND_FORBIDDEN", "Solo la persona propietaria puede reembolsar", 403);
    }

    return apiError(
      FAMILY_AUTOMATIC_COLLECTION_DISABLED,
      "Los reembolsos familiares desde la aplicación no están disponibles. Contacta con soporte para revisar el caso.",
      410,
      undefined,
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/charges/[chargeId]/refund",
      method: "POST",
    });
  }
});

export const POST = withRateLimit(
  async (request, context) => (await refundHandler(request, context ?? {})) as NextResponse,
  { identifier: getUserIdentifier, limit: 10, window: 60 }
);
