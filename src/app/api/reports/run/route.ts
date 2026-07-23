import { apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { isFeatureEnabled } from "@/lib/product/features";

export const dynamic = 'force-dynamic';

export const POST = withTenant(async () => {
  if (!isFeatureEnabled("advancedAnalytics")) {
    return apiError("FEATURE_DISABLED", "Analítica avanzada no disponible en esta versión", 404);
  }
  return apiError("FEATURE_DISABLED", "La ejecución avanzada requiere habilitación del producto", 404);
});
