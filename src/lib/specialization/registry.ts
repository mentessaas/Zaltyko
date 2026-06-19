import { getTimezoneForCountry } from "@/lib/date-utils";
import { SPORT_CONFIG_SEEDS, getSportConfigSeedByVariant } from "@/lib/sport-config/catalog";

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
export type AcademySpecializationStatus = "configured" | "inferred" | "legacy" | "unknown";

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
    },
  ])
);

const DEFAULT_ENTRY: SpecializationRegistryEntry = {
  key: { countryCode: "ES", discipline: "general", disciplineVariant: "general" },
  locale: "es-ES",
  federationConfigVersion: "artistic-rhythmic-mixed-v1",
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

const COUNTRY_NAME_BY_CODE: Record<string, string> = {
  ES: "España",
  MX: "México",
  AR: "Argentina",
};

const COUNTRY_CODE_BY_NAME: Record<string, string> = {
  españa: "ES",
  espana: "ES",
  mexico: "MX",
  méxico: "MX",
  argentina: "AR",
};

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

export function getSpecializedNavigationLabel(
  context: AcademySpecializationContext,
  key: string,
  fallbackLabel: string
): string {
  switch (key) {
    case "athletes":
      return context.labels.athletesPlural;
    case "classes":
      return `${context.labels.classLabel}s`;
    default:
      return fallbackLabel;
  }
}
