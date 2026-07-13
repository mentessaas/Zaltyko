import { getTimezoneForCountry } from "@/lib/date-utils";
import { BASE_TERMINOLOGY, SPORT_CONFIG_SEEDS, getSportConfigSeedByVariant } from "@/lib/sport-config/catalog";
import type { SportTerminology } from "@/lib/sport-config/catalog";
import { COUNTRY_REGION_OPTIONS } from "@/lib/countryRegions";

export type SupportedCountryCode = "ES" | string;
export type AcademyDiscipline = "artistic" | "rhythmic" | "trampoline" | "parkour" | "dance" | "general";
export type DisciplineVariant =
  | "artistic_female"
  | "artistic_male"
  | "rhythmic"
  | "trampoline"
  | "parkour"
  | "dance"
  | "general";
export type AcademySpecializationStatus =
  | "configured"
  | "inferred"
  | "legacy"
  | "unknown"
  | "generic_fallback";

export interface SpecializationKey {
  countryCode: SupportedCountryCode;
  discipline: AcademyDiscipline;
  disciplineVariant?: DisciplineVariant | null;
}

export interface SpecializedLabels {
  disciplineName: string;
  athleteSingular: string;
  athletesPlural: string;
  groupLabel: string;
  classLabel: string;
  sessionLabel: string;
  levelLabel: string;
  coachLabel: string;
  dashboardHeadline: string;
  familyHeadline: string;
}

export interface SpecializedEvaluationTemplate {
  apparatus: Array<{ code: string; label: string }>;
  assessmentTypes: Array<{ value: string; label: string }>;
}

export interface SpecializedCategoryRules {
  levelOptions: string[];
  levelPlaceholder: string;
}

export interface SpecializedEventTypeOption {
  value: string;
  label: string;
}

export interface SpecializationRegistryEntry {
  key: SpecializationKey;
  locale: string;
  federationConfigVersion: string;
  labels: SpecializedLabels;
  evaluation: SpecializedEvaluationTemplate;
  categories: SpecializedCategoryRules;
  /**
   * Diccionario de vocabulario simple (athlete, coach, payment, etc.) del
   * seed correspondiente. NO incluye `terminologyOverrides` de una academia
   * concreta (academySportConfigs) - eso sigue resolviendose por separado
   * via getTerminology(sportConfig) donde ya se tiene ese dato (ej.
   * EditAthleteDialog.tsx). Este campo es el default por disciplina/pais.
   */
  terminology: SportTerminology;
}

export interface AcademySpecializationContext {
  key: SpecializationKey;
  countryCode: SupportedCountryCode;
  countryName: string;
  discipline: AcademyDiscipline;
  disciplineVariant: DisciplineVariant;
  locale: string;
  timezone: string;
  federationConfigVersion: string;
  status: AcademySpecializationStatus;
  academyType: string | null;
  labels: SpecializedLabels;
  evaluation: SpecializedEvaluationTemplate;
  categories: SpecializedCategoryRules;
  terminology: SportTerminology;
}

const REGISTRY: Record<string, SpecializationRegistryEntry> = Object.fromEntries(
  SPORT_CONFIG_SEEDS.map((config) => [
    config.code,
    {
      key: {
        countryCode: config.country.code,
        discipline: config.discipline.code,
        disciplineVariant: config.defaultDisciplineVariant,
      },
      locale: config.country.locale,
      federationConfigVersion: config.configVersion,
      labels: config.labels,
      evaluation: config.evaluation,
      categories: config.categories,
      terminology: config.terminology,
    },
  ])
);

const DEFAULT_ENTRY: SpecializationRegistryEntry = {
  key: { countryCode: "ES", discipline: "general", disciplineVariant: "general" },
  locale: "es-ES",
  federationConfigVersion: "artistic-rhythmic-mixed-v1",
  terminology: BASE_TERMINOLOGY,
  labels: {
    disciplineName: "Gimnasia artística y rítmica",
    athleteSingular: "Gimnasta",
    athletesPlural: "Gimnastas",
    groupLabel: "Grupo",
    classLabel: "Entrenamiento",
    sessionLabel: "Sesión",
    levelLabel: "Nivel técnico",
    coachLabel: "Entrenador",
    dashboardHeadline: "Panel de control de la academia",
    familyHeadline: "Seguimiento familiar",
  },
  evaluation: {
    apparatus: [
      { code: "fx", label: "Suelo" },
      { code: "vt", label: "Salto" },
      { code: "bb", label: "Viga" },
      { code: "ribbon", label: "Cinta" },
      { code: "hoop", label: "Aro" },
    ],
    assessmentTypes: SPORT_CONFIG_SEEDS[0]?.evaluation.assessmentTypes ?? [],
  },
  categories: {
    levelOptions: [],
    levelPlaceholder: "Ej. Grupo base, competición regional",
  },
};

