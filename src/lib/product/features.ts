export type ProductFeatureKey =
  | "advancedAnalytics"
  | "reportsHub"
  | "scheduledReports"
  | "whatsapp"
  | "paymentMethods"
  | "communicationTemplateUse";

const FEATURE_ENV: Record<ProductFeatureKey, string> = {
  advancedAnalytics: "NEXT_PUBLIC_FEATURE_ADVANCED_ANALYTICS",
  reportsHub: "NEXT_PUBLIC_FEATURE_REPORTS_HUB",
  scheduledReports: "NEXT_PUBLIC_FEATURE_SCHEDULED_REPORTS",
  whatsapp: "NEXT_PUBLIC_FEATURE_WHATSAPP",
  paymentMethods: "NEXT_PUBLIC_FEATURE_PAYMENT_METHODS",
  communicationTemplateUse: "NEXT_PUBLIC_FEATURE_TEMPLATE_USE",
};

const FEATURE_DEFAULTS: Record<ProductFeatureKey, boolean> = {
  advancedAnalytics: false,
  reportsHub: false,
  scheduledReports: false,
  whatsapp: false,
  paymentMethods: false,
  communicationTemplateUse: false,
};

export function isFeatureEnabled(feature: ProductFeatureKey): boolean {
  const rawValue = process.env[FEATURE_ENV[feature]];

  if (rawValue === "1" || rawValue === "true") {
    return true;
  }

  if (rawValue === "0" || rawValue === "false") {
    return false;
  }

  return FEATURE_DEFAULTS[feature];
}

export function getFeatureLabel(feature: ProductFeatureKey): string {
  switch (feature) {
    case "advancedAnalytics":
      return "Analítica avanzada";
    case "reportsHub":
      return "Centro de reportes";
    case "scheduledReports":
      return "Reportes programados";
    case "whatsapp":
      return "WhatsApp Business";
    case "paymentMethods":
      return "Métodos de pago";
    case "communicationTemplateUse":
      return "Uso de plantillas de comunicación";
  }
}
