import { apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/collect-charges
 *
 * El cobro automático legacy se desactiva hasta que exista una preferencia
 * explícita por academia, entitlement de plan de pago y autorización trazable
 * de cada pagador. Mantener la ruta como no-op autenticado evita que una llamada
 * manual o una configuración antigua vuelva a cobrar por accidente.
 */
export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  return apiSuccess({
    skipped: true,
    reason: "AUTOMATIC_COLLECTION_NOT_ENABLED",
  });
}