// Derivado de countryRegions.ts (fuente unica de los ~20 paises hispanohablantes
// que el resto del producto ya soporta en selects de pais/region) en vez de
// mantener una tercera lista paralela solo-ES/MX/AR. Antes de esta unificacion,
// getCountryNameFromCode("DO") devolvia literalmente "DO" para cualquier pais
// fuera de esos 3, aunque countryRegions.ts ya listaba Republica Dominicana.
const COUNTRY_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  COUNTRY_REGION_OPTIONS.map((country) => [country.value.toUpperCase(), country.label])
);

function stripDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const COUNTRY_CODE_BY_NAME: Record<string, string> = Object.fromEntries(
  COUNTRY_REGION_OPTIONS.flatMap((country) => {
    const code = country.value.toUpperCase();
    const nameLower = country.label.toLowerCase();
    const nameNoAccents = stripDiacritics(country.label);
    // Ambas variantes (con y sin acentos) para tolerar texto libre de formularios
    // legacy o datos importados que no siempre traen tildes (ej. "espana"/"mexico").
    return nameNoAccents === nameLower
      ? [[nameLower, code]]
      : [[nameLower, code], [nameNoAccents, code]];
  })
);

export function normalizeCountryCode(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length === 2) return normalized.toUpperCase();
  return COUNTRY_CODE_BY_NAME[normalized.toLowerCase()] ?? normalized.toUpperCase();
}

export function getCountryNameFromCode(countryCode?: string | null): string {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return "País no definido";
  return COUNTRY_NAME_BY_CODE[normalized] ?? normalized;
}

export function inferDisciplineVariantFromAcademyType(academyType?: string | null): DisciplineVariant {
  switch (academyType) {
    case "artistica":
      return "artistic_female";
    case "ritmica":
      return "rhythmic";
    case "general":
      return "general";
    default:
      return "general";
  }
}

export function inferDisciplineFromVariant(variant?: string | null): AcademyDiscipline {
  switch (variant) {
    case "artistic_female":
    case "artistic_male":
      return "artistic";
    case "rhythmic":
      return "rhythmic";
    default:
      return "general";
  }
}

export function mapDisciplineVariantToAcademyType(variant?: string | null): string {
  switch (variant) {
    case "artistic_female":
    case "artistic_male":
      return "artistica";
    case "rhythmic":
      return "ritmica";
    default:
      return "general";
  }
}

export function buildSpecializationLookupKey(countryCode?: string | null, disciplineVariant?: string | null): string | null {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  if (!normalizedCountryCode || !disciplineVariant) return null;
  return `${normalizedCountryCode}:${disciplineVariant}`;
}

export function getSpecializationRegistryEntry(key: SpecializationKey): SpecializationRegistryEntry | null {
  const lookupKey = buildSpecializationLookupKey(key.countryCode, key.disciplineVariant ?? null);
  if (!lookupKey) return null;
  const configured = getSportConfigSeedByVariant(key.countryCode, key.disciplineVariant ?? null);
  if (configured) {
    return REGISTRY[configured.code] ?? null;
  }
  return REGISTRY[lookupKey] ?? null;
}

