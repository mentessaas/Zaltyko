import { getTimezoneForCountry } from "@/lib/date-utils";

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

const DEFAULT_ASSESSMENT_TYPES = [
  { value: "technical", label: "Técnica" },
  { value: "artistic", label: "Artística" },
  { value: "execution", label: "Ejecución" },
  { value: "coach_feedback", label: "Feedback entrenador" },
  { value: "competition", label: "Competición" },
  { value: "practice", label: "Entrenamiento" },
] as const;

const REGISTRY: Record<string, SpecializationRegistryEntry> = {
  "ES:artistic_female": {
    key: { countryCode: "ES", discipline: "artistic", disciplineVariant: "artistic_female" },
    locale: "es-ES",
    federationConfigVersion: "rfeg-2026-v1",
    labels: {
      disciplineName: "Gimnasia artística femenina",
      athleteSingular: "Gimnasta",
      athletesPlural: "Gimnastas",
      groupLabel: "Equipo",
      classLabel: "Entrenamiento",
      sessionLabel: "Sesión",
      levelLabel: "Nivel técnico",
      coachLabel: "Entrenadora",
      dashboardHeadline: "Panel técnico de la academia",
      familyHeadline: "Seguimiento deportivo familiar",
    },
    evaluation: {
      apparatus: [
        { code: "vt", label: "Salto" },
        { code: "ub", label: "Barras asimétricas" },
        { code: "bb", label: "Viga" },
        { code: "fx", label: "Suelo" },
      ],
      assessmentTypes: [...DEFAULT_ASSESSMENT_TYPES],
    },
    categories: {
      levelOptions: ["Pre-iniciación", "Iniciación", "Alevín", "Infantil", "Junior", "Senior", "Absoluta"],
      levelPlaceholder: "Ej. Alevín, Nivel C, Base autonómica",
    },
  },
  "ES:artistic_male": {
    key: { countryCode: "ES", discipline: "artistic", disciplineVariant: "artistic_male" },
    locale: "es-ES",
    federationConfigVersion: "rfeg-2026-v1",
    labels: {
      disciplineName: "Gimnasia artística masculina",
      athleteSingular: "Gimnasta",
      athletesPlural: "Gimnastas",
      groupLabel: "Equipo",
      classLabel: "Entrenamiento",
      sessionLabel: "Sesión",
      levelLabel: "Nivel técnico",
      coachLabel: "Entrenador",
      dashboardHeadline: "Panel técnico de la academia",
      familyHeadline: "Seguimiento deportivo familiar",
    },
    evaluation: {
      apparatus: [
        { code: "fx", label: "Suelo" },
        { code: "ph", label: "Caballo con arcos" },
        { code: "sr", label: "Anillas" },
        { code: "vt", label: "Salto" },
        { code: "pb", label: "Paralelas" },
        { code: "hb", label: "Barra fija" },
      ],
      assessmentTypes: [...DEFAULT_ASSESSMENT_TYPES],
    },
    categories: {
      levelOptions: ["Pre-iniciación", "Iniciación", "Alevín", "Infantil", "Junior", "Senior", "Absoluta"],
      levelPlaceholder: "Ej. Infantil, Nivel 2, Base nacional",
    },
  },
  "ES:rhythmic": {
    key: { countryCode: "ES", discipline: "rhythmic", disciplineVariant: "rhythmic" },
    locale: "es-ES",
    federationConfigVersion: "rfeg-2026-v1",
    labels: {
      disciplineName: "Gimnasia rítmica",
      athleteSingular: "Gimnasta",
      athletesPlural: "Gimnastas",
      groupLabel: "Conjunto",
      classLabel: "Entrenamiento",
      sessionLabel: "Pase",
      levelLabel: "Categoría",
      coachLabel: "Entrenadora",
      dashboardHeadline: "Panel técnico de la academia",
      familyHeadline: "Seguimiento deportivo familiar",
    },
    evaluation: {
      apparatus: [
        { code: "rope", label: "Cuerda" },
        { code: "ball", label: "Pelota" },
        { code: "clubs", label: "Mazas" },
        { code: "hoop", label: "Aro" },
        { code: "ribbon", label: "Cinta" },
      ],
      assessmentTypes: [...DEFAULT_ASSESSMENT_TYPES],
    },
    categories: {
      levelOptions: ["Pre-iniciación", "Iniciación", "Alevín", "Infantil", "Junior", "Senior", "Absoluta"],
      levelPlaceholder: "Ej. Alevín, Base, Copa autonómica",
    },
  },
};

const DEFAULT_ENTRY: SpecializationRegistryEntry = {
  key: { countryCode: "ES", discipline: "rhythmic", disciplineVariant: "rhythmic" },
  locale: "es-ES",
  federationConfigVersion: "legacy-default-v1",
  labels: {
    disciplineName: "Academia deportiva",
    athleteSingular: "Atleta",
    athletesPlural: "Atletas",
    groupLabel: "Grupo",
    classLabel: "Clase",
    sessionLabel: "Sesión",
    levelLabel: "Nivel",
    coachLabel: "Entrenador",
    dashboardHeadline: "Panel de la academia",
    familyHeadline: "Seguimiento familiar",
  },
  evaluation: {
    apparatus: [{ code: "general", label: "General" }],
    assessmentTypes: [...DEFAULT_ASSESSMENT_TYPES],
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
    case "trampolin":
      return "trampoline";
    case "parkour":
      return "parkour";
    case "danza":
      return "dance";
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
    case "trampoline":
      return "trampoline";
    case "parkour":
      return "parkour";
    case "dance":
      return "dance";
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
    case "trampoline":
      return "trampolin";
    case "parkour":
      return "parkour";
    case "dance":
      return "danza";
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
