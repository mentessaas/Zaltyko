/**
 * Vocabulario del panel de inteligencia competitiva (super-admin).
 * Módulo puro: lo comparten esquema, contratos, servidor y componentes cliente.
 */

export const COMPETITOR_TYPES = [
  "directo",
  "espana_gimnasia",
  "internacional",
  "adyacente",
] as const;
export type CompetitorType = (typeof COMPETITOR_TYPES)[number];
export const COMPETITOR_TYPE_LABELS: Record<CompetitorType, string> = {
  directo: "Competidor directo",
  espana_gimnasia: "España · oferta para gimnasia",
  internacional: "Referente internacional",
  adyacente: "Adyacente / sustituto",
};

export const RESEARCH_STATUSES = ["pendiente", "en_curso", "completa"] as const;
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];
export const RESEARCH_STATUS_LABELS: Record<ResearchStatus, string> = {
  pendiente: "Pendiente de investigar",
  en_curso: "En curso",
  completa: "Completa",
};

export const LIFECYCLE_STATUSES = ["activo", "inactivo", "archivado"] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];
export const LIFECYCLE_STATUS_LABELS: Record<LifecycleStatus, string> = {
  activo: "Activo",
  inactivo: "Inactivo",
  archivado: "Archivado",
};

export const DISCIPLINES = [
  "artistica",
  "ritmica",
  "trampolin",
  "acrobatica",
  "aerobica",
  "recreativa",
  "cheer_tumbling_ninja",
  "multideporte",
] as const;
export type Discipline = (typeof DISCIPLINES)[number];
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  artistica: "Artística",
  ritmica: "Rítmica",
  trampolin: "Trampolín",
  acrobatica: "Acrobática",
  aerobica: "Aeróbica",
  recreativa: "Recreativa / escuela",
  cheer_tumbling_ninja: "Cheer, tumbling, ninja",
  multideporte: "Multideporte",
};

export const CLIENT_SIZES = [
  "pequeno",
  "mediano",
  "grande",
  "multisede",
  "federacion",
] as const;
export type ClientSize = (typeof CLIENT_SIZES)[number];
export const CLIENT_SIZE_LABELS: Record<ClientSize, string> = {
  pequeno: "Pequeño (≤ 40)",
  mediano: "Mediano (40–150)",
  grande: "Grande (> 150)",
  multisede: "Multisede",
  federacion: "Federación / organizador",
};

export const SECTION_KEYS = [
  "descripcion",
  "icp",
  "buyer_persona",
  "fundadores_equipo",
  "posicionamiento",
  "promesas",
  "funciones",
  "precios",
  "limites",
  "modelo_negocio",
  "captacion",
  "contenido",
  "alianzas",
  "fortalezas",
  "debilidades",
  "oportunidades_zaltyko",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export const SECTION_LABELS: Record<SectionKey, string> = {
  descripcion: "Descripción",
  icp: "ICP",
  buyer_persona: "Buyer persona",
  fundadores_equipo: "Fundadores y equipo",
  posicionamiento: "Posicionamiento",
  promesas: "Promesas",
  funciones: "Funciones",
  precios: "Precios",
  limites: "Límites",
  modelo_negocio: "Modelo de negocio",
  captacion: "Canales de captación",
  contenido: "Contenido",
  alianzas: "Alianzas",
  fortalezas: "Fortalezas",
  debilidades: "Debilidades",
  oportunidades_zaltyko: "Oportunidades para Zaltyko",
};
/** Agrupación de secciones en pestañas de la ficha. */
export const SECTION_GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  sections: readonly SectionKey[];
}> = [
  {
    id: "resumen",
    label: "Resumen y segmento",
    sections: ["descripcion", "icp", "buyer_persona", "fundadores_equipo"],
  },
  {
    id: "posicionamiento",
    label: "Posicionamiento",
    sections: ["posicionamiento", "promesas", "fortalezas", "debilidades"],
  },
  { id: "producto", label: "Producto", sections: ["funciones"] },
  {
    id: "negocio",
    label: "Precios y negocio",
    sections: ["precios", "limites", "modelo_negocio"],
  },
  {
    id: "captacion",
    label: "Captación",
    sections: ["captacion", "contenido", "alianzas"],
  },
  {
    id: "oportunidades",
    label: "Oportunidades",
    sections: ["oportunidades_zaltyko"],
  },
];

