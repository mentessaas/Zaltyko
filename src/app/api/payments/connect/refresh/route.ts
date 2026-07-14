import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getOptionalEnvVar } from "@/lib/env";
import { handleApiError } from "@/lib/api-error-handler";
import { getBillingAcademyAccess } from "@/lib/billing/access";
import { refreshConnectAccountStatus, isConnectReady } from "@/lib/stripe/connect-service";

const BodySchema = z.object({
  academyId: z.string().uuid(),
});

/**
 * POST /api/payments/connect/refresh
 *
 * Re-consulta el estado de la cuenta conectada en Stripe y lo sincroniza.
 * Se usa al volver del onboarding (return_url) para reflejar cambios sin esperar
 * al webhook. Solo el dueno.
 */
const handler = withTenant(async (request, context) => {
  try {
    const secretKey = getOptionalEnvVar("STRIPE_SECRET_KEY");
    if (!secretKey || secretKey.trim() === "") {
      return apiError("STRIPE_NOT_CONFIGURED", "Stripe no esta configurado.", 503);
    }

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
      return apiError("CONNECT_FORBIDDEN", "Solo la persona propietaria puede gestionar Stripe", 403);
    }

    const account = await refreshConnectAccountStatus(academy.id);
    if (!account) {
      return apiError("CONNECT_NOT_FOUND", "La academia no tiene una cuenta Stripe conectada", 404);
    }

    return apiSuccess({
      ready: isConnectReady(account),
      status: account.onboardingStatus,
      chargesEnabled: account.chargesEnabled,
      payoutsEnabled: account.payoutsEnabled,
      detailsSubmitted: account.detailsSubmitted,
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/payments/connect/refresh",
      method: "POST",
    }) as NextResponse;
  }
});

export const POST = withRateLimit(
  async (request) =>
    (await handler(request, {} as { params?: Record<string, string> })) as NextResponse,
  { identifier: getUserIdentifier, limit: 10, window: 60 }
);
