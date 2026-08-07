import { cookies } from "next/headers";

import { db } from "@/db";
import { charges } from "@/db/schema";
import { eq } from "drizzle-orm";

import { apiError, apiSuccess } from "@/lib/api-response";
import { createClient } from "@/lib/supabase/server";
import { resolveFamilyChargeAccess } from "@/lib/family/payment-access";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/family/charges/[chargeId]/status
 *
 * Devuelve el estado actual del cargo en DB para el portal familia. Mismo
 * propósito que `/api/charges/[chargeId]/status` (owner): evita la carrera
 * entre el refresco de UI y el webhook `payment_intent.succeeded` tras un
 * reto 3DS, dejando al portal mostrar "Cobro autenticado" sobre un cargo aún
 * en "Pago fallido".
 *
 * Solo expone `id` y `status`. El padre/madre debe ser guardian del atleta.
 */
export async function GET(request: Request) {
  try {
    const chargeId = new URL(request.url).pathname.match(
      /^\/api\/family\/charges\/([^/]+)\/status/
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

    const charge = await resolveFamilyChargeAccess({
      userId: user.id,
      email: user.email,
      chargeId,
    });
    if (!charge) {
      return apiError("FORBIDDEN", "No tienes acceso a este cargo.", 403);
    }

    const [row] = await db
      .select({ id: charges.id, status: charges.status })
      .from(charges)
      .where(eq(charges.id, chargeId))
      .limit(1);

    if (!row) {
      return apiError("CHARGE_NOT_FOUND", "Cargo no encontrado", 404);
    }
    return apiSuccess({ id: row.id, status: row.status });
  } catch (error) {
    logger.error("Error leyendo estado del cargo (portal familia)", error);
    return apiError("SERVER_ERROR", "No se pudo leer el estado del cargo.", 500);
  }
}