export const DATA_STATUSES = [
  "verificado",
  "pendiente_revision",
  "desactualizado",
] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];
export const DATA_STATUS_LABELS: Record<DataStatus, string> = {
  verificado: "Verificado",
  pendiente_revision: "Pendiente de revisar",
  desactualizado: "Desactualizado",
};

export const EVIDENCE_LEVELS = [
  "observado",
  "declarado",
  "confirmado",
  "inferido",
  "sin_evidencia",
] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];
export const EVIDENCE_LEVEL_LABELS: Record<EvidenceLevel, string> = {
  observado: "Observado",
  declarado: "Declarado por la empresa",
  confirmado: "Confirmado por terceros",
  inferido: "Inferido",
  sin_evidencia: "Sin evidencia suficiente",
};

export const SOURCE_TYPES = [
  "web_oficial",
  "precios",
  "tutorial_demo",
  "app_store",
  "resena",
  "prensa",
  "dossier",
  "alianza",
  "redes",
  "anuncio",
  "registro",
  "otro",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  web_oficial: "Web oficial",
  precios: "Página de precios",
  tutorial_demo: "Tutorial o demo",
  app_store: "Tienda de apps",
  resena: "Reseña",
  prensa: "Prensa",
  dossier: "Dossier comercial",
  alianza: "Alianza o partner",
  redes: "Redes sociales",
  anuncio: "Anuncio",
  registro: "Registro público",
  otro: "Otro",
};

export const ZALTYKO_FLOW_STATUSES = [
  "completo",
  "parcial",
  "flag",
  "pendiente_produccion",
  "ausente",
] as const;
export type ZaltykoFlowStatus = (typeof ZALTYKO_FLOW_STATUSES)[number];
export const ZALTYKO_FLOW_STATUS_LABELS: Record<ZaltykoFlowStatus, string> = {
  completo: "Completo y comprobable",
  parcial: "Parcial",
  flag: "Detrás de una feature flag",
  pendiente_produccion: "Pendiente de comprobar en producción",
  ausente: "Ausente",
};

export const FLOW_COVERAGES = [
  "resuelve",
  "parcial",
  "no",
  "desconocido",
] as const;
export type FlowCoverage = (typeof FLOW_COVERAGES)[number];
export const FLOW_COVERAGE_LABELS: Record<FlowCoverage, string> = {
  resuelve: "Lo resuelve",
  parcial: "Parcial",
  no: "No",
  desconocido: "Desconocido",
};

export const OPPORTUNITY_CLASSES = [
  "igualar",
  "superar",
  "diferenciar",
  "posponer",
] as const;
export type OpportunityClass = (typeof OPPORTUNITY_CLASSES)[number];
export const OPPORTUNITY_CLASS_LABELS: Record<OpportunityClass, string> = {
  igualar: "Igualar",
  superar: "Superar",
  diferenciar: "Diferenciar",
  posponer: "Posponer",
};

export const OPPORTUNITY_STATUSES = [
  "hipotesis",
  "validando",
  "decidida",
  "descartada",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];
export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  hipotesis: "Hipótesis",
  validando: "Validando",
  decidida: "Decidida",
  descartada: "Descartada",
};

export const CONFIDENCE_LEVELS = ["alta", "media", "baja"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
export const EFFORT_SIZES = ["S", "M", "L"] as const;
export type EffortSize = (typeof EFFORT_SIZES)[number];

export const BILLING_PERIODS = ["mes", "ano", "unico", "consultar"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];
export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  mes: "al mes",
  ano: "al año",
  unico: "pago único",
  consultar: "a consultar",
};

export const VAT_MODES = ["incluido", "excluido", "desconocido"] as const;
export type VatMode = (typeof VAT_MODES)[number];
export const VAT_MODE_LABELS: Record<VatMode, string> = {
  incluido: "IVA incluido",
  excluido: "IVA no incluido",
  desconocido: "IVA no indicado",
};

/** Días por defecto antes de volver a comprobar un dato. Precios cambian antes. */
export const DEFAULT_REVIEW_DAYS: Record<SectionKey | "pricing", number> = {
  descripcion: 180,
  icp: 180,
  buyer_persona: 180,
  fundadores_equipo: 180,
  posicionamiento: 90,
  promesas: 90,
  funciones: 90,
  precios: 60,
  limites: 60,
  modelo_negocio: 120,
  captacion: 90,
  contenido: 90,
  alianzas: 120,
  fortalezas: 120,
  debilidades: 120,
  oportunidades_zaltyko: 60,
  pricing: 60,
};

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