export function resolveAcademySpecialization(academy: {
  academyType?: string | null;
  country?: string | null;
  countryCode?: string | null;
  discipline?: string | null;
  disciplineVariant?: string | null;
  federationConfigVersion?: string | null;
  specializationStatus?: string | null;
}): AcademySpecializationContext {
  const countryCode = normalizeCountryCode(academy.countryCode ?? academy.country) ?? "ES";
  const disciplineVariant =
    (academy.disciplineVariant as DisciplineVariant | null | undefined) ??
    inferDisciplineVariantFromAcademyType(academy.academyType);
  const discipline =
    (academy.discipline as AcademyDiscipline | null | undefined) ??
    inferDisciplineFromVariant(disciplineVariant);
  const registryEntry =
    getSpecializationRegistryEntry({ countryCode, discipline, disciplineVariant }) ?? DEFAULT_ENTRY;
  const timezone = getTimezoneForCountry(countryCode);
  const status = (academy.specializationStatus as AcademySpecializationStatus | null | undefined) ??
    (academy.disciplineVariant || academy.countryCode ? "configured" : "inferred");

  return {
    key: { countryCode, discipline, disciplineVariant },
    countryCode,
    countryName: getCountryNameFromCode(countryCode),
    discipline,
    disciplineVariant,
    locale: registryEntry.locale,
    timezone,
    federationConfigVersion: academy.federationConfigVersion ?? registryEntry.federationConfigVersion,
    status,
    academyType: academy.academyType ?? mapDisciplineVariantToAcademyType(disciplineVariant),
    labels: registryEntry.labels,
    evaluation: registryEntry.evaluation,
    categories: registryEntry.categories,
    terminology: registryEntry.terminology,
  };
}

export function getSpecializedLabels(context: AcademySpecializationContext): SpecializedLabels {
  return context.labels;
}

export function getSpecializedCategoryRules(context: AcademySpecializationContext): SpecializedCategoryRules {
  return context.categories;
}

export function getSpecializedEvaluationTemplate(context: AcademySpecializationContext): SpecializedEvaluationTemplate {
  return context.evaluation;
}

export function getSpecializedEventTypes(context: AcademySpecializationContext): SpecializedEventTypeOption[] {
  switch (context.disciplineVariant) {
    case "artistic_female":
    case "artistic_male":
      return [
        { value: "competitions", label: "Competición" },
        { value: "evaluations", label: "Control técnico" },
        { value: "clinics", label: "Stage técnico" },
        { value: "workshops", label: "Concentración" },
        { value: "courses", label: "Curso federativo" },
        { value: "other", label: "Otro" },
      ];
    case "rhythmic":
      return [
        { value: "competitions", label: "Competición" },
        { value: "evaluations", label: "Control de conjunto" },
        { value: "clinics", label: "Stage coreográfico" },
        { value: "workshops", label: "Exhibición" },
        { value: "courses", label: "Jornada técnica" },
        { value: "other", label: "Otro" },
      ];
    default:
      return [
        { value: "competitions", label: "Competición" },
        { value: "courses", label: "Curso" },
        { value: "camps", label: "Campamento" },
        { value: "workshops", label: "Taller" },
        { value: "clinics", label: "Clínica" },
        { value: "evaluations", label: "Evaluación" },
        { value: "other", label: "Otro" },
      ];
  }
}

/**
 * Pluraliza solo la primera palabra de una etiqueta en espanol ("Grupo de
 * entrenamiento" -> "Grupos de entrenamiento", no "Grupo de entrenamientos").
 * Regla regular: +s si termina en vocal, +es si termina en consonante -
 * cubre todos los valores reales de SpecializedLabels hoy (Grupo,
 * Entrenamiento, Entrenador, Entrenadora, Gimnasta, Deportista).
 */
export function pluralizeFirstWord(label: string): string {
  const [firstWord, ...rest] = label.split(" ");
  if (!firstWord) return label;
  const lastChar = firstWord.at(-1)?.toLowerCase() ?? "";
  const isVowel = "aeiouáéíóú".includes(lastChar);
  const pluralFirstWord = `${firstWord}${isVowel ? "s" : "es"}`;
  return [pluralFirstWord, ...rest].join(" ");
}

export function getSpecializedNavigationLabel(
  context: AcademySpecializationContext,
  key: string,
  fallbackLabel: string
): string {
  switch (key) {
    case "athletes":
      return context.labels.athletesPlural;
    case "classes":
      return pluralizeFirstWord(context.labels.classLabel);
    case "coaches":
      return pluralizeFirstWord(context.labels.coachLabel);
    case "groups":
      return pluralizeFirstWord(context.labels.groupLabel);
    // El resto de claves de navegacion (events, assessments, messages,
    // notifications, announcements, reports, billing, settings, dashboard,
    // my-dashboard) son conceptos de producto genericos sin equivalente en
    // SpecializedLabels - "Eventos" ademas mezcla competiciones y actividad
    // no competitiva a proposito (ver EventCard/CompetitionResultsPanel), no
    // renombrar a un termino especifico de competicion. No es una laguna:
    // no tienen traduccion especifica por disciplina que aplicar.
    default:
      return fallbackLabel;
  }
}
