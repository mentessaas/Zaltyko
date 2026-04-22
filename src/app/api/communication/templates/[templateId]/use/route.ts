import { apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { isFeatureEnabled } from "@/lib/product/features";

export const dynamic = 'force-dynamic';

export const POST = withTenant(async () => {
  if (!isFeatureEnabled("communicationTemplateUse")) {
    return apiError("FEATURE_DISABLED", "Uso de plantillas no disponible en esta versión", 404);
  }

  return apiError("NOT_IMPLEMENTED", "This endpoint is not implemented", 501);
});
