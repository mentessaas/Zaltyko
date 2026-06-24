import type { PlanCode } from "@/types/billing";

export interface ProductPlan {
  code: PlanCode;
  publicName: string;
  internalName: string;
  priceEurCents: number;
  description: string;
  shortDescription: string;
  athleteLimit: number | null;
  groupLimit: number | null;
  classLimit: number | null;
  academyLimit: number | null;
  highlight?: boolean;
  cta: string;
  features: string[];
  checkoutEnabled?: boolean;
}

export const PRODUCT_PLANS: ProductPlan[] = [
  {
    code: "free",
    publicName: "Free",
    internalName: "Free",
    priceEurCents: 0,
    description: "Para academias nuevas que quieren ordenar gimnastas, grupos, clases y asistencia básica.",
    shortDescription: "Hasta 30 gimnastas · 1 academia",
    athleteLimit: 30,
    groupLimit: 2,
    classLimit: 5,
    academyLimit: 1,
    cta: "Empezar",
    features: [
      "Hasta 30 gimnastas",
      "1 academia",
      "2 grupos de entrenamiento",
      "5 clases activas",
      "Asistencia básica",
    ],
  },
  {
    code: "pro",
    publicName: "Starter",
    internalName: "Starter",
    priceEurCents: 1900,
    description: "Para academias que necesitan pagos recurrentes, portal de familias y seguimiento diario.",
    shortDescription: "Hasta 75 gimnastas · operación diaria",
    athleteLimit: 75,
    groupLimit: 10,
    classLimit: 40,
    academyLimit: 1,
    highlight: true,
    cta: "Elegir Starter",
    features: [
      "Hasta 75 gimnastas",
      "1 academia operativa",
      "10 grupos por academia",
      "40 clases por academia",
      "Pagos recurrentes, portal familias y reportes básicos",
    ],
  },
  {
    code: "premium",
    publicName: "Growth",
    internalName: "Growth",
    priceEurCents: 4900,
    description: "Para academias consolidadas que necesitan capacidad amplia, automatizaciones y soporte prioritario.",
    shortDescription: "Hasta 200 gimnastas · 1 academia",
    athleteLimit: 200,
    groupLimit: 20,
    classLimit: 80,
    academyLimit: 1,
    cta: "Elegir Growth",
    features: [
      "Hasta 200 gimnastas",
      "1 academia operativa",
      "20 grupos por academia",
      "80 clases por academia",
      "Reportes de dirección",
      "Soporte prioritario",
    ],
  },
];

export const NETWORK_PLAN = {
  publicName: "Network",
  internalName: "Network",
  priceEurCents: 9900,
  description: "Para redes multi-sede que necesitan onboarding acompañado, SLA dedicado e integraciones.",
  shortDescription: "Multi-sede · gimnastas ilimitadas",
  athleteLimit: null,
  groupLimit: null,
  classLimit: null,
  academyLimit: null,
  cta: "Hablar con Zaltyko",
  features: [
    "Multi-sede con onboarding acompañado",
    "Gimnastas ilimitadas",
    "Grupos y clases ilimitados",
    "SLA dedicado",
    "Integraciones bajo alcance",
  ],
  checkoutEnabled: false,
} satisfies Omit<ProductPlan, "code">;

export const PRODUCT_PLAN_BY_CODE = Object.fromEntries(
  PRODUCT_PLANS.map((plan) => [plan.code, plan])
) as Record<PlanCode, ProductPlan>;

export function formatPlanAmount(priceEurCents: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
  }).format(priceEurCents / 100);
}
