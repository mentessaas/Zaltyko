import type { CommercialPlanCode, PlanCode } from "@/types/billing";

export interface ProductPlan {
  code: CommercialPlanCode;
  publicName: string;
  internalName: string;
  priceEurCents: number;
  /** Precio anual cobrado de una vez; ausencia = no disponible para autoservicio. */
  annualPriceEurCents?: number;
  description: string;
  shortDescription: string;
  athleteLimit: number | null;
  groupLimit: number | null;
  classLimit: number | null;
  academyLimit: number | null;
  /** Máximo de miembros activos o invitaciones abiertas, incluida la dueña. */
  teamMemberLimit: number | null;
  highlight?: boolean;
  cta: string;
  ctaHref: string;
  checkoutMode: "included" | "self-serve" | "sales-assisted";
  features: string[];
}

export const PRODUCT_PLANS: ProductPlan[] = [
  {
    code: "free",
    publicName: "Gratis",
    internalName: "Gratis",
    priceEurCents: 0,
    description:
      "Para academias que están empezando a digitalizar su gestión diaria.",
    shortDescription: "Hasta 30 gimnastas · 2 personas en el equipo",
    athleteLimit: 30,
    groupLimit: null,
    classLimit: null,
    academyLimit: 1,
    teamMemberLimit: 2,
    cta: "Crear academia gratis",
    ctaHref: "/auth/register?role=owner",
    checkoutMode: "included",
    features: [
      "Hasta 30 gimnastas",
      "Grupos y clases sin límite",
      "Dirección y una persona del equipo",
      "Gestión diaria, asistencia y cuotas a mano",
      "Niveles, diplomas, guiones de sesión y biblioteca",
    ],
  },
  {
    code: "club",
    publicName: "Club",
    internalName: "Club",
    priceEurCents: 2397,
    annualPriceEurCents: 23967,
    description:
      "Todo lo necesario para coordinar el día a día del club.",
    shortDescription: "Sin límites de gimnastas, equipo, grupos ni clases",
    athleteLimit: null,
    groupLimit: null,
    classLimit: null,
    academyLimit: 1,
    teamMemberLimit: null,
    cta: "Crear academia gratis",
    ctaHref: "/auth/register?role=owner",
    checkoutMode: "self-serve",
    features: [
      "Gimnastas, equipo, grupos y clases sin límite",
      "Invitaciones al equipo, titulares y sustituciones",
      "Portal familiar, avisos y recordatorios de cuotas pendientes",
      "Clases de prueba, importación desde Excel y resumen semanal",
      "Una sede incluida; añade otras cuando las necesites",
      "Cobro automático de cuotas sin coste adicional cuando se active",
    ],
  },
  {
    // Plan heredado oculto: conserva su importe actual para clientes existentes.
    code: "pro",
    publicName: "Club (heredado)",
    internalName: "Starter heredado",
    priceEurCents: 1900,
    annualPriceEurCents: 19000,
    description: "Suscripción anterior conservada hasta que la dueña decida cambiarla.",
    shortDescription: "Derechos de Club · precio anterior conservado",
    athleteLimit: null,
    groupLimit: null,
    classLimit: null,
    academyLimit: 1,
    teamMemberLimit: null,
    cta: "Crear academia gratis",
    ctaHref: "/auth/register?role=owner",
    checkoutMode: "included",
    features: ["Derechos de Club con el precio de la suscripción anterior"],
  },
  {
    // Growth también conserva el importe histórico, sin opción de alta nueva.
    code: "premium",
    publicName: "Club (heredado)",
    internalName: "Growth heredado",
    priceEurCents: 4900,
    annualPriceEurCents: 49000,
    description:
      "Para academias en crecimiento que necesitan más capacidad y seguimiento diario.",
    shortDescription: "Derechos de Club · precio anterior conservado",
    athleteLimit: null,
    groupLimit: null,
    classLimit: null,
    academyLimit: 1,
    teamMemberLimit: null,
    cta: "Crear academia gratis",
    ctaHref: "/auth/register?role=owner",
    checkoutMode: "included",
    features: [
      "Derechos de Club con el precio de la suscripción anterior",
    ],
  },
  {
    code: "network",
    publicName: "Club (heredado)",
    internalName: "Network heredado",
    priceEurCents: 9900,
    // Código histórico, conservado solo para leer suscripciones ya existentes.
    description:
      "Plan histórico no disponible para nuevas contrataciones.",
    shortDescription: "Plan histórico",
    athleteLimit: null,
    groupLimit: null,
    classLimit: null,
    academyLimit: null,
    teamMemberLimit: null,
    cta: "Crear academia gratis",
    ctaHref: "/auth/register?role=owner",
    checkoutMode: "included",
    features: [
      "Plan histórico oculto",
    ],
  },
];

export const PRODUCT_PLAN_BY_CODE = Object.fromEntries(
  PRODUCT_PLANS.map((plan) => [plan.code, plan])
) as Record<CommercialPlanCode, ProductPlan>;

const INTERNAL_PLAN_CODES = new Set([
  "free",
  "club",
  "pro",
  "premium",
  "network",
  "custom",
]);

/**
 * Nombre que se puede mostrar a una persona para un código persistido.
 *
 * Los códigos `pro` y `premium` se mantienen por compatibilidad con Stripe y
 * la base de datos, pero nunca deben aparecer como nombres comerciales en la
 * interfaz. Para códigos no reconocidos (por ejemplo, un plan histórico o
 * personalizado) preferimos una etiqueta segura antes que filtrar un
 * identificador interno.
 */
export function getProductPlanPublicName(
  code: string | null | undefined,
  fallback?: string | null
): string {
  const normalizedCode = code?.trim().toLowerCase() ?? "";
  const canonical = PRODUCT_PLAN_BY_CODE[normalizedCode as CommercialPlanCode];
  if (canonical) return canonical.publicName;

  const normalizedFallback = fallback?.trim() ?? "";
  if (
    normalizedFallback &&
    normalizedFallback.toLowerCase() !== normalizedCode &&
    !INTERNAL_PLAN_CODES.has(normalizedFallback.toLowerCase())
  ) {
    return normalizedFallback;
  }

  return "Plan personalizado";
}

export const BILLABLE_PRODUCT_PLANS = PRODUCT_PLANS.filter(
  (plan): plan is ProductPlan & { code: PlanCode } => plan.code !== "network"
);

/**
 * Planes que la web pública ofrece. Los códigos heredados siguen resolviendo
 * derechos y facturas pero no se muestran como opciones nuevas.
 */
export const PUBLIC_PRODUCT_PLANS = PRODUCT_PLANS.filter(
  (plan) => plan.code === "free" || plan.code === "club"
);

export function formatPlanAmount(priceEurCents: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
  }).format(priceEurCents / 100);
}
