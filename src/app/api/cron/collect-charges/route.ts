import { apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { FAMILY_AUTOMATIC_COLLECTION_DISABLED } from "@/lib/stripe/family-automatic-collection-disabled";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/collect-charges
 *
 * Endpoint retirado para cobros familiares automáticos. Conserva la
 * autenticación del scheduler y responde de forma explícita que está desactivado.
 */
export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const response = apiSuccess({
    status: "disabled",
    reason: FAMILY_AUTOMATIC_COLLECTION_DISABLED,
    processed: 0,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
