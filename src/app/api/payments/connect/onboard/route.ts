import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-error-handler";
import { getBillingAcademyAccess } from "@/lib/billing/access";
import {
  FAMILY_AUTOMATIC_COLLECTION_DISABLED,
  FAMILY_AUTOMATIC_COLLECTION_DISABLED_MESSAGE,
} from "@/lib/stripe/family-automatic-collection-disabled";

const BodySchema = z.object({
  academyId: z.guid(),
});

/**
 * POST /api/payments/connect/onboard
 *
 * Conserva autenticación y scope Owner, pero Connect familiar está deshabilitado
 * para este lanzamiento manual-only.
 */
const handler = withTenant(async (request, context) => {
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("INVALID_JSON", "El cuerpo no es un JSON valido", 400);
    }

    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Datos invalidos", 400, parsed.error.issues);
    }

    const academy = await getBillingAcademyAccess({
      academyId: parsed.data.academyId,
      userId: context.userId,
      profileId: context.profile.id,
      profileRole: context.profile.role,
    });
    if (!academy) {
      return apiError(
        "CONNECT_FORBIDDEN",
        "Solo la persona propietaria puede conectar Stripe",
        403
      );
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
      endpoint: "/api/payments/connect/onboard",
      method: "POST",
    }) as NextResponse;
  }
});

export const POST = withRateLimit(
  async (request) =>
    (await handler(request, {} as { params?: Record<string, string> })) as NextResponse,
  { identifier: getUserIdentifier, limit: 10, window: 60 }
);
