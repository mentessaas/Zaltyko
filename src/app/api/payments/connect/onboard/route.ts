import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getOptionalEnvVar } from "@/lib/env";
import { handleApiError } from "@/lib/api-error-handler";
import { getBillingAcademyAccess } from "@/lib/billing/access";
import {
  createOnboardingLink,
  getOrCreateConnectAccount,
} from "@/lib/stripe/connect-service";

const BodySchema = z.object({
  academyId: z.string().uuid(),
});

/**
 * POST /api/payments/connect/onboard
 *
 * Inicia (o continua) el onboarding de Stripe Connect Standard de una academia.
 * Solo el dueño puede conectar Stripe. Devuelve la URL de onboarding hosted por
 * Stripe (Stripe realiza el KYC). Sustituye a la antigua configuracion falsa de
 * pagos (BYO-keys / flag paymentsConfiguredAt).
 */
const handler = withTenant(async (request, context) => {
  try {
    const secretKey = getOptionalEnvVar("STRIPE_SECRET_KEY");
    if (!secretKey || secretKey.trim() === "") {
      return apiError(
        "STRIPE_NOT_CONFIGURED",
        "Stripe no esta configurado. Contacta con soporte.",
        503
      );
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
      return apiError(
        "CONNECT_FORBIDDEN",
        "Solo la persona propietaria puede conectar Stripe",
        403
      );
    }

    const [meta] = await db
      .select({ country: academies.countryCode, email: academies.contactEmail })
      .from(academies)
      .where(eq(academies.id, academy.id))
      .limit(1);

    const account = await getOrCreateConnectAccount({
      academyId: academy.id,
      tenantId: academy.tenantId,
      country: meta?.country ?? null,
      email: meta?.email ?? null,
      academyName: academy.name,
    });

    const url = await createOnboardingLink(account.stripeAccountId, academy.id);

    return apiSuccess({
      onboardingUrl: url,
      status: account.onboardingStatus,
      chargesEnabled: account.chargesEnabled,
    });
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
