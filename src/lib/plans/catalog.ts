import type { CommercialPlanCode, PlanCode } from "@/types/billing";

export interface ProductPlan {
  code: CommercialPlanCode;
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
  ctaHref: string;
  checkoutMode: "included" | "self-serve" | "sales-assisted";
  features: string[];
}

export const PRODUCT_PLANS: ProductPlan[] = [
  {
    code: "free",
    publicName: "Free",
    internalName: "Free",
    priceEurCents: 0,
    description: "Para academias que están empezando a digitalizar su gestión diaria.",
    shortDescription: "Hasta 30 gimnastas · 1 academia",
    athleteLimit: 30,
    groupLimit: 3,
    classLimit: 10,
    academyLimit: 1,
    cta: "Empezar gratis",
    ctaHref: "/auth/register?role=owner",
    checkoutMode: "included",
    features: [
      "Hasta 30 gimnastas",
      "1 academia",
      "3 grupos de entrenamiento",
      "10 clases activas",
      "Asistencia y cobros básicos",
    ],
  },
  {
    // Decisión activa 2026-06-24: `pro` es el código interno de Starter.
    code: "pro",
    publicName: "Starter",
    internalName: "Starter",
    priceEurCents: 1900,
    description: "Para academias pequeñas que quieren ordenar grupos, asistencia y cobros.",
    shortDescription: "Hasta 75 gimnastas · 1 academia",
    athleteLimit: 75,
    groupLimit: 5,
    classLimit: 20,
    academyLimit: 1,
    cta: "Solicitar demo",
    ctaHref: "/contact?type=demo&plan=starter",
    checkoutMode: "self-serve",
    features: [
      "Hasta 75 gimnastas · 1 academia",
      "Cobros recurrentes y reportes básicos",
      "Portal de familias completo",
      "Comunicación interna con familias",
    ],
  },
  {
    // Decisión activa 2026-06-24: `premium` es el código interno de Growth.
    code: "premium",
    publicName: "Growth",
    internalName: "Growth",
    priceEurCents: 4900,
    description: "Para academias en crecimiento que necesitan más capacidad y seguimiento diario.",
    shortDescription: "Hasta 200 gimnastas · 1 academia",
    athleteLimit: 200,
    groupLimit: 10,
    classLimit: 40,
    academyLimit: 1,
    highlight: true,
    cta: "Solicitar demo",
    ctaHref: "/contact?type=demo&plan=growth",
    checkoutMode: "self-serve",
    features: [
      "Hasta 200 gimnastas · 1 academia",
      "Todo lo de Starter",
      "Reportes ejecutivos y automatizaciones",
      "Soporte prioritario",
    ],
  },
  {
    code: "network",
    publicName: "Network",
    internalName: "Network",
    priceEurCents: 9900,
    description: "Para academias multi-sede o equipos que necesitan límites amplios y soporte prioritario.",
    shortDescription: "Multi-sede con onboarding acompañado",
    athleteLimit: null,
    groupLimit: null,
    classLimit: null,
    academyLimit: null,
    cta: "Hablar con Zaltyko",
    ctaHref: "/contact?type=network",
    checkoutMode: "sales-assisted",
    features: [
      "Gimnastas ilimitadas",
      "Multi-sede con onboarding acompañado",
      "Grupos y clases ilimitados",
      "Reportes de dirección",
      "Soporte prioritario",
    ],
  },
];

export const PRODUCT_PLAN_BY_CODE = Object.fromEntries(
  PRODUCT_PLANS.map((plan) => [plan.code, plan])
) as Record<CommercialPlanCode, ProductPlan>;

export const BILLABLE_PRODUCT_PLANS = PRODUCT_PLANS.filter(
  (plan): plan is ProductPlan & { code: PlanCode } => plan.code !== "network"
);

export function formatPlanAmount(priceEurCents: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
  }).format(priceEurCents / 100);
}
