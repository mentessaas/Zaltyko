import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { isFeatureEnabled } from "@/lib/product/features";

export const dynamic = 'force-dynamic';

export const GET = withTenant(async () => {
  if (!isFeatureEnabled("scheduledReports")) {
    return apiError("FEATURE_DISABLED", "Reportes programados no disponibles en esta versión", 404);
  }

  return apiSuccess({ item: null });
});

export const PATCH = withTenant(async () => {
  if (!isFeatureEnabled("scheduledReports")) {
    return apiError("FEATURE_DISABLED", "Reportes programados no disponibles en esta versión", 404);
  }

  return apiError("NOT_IMPLEMENTED", "Not implemented", 501);
});

export const DELETE = withTenant(async () => {
  if (!isFeatureEnabled("scheduledReports")) {
    return apiError("FEATURE_DISABLED", "Reportes programados no disponibles en esta versión", 404);
  }

  return apiError("NOT_IMPLEMENTED", "Not implemented", 501);
});
