import type {
  SpecializedCategoryRules,
  SpecializedEvaluationTemplate,
  SpecializedLabels,
} from "@/lib/specialization/registry";

export const TERMINOLOGY_KEYS = [
  "athlete",
  "athletes",
  "group",
  "groups",
  "coach",
  "parent",
  "apparatus",
  "level",
  "category",
  "routine",
  "competition",
  "payment",
  "attendance",
  "license",
  "team",
  "branch",
] as const;

export type TerminologyKey = (typeof TERMINOLOGY_KEYS)[number];
export type SportTerminology = Record<TerminologyKey, string>;

export interface SportConfigSeed {
  code: string;
  country: { code: string; name: string; locale: string };
  discipline: { code: "artistic" | "rhythmic" | "general"; name: string };
  branch: { code: "female" | "male" | "individual_group" | "general"; name: string };
  name: string;
  federation: string;
  configVersion: string;
  defaultAcademyType: "artistica" | "ritmica" | "general";
  defaultDisciplineVariant: "artistic_female" | "artistic_male" | "rhythmic" | "general";
  labels: SpecializedLabels;
  terminology: SportTerminology;
  evaluation: SpecializedEvaluationTemplate;
  categories: SpecializedCategoryRules;
  programs: Array<{ code: string; name: string; description?: string }>;
  levels: Array<{ code: string; name: string; programCode?: string }>;
  ageCategories: Array<{ code: string; name: string; minAge?: number; maxAge?: number }>;
  competitionTypes: Array<{ code: string; name: string }>;
}

const DEFAULT_ASSESSMENT_TYPES = [
  { value: "technical", label: "Técnica" },
  { value: "artistic", label: "Artística" },
  { value: "execution", label: "Ejecución" },
  { value: "coach_feedback", label: "Feedback entrenador" },
  { value: "competition", label: "Competición" },
  { value: "practice", label: "Entrenamiento" },
] as const;

const ES_AGE_CATEGORIES = [
  { code: "pre_iniciacion", name: "Pre-iniciación", minAge: 5, maxAge: 7 },
  { code: "iniciacion", name: "Iniciación", minAge: 8, maxAge: 9 },
  { code: "alevin", name: "Alevín", minAge: 10, maxAge: 11 },
  { code: "infantil", name: "Infantil", minAge: 12, maxAge: 13 },
  { code: "junior", name: "Junior", minAge: 14, maxAge: 15 },
  { code: "senior", name: "Senior", minAge: 16, maxAge: 17 },
  { code: "absoluta", name: "Absoluta", minAge: 18, maxAge: 99 },
];

const ES_ARTISTIC_PROGRAMS = [
  { code: "recreativo", name: "Recreativo" },
  { code: "base", name: "Base" },
  { code: "via_olimpica", name: "Vía Olímpica" },
];

const ES_ARTISTIC_LEVELS = [
  { code: "pre_iniciacion", name: "Pre-iniciación", programCode: "recreativo" },
  { code: "nivel_a", name: "Nivel A", programCode: "base" },
  { code: "nivel_b", name: "Nivel B", programCode: "base" },
  { code: "nivel_c", name: "Nivel C", programCode: "base" },
  { code: "nivel_d", name: "Nivel D", programCode: "base" },
  { code: "nivel_1", name: "Nivel 1", programCode: "via_olimpica" },
  { code: "nivel_2", name: "Nivel 2", programCode: "via_olimpica" },
  { code: "nivel_3", name: "Nivel 3", programCode: "via_olimpica" },
  { code: "fig", name: "FIG / Elite", programCode: "via_olimpica" },
];

const ES_COMPETITION_TYPES = [
  { code: "control_tecnico", name: "Control técnico" },
  { code: "campeonato_autonomico", name: "Campeonato autonómico" },
  { code: "copa_espana", name: "Copa de España" },
  { code: "campeonato_espana", name: "Campeonato de España" },
  { code: "internacional", name: "Internacional" },
];

