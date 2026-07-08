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
    features: [
      "Hasta 30 gimnastas",
      "1 academia",
      "3 grupos de entrenamiento",
      "10 clases activas",
      "Asistencia y cobros básicos",
    ],
  },
  {
    code: "starter",
    publicName: "Starter",
    internalName: "Starter",
    priceEurCents: 1900,
    description: "Para academias pequeñas que quieren ordenar grupos, asistencia y cobros.",
    shortDescription: "Hasta 75 gimnastas · 1 academia",
    athleteLimit: 75,
    groupLimit: 5,
    classLimit: 20,
    academyLimit: 1,
    cta: "Contratar Starter",
    features: [
      "Hasta 75 gimnastas",
      "1 academia",
      "5 grupos de entrenamiento",
      "20 clases activas",
      "Cobros recurrentes y reportes básicos",
    ],
  },
  {
    code: "pro",
    publicName: "Growth",
    internalName: "Growth",
    priceEurCents: 4900,
    description: "Para academias en crecimiento que necesitan más capacidad y seguimiento diario.",
    shortDescription: "Hasta 200 gimnastas · operación completa",
    athleteLimit: 200,
    groupLimit: 10,
    classLimit: 40,
    academyLimit: null,
    highlight: true,
    cta: "Solicitar demo",
    features: [
      "Hasta 200 gimnastas",
      "Academias ilimitadas",
      "10 grupos por academia",
      "40 clases por academia",
      "Cobros recurrentes y reportes operativos",
    ],
  },
  {
    code: "premium",
    publicName: "Network",
    internalName: "Network",
    priceEurCents: 9900,
    description: "Para academias multi-sede o equipos que necesitan límites amplios y soporte prioritario.",
    shortDescription: "Sin límites operativos principales",
    athleteLimit: null,
    groupLimit: null,
    classLimit: null,
    academyLimit: null,
    cta: "Hablar con Zaltyko",
    features: [
      "Gimnastas ilimitadas",
      "Academias ilimitadas",
      "Grupos y clases ilimitados",
      "Reportes de dirección",
      "Soporte prioritario",
    ],
  },
];

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
