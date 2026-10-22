import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { isFeatureEnabled } from "@/lib/product/features";

export const dynamic = 'force-dynamic';

export const GET = withTenant(async () => {
  if (!isFeatureEnabled("advancedAnalytics")) return apiError("FEATURE_DISABLED", "Las rúbricas no están disponibles en esta versión", 404);
  return apiSuccess([], { total: 0 });
});

export const POST = withTenant(async () => {
  if (!isFeatureEnabled("advancedAnalytics")) return apiError("FEATURE_DISABLED", "Las rúbricas no están disponibles en esta versión", 404);
  return apiError("FEATURE_DISABLED", "La gestión de rúbricas requiere habilitación del producto", 404);
});