const BASE_TERMINOLOGY = {
  athlete: "Gimnasta",
  athletes: "Gimnastas",
  group: "Grupo",
  groups: "Grupos",
  coach: "Entrenador/a",
  parent: "Familiar",
  apparatus: "Aparato",
  level: "Nivel",
  category: "Categoría",
  routine: "Ejercicio",
  competition: "Campeonato",
  payment: "Pago",
  attendance: "Asistencia",
  license: "Licencia federativa",
  team: "Equipo",
  branch: "Rama",
} satisfies SportTerminology;

export const SPORT_CONFIG_SEEDS: SportConfigSeed[] = [
  {
    code: "ES:artistic_female",
    country: { code: "ES", name: "España", locale: "es-ES" },
    discipline: { code: "artistic", name: "Gimnasia Artística" },
    branch: { code: "female", name: "Femenina" },
    name: "España - Gimnasia Artística Femenina",
    federation: "RFEG",
    configVersion: "rfeg-2026-v1",
    defaultAcademyType: "artistica",
    defaultDisciplineVariant: "artistic_female",
    labels: {
      disciplineName: "Gimnasia artística femenina",
      athleteSingular: "Gimnasta",
      athletesPlural: "Gimnastas",
      groupLabel: "Grupo",
      classLabel: "Entrenamiento",
      sessionLabel: "Sesión",
      levelLabel: "Nivel técnico",
      coachLabel: "Entrenadora",
      dashboardHeadline: "Panel técnico de la academia",
      familyHeadline: "Seguimiento deportivo familiar",
    },
    terminology: { ...BASE_TERMINOLOGY, coach: "Entrenadora", team: "Equipo" },
    evaluation: {
      apparatus: [
        { code: "vt", label: "Salto" },
        { code: "ub", label: "Paralelas asimétricas" },
        { code: "bb", label: "Barra de equilibrio" },
        { code: "fx", label: "Suelo" },
      ],
      assessmentTypes: [...DEFAULT_ASSESSMENT_TYPES],
    },
    categories: {
      levelOptions: ES_AGE_CATEGORIES.map((category) => category.name),
      levelPlaceholder: "Ej. Alevín, Nivel C, Base autonómica",
    },
    programs: ES_ARTISTIC_PROGRAMS,
    levels: ES_ARTISTIC_LEVELS,
    ageCategories: ES_AGE_CATEGORIES,
    competitionTypes: ES_COMPETITION_TYPES,
  },
  {
    code: "ES:artistic_male",
    country: { code: "ES", name: "España", locale: "es-ES" },
    discipline: { code: "artistic", name: "Gimnasia Artística" },
    branch: { code: "male", name: "Masculina" },
    name: "España - Gimnasia Artística Masculina",
    federation: "RFEG",
    configVersion: "rfeg-2026-v1",
    defaultAcademyType: "artistica",
    defaultDisciplineVariant: "artistic_male",
    labels: {
      disciplineName: "Gimnasia artística masculina",
      athleteSingular: "Gimnasta",
      athletesPlural: "Gimnastas",
      groupLabel: "Grupo",
      classLabel: "Entrenamiento",
      sessionLabel: "Sesión",
      levelLabel: "Nivel técnico",
      coachLabel: "Entrenador",
      dashboardHeadline: "Panel técnico de la academia",
      familyHeadline: "Seguimiento deportivo familiar",
    },
    terminology: { ...BASE_TERMINOLOGY, coach: "Entrenador", team: "Equipo" },
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
      levelOptions: ES_AGE_CATEGORIES.map((category) => category.name),
      levelPlaceholder: "Ej. Infantil, Nivel 2, Base nacional",
    },
    programs: ES_ARTISTIC_PROGRAMS,
    levels: ES_ARTISTIC_LEVELS,
    ageCategories: ES_AGE_CATEGORIES,
    competitionTypes: ES_COMPETITION_TYPES,
  },
  {
    code: "ES:rhythmic",
    country: { code: "ES", name: "España", locale: "es-ES" },
    discipline: { code: "rhythmic", name: "Gimnasia Rítmica" },
    branch: { code: "individual_group", name: "Individual / Conjunto" },
    name: "España - Gimnasia Rítmica",
    federation: "RFEG",
    configVersion: "rfeg-2026-v1",
    defaultAcademyType: "ritmica",
    defaultDisciplineVariant: "rhythmic",
    labels: {
      disciplineName: "Gimnasia rítmica",
      athleteSingular: "Gimnasta",
      athletesPlural: "Gimnastas",
      groupLabel: "Grupo de entrenamiento",
      classLabel: "Entrenamiento",
      sessionLabel: "Pase",
      levelLabel: "Categoría",
      coachLabel: "Entrenadora",
      dashboardHeadline: "Panel técnico de la academia",
      familyHeadline: "Seguimiento deportivo familiar",
    },
    terminology: {
      ...BASE_TERMINOLOGY,
      group: "Grupo de entrenamiento",
      groups: "Grupos de entrenamiento",
      team: "Conjunto",
      competition: "Campeonato / Torneo",
      coach: "Entrenadora",
    },
    evaluation: {
      apparatus: [
        { code: "free_hands", label: "Manos libres" },
        { code: "rope", label: "Cuerda" },
        { code: "hoop", label: "Aro" },
        { code: "ball", label: "Pelota" },
        { code: "clubs", label: "Mazas" },
        { code: "ribbon", label: "Cinta" },
      ],
      assessmentTypes: [...DEFAULT_ASSESSMENT_TYPES],
    },
    categories: {
      levelOptions: ES_AGE_CATEGORIES.map((category) => category.name),
      levelPlaceholder: "Ej. Alevín, Base, Copa autonómica",
    },
    programs: [
      { code: "recreativo", name: "Recreativo" },
      { code: "base", name: "Base" },
      { code: "absoluto", name: "Absoluto" },
      { code: "escolar", name: "Escolar" },
      { code: "conjuntos", name: "Conjuntos" },
      { code: "individual", name: "Individual" },
    ],
    levels: [
      { code: "pre_nivel", name: "Pre-nivel", programCode: "recreativo" },
      { code: "nivel_1", name: "Nivel 1", programCode: "base" },
      { code: "nivel_2", name: "Nivel 2", programCode: "base" },
      { code: "nivel_3", name: "Nivel 3", programCode: "base" },
      { code: "nivel_4", name: "Nivel 4", programCode: "base" },
      { code: "fig", name: "FIG / Elite", programCode: "absoluto" },
    ],
    ageCategories: ES_AGE_CATEGORIES,
    competitionTypes: ES_COMPETITION_TYPES,
  },
];

export function getSportConfigSeedByCode(code?: string | null) {
  return SPORT_CONFIG_SEEDS.find((config) => config.code === code) ?? null;
}

export function getSportConfigSeedByVariant(countryCode?: string | null, variant?: string | null) {
  const normalizedCountryCode = countryCode?.trim().toUpperCase() || "ES";
  return (
    SPORT_CONFIG_SEEDS.find(
      (config) =>
        config.country.code === normalizedCountryCode &&
        config.defaultDisciplineVariant === variant
    ) ?? null
  );
}

export function getSportConfigSeedsByCountry(countryCode?: string | null) {
  const normalizedCountryCode = countryCode?.trim().toUpperCase() || "ES";
  return SPORT_CONFIG_SEEDS.filter((config) => config.country.code === normalizedCountryCode);
}

export function filterSeedCodes<T extends { code: string }>(items: T[], requestedCodes?: string[] | null) {
  const allowedCodes = new Set(items.map((item) => item.code));
  const requested = Array.from(new Set(requestedCodes ?? []));
  const filtered = requested.filter((code) => allowedCodes.has(code));
  return filtered.length > 0 ? filtered : Array.from(allowedCodes);
}
