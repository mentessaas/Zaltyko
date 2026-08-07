import { cookies } from "next/headers";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getOptionalEnvVar } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { resolveFamilyChargeAccess } from "@/lib/family/payment-access";
import { collectCharge } from "@/lib/stripe/charge-collection-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** @resource-scope guardian — charge athlete must be one of the caller's linked children. */

/**
 * POST /api/family/charges/[chargeId]/pay
 *
 * Permite a un padre/madre pagar una cuota pendiente con la tarjeta guardada.
 * Verifica que el cargo pertenece a uno de sus hijos y dispara collectCharge.
 */
export async function POST(request: Request) {
  try {
    const chargeId = new URL(request.url).pathname.match(
      /^\/api\/family\/charges\/([^/]+)\/pay/
    )?.[1];
    if (!chargeId) {
      return apiError("CHARGE_ID_REQUIRED", "Falta el identificador del cargo.", 400);
    }

    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) {
      return apiError("UNAUTHORIZED", "Sesión no válida.", 401);
    }

    const charge = await resolveFamilyChargeAccess({ userId: user.id, email: user.email, chargeId });
    if (!charge) {
      return apiError("FORBIDDEN", "No tienes acceso a este cargo.", 403);
    }

    const result = await collectCharge(chargeId);
    if (result.status === "paid") {
      return apiSuccess({ status: "paid" });
    }
    if (result.status === "requires_action") {
      const publishableKey = getOptionalEnvVar("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
      return apiError(
        "REQUIRES_ACTION",
        "Tu banco pide autenticación para completar el pago.",
        409,
        result.clientSecret && publishableKey
          ? {
              paymentIntentId: result.paymentIntentId,
              clientSecret: result.clientSecret,
              stripeAccountId: result.stripeAccountId,
              publishableKey,
              // Re-attach explícito del PM en `confirmCardPayment` (Stripe lo
              // limpia del PI cuando off-session exige SCA).
              paymentMethodId: result.paymentMethodId,
            }
          : undefined
      );
    }
    if (result.status === "skipped") {
      return apiError(result.reason, result.reason, 409);
    }
    return apiError(result.reason, result.reason, 402);
  } catch (error) {
    logger.error("Error paying family charge", error);
    return apiError("SERVER_ERROR", "No se pudo procesar el pago.", 500);
  }
}
