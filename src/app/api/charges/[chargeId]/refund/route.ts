export const dynamic = "force-dynamic";

/** @resource-scope academy — actual charge academy ownership is verified. */

import type { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { charges } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { getBillingAcademyAccess } from "@/lib/billing/access";
import { refundCharge } from "@/lib/stripe/refund-service";

const BodySchema = z.object({
  amountCents: z.number().int().positive().nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
});

/**
 * POST /api/charges/[chargeId]/refund
 *
 * Reembolsa (total o parcial) un cargo cobrado con tarjeta. Solo el dueño de la
 * academia. Rate-limited. La ejecución ocurre en la cuenta conectada de la
 * academia (merchant of record).
 */
const refundHandler = withTenant(async (request, context) => {
  try {
    const chargeId = new URL(request.url).pathname.match(
      /^\/api\/charges\/([^/]+)\/refund/
    )?.[1];
    if (!chargeId) {
      return apiError("CHARGE_ID_REQUIRED", "Charge ID is required", 400);
    }

    const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Datos inválidos", 400, parsed.error.issues);
    }

    const [charge] = await db
      .select({ academyId: charges.academyId })
      .from(charges)
      .where(eq(charges.id, chargeId))
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

    const result = await refundCharge({
      chargeId,
      amountCents: parsed.data.amountCents ?? undefined,
      reason: parsed.data.reason ?? undefined,
      actorUserId: context.userId,
    });

    if (!result.ok) {
      return apiError("REFUND_FAILED", result.reason, 409);
    }
    return apiSuccess({ refundId: result.refundId });
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
