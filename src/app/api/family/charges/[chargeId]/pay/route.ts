import { cookies } from "next/headers";

import { apiError } from "@/lib/api-response";
import { createClient } from "@/lib/supabase/server";
import { resolveFamilyChargeAccess } from "@/lib/family/payment-access";
import { logger } from "@/lib/logger";
import { z } from "zod";
import {
  FAMILY_AUTOMATIC_COLLECTION_DISABLED,
  FAMILY_AUTOMATIC_COLLECTION_DISABLED_MESSAGE,
} from "@/lib/stripe/family-automatic-collection-disabled";

export const dynamic = "force-dynamic";

/** @resource-scope guardian — charge athlete must be one of the caller's linked children. */

/**
 * POST /api/family/charges/[chargeId]/pay
 *
 * Verifica el acceso familiar al cargo y responde que el pago con tarjeta no
 * está disponible en el lanzamiento manual-only.
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
    if (!z.guid().safeParse(chargeId).success) {
      return apiError("INVALID_CHARGE_ID", "Identificador de cargo inválido.", 400);
    }

    const charge = await resolveFamilyChargeAccess({ userId: user.id, email: user.email, chargeId });
    if (!charge) {
      return apiError("FORBIDDEN", "No tienes acceso a este cargo.", 403);
    }

    return apiError(
      FAMILY_AUTOMATIC_COLLECTION_DISABLED,
      FAMILY_AUTOMATIC_COLLECTION_DISABLED_MESSAGE,
      410,
      undefined,
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    logger.error("Error paying family charge", error);
    return apiError("SERVER_ERROR", "No se pudo procesar el pago.", 500);
  }
}
