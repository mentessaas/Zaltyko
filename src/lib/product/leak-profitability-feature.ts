import { apiError } from "@/lib/api-response";
import { isFeatureEnabled } from "@/lib/product/features";

export function requireLeakProfitabilityFeature() {
  if (!isFeatureEnabled("leakProfitability")) {
    return apiError(
      "FEATURE_DISABLED",
      "El modulo de fugas y rentabilidad no esta habilitado para esta academia.",
      404
    );
  }

  return null;
}

