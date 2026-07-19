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
  /**
   * true solo en los seeds de `country.code === "GENERIC"`. Señala que esta
   * configuración no representa ninguna federación real: es el fallback
   * explícito para países sin catálogo propio todavía (ver getSportConfigSeedByVariant).
   * Nunca marcar esto en un seed con datos de una federación real.
   */
  isGenericFallback?: boolean;
}

const DEFAULT_ASSESSMENT_TYPES = [
  { value: "technical", label: "Técnica" },
  { value: "artistic", label: "Artística" },
  { value: "execution", label: "Ejecución" },
  { value: "coach_feedback", label: "Feedback entrenador" },
  { value: "competition", label: "Competición" },
  { value: "practice", label: "Entrenamiento" },
] as const;

// Fuente: RFEG, "Programa Técnico 2026" GAF (PROGRAMA-TECNICO_GAF_2026.pdf,
// aprobado JD 26 septiembre 2025). Confirmado por lectura directa del PDF
// oficial 2026-07-12 - ya NO es estimacion de fuente secundaria.
// Via Olimpica: 10 niveles ligados a la edad (el orden Senior VO8 antes que
// Junior VO9 es tal cual aparece en el documento oficial, no es un error).
const GAF_AGE_CATEGORIES = [
  { code: "pre_benjamin", name: "Pre-Benjamín", minAge: undefined, maxAge: 8 },
  { code: "benjamin", name: "Benjamín", minAge: undefined, maxAge: 9 },
  { code: "pre_alevin", name: "Pre-Alevín", minAge: undefined, maxAge: 10 },
  { code: "alevin", name: "Alevín", minAge: undefined, maxAge: 11 },
  { code: "infantil", name: "Infantil", minAge: undefined, maxAge: 12 },
  { code: "pre_juvenil", name: "Pre-Juvenil", minAge: undefined, maxAge: 13 },
  { code: "juvenil", name: "Juvenil", minAge: 13, maxAge: 14 },
  { code: "senior", name: "Sénior", minAge: 15, maxAge: 99 },
  { code: "junior", name: "Júnior", minAge: 14, maxAge: 15 },
  { code: "senior_elite", name: "Sénior Élite", minAge: 16, maxAge: 99 },
];

const GAF_ARTISTIC_PROGRAMS = [
  { code: "base", name: "Base" },
  { code: "via_olimpica", name: "Vía Olímpica" },
];

// Base: 10 niveles de dificultad ascendente, independientes de la edad
// ("cada gimnasta puede participar en virtud del nivel en el que se sienta
// segura"). Via Olimpica: 10 niveles ligados a la edad (ver GAF_AGE_CATEGORIES).
const GAF_ARTISTIC_LEVELS = [
  { code: "base_1", name: "Base 1", programCode: "base" },
  { code: "base_2", name: "Base 2", programCode: "base" },
  { code: "base_3", name: "Base 3", programCode: "base" },
  { code: "base_4", name: "Base 4", programCode: "base" },
  { code: "base_5", name: "Base 5", programCode: "base" },
  { code: "base_6", name: "Base 6", programCode: "base" },
  { code: "base_7", name: "Base 7", programCode: "base" },
  { code: "base_8", name: "Base 8", programCode: "base" },
  { code: "base_9", name: "Base 9", programCode: "base" },
  { code: "base_10", name: "Base 10", programCode: "base" },
  { code: "vo1", name: "VO1 - Pre-Benjamín", programCode: "via_olimpica" },
  { code: "vo2", name: "VO2 - Benjamín", programCode: "via_olimpica" },
  { code: "vo3", name: "VO3 - Pre-Alevín", programCode: "via_olimpica" },
  { code: "vo4", name: "VO4 - Alevín", programCode: "via_olimpica" },
  { code: "vo5", name: "VO5 - Infantil", programCode: "via_olimpica" },
  { code: "vo6", name: "VO6 - Pre-Juvenil", programCode: "via_olimpica" },
  { code: "vo7", name: "VO7 - Juvenil", programCode: "via_olimpica" },
  { code: "vo8", name: "VO8 - Sénior", programCode: "via_olimpica" },
  { code: "vo9", name: "VO9 - Júnior", programCode: "via_olimpica" },
  { code: "vo10", name: "VO10 - Sénior Élite", programCode: "via_olimpica" },
];

// Fuente: RFEG, "Programa Técnico Niveles 2026" GAM
// (PROGRAMA-TECNICO-NIVELES_GAM_2026.pdf) + "Normativa Técnica General 2026"
// GAM (NORMATIVA-TECNICA-GENERAL_GAM_2026.pdf), ambos aprobados JD 26
// septiembre 2025. Confirmado 2026-07-12 (documento completo, ya no falta la
// Vía Olímpica). GAM tiene 5 niveles Base y 8 categorías de Vía Olímpica -
// estructura distinta a GAF (que tiene 10+10) en ambos programas; nunca
// compartir estas listas entre GAF y GAM.
const GAM_AGE_CATEGORIES = [
  { code: "benjamin", name: "Benjamín", minAge: 7, maxAge: 9 },
  { code: "alevin", name: "Alevín", minAge: undefined, maxAge: 11 },
  { code: "infantil", name: "Infantil", minAge: undefined, maxAge: 13 },
  { code: "cadete", name: "Cadete", minAge: undefined, maxAge: 15 },
  { code: "juvenil", name: "Juvenil", minAge: undefined, maxAge: 17 },
  { code: "senior", name: "Sénior", minAge: 16, maxAge: 99 },
  { code: "junior", name: "Júnior", minAge: 15, maxAge: 18 },
  { code: "senior_elite", name: "Sénior Élite", minAge: 18, maxAge: 99 },
];

const GAM_ARTISTIC_PROGRAMS = [
  { code: "base", name: "Base" },
  { code: "via_olimpica", name: "Vía Olímpica" },
];

const GAM_ARTISTIC_LEVELS = [
  { code: "base_1", name: "Base 1", programCode: "base" },
  { code: "base_2", name: "Base 2", programCode: "base" },
  { code: "base_3", name: "Base 3", programCode: "base" },
  { code: "base_4", name: "Base 4", programCode: "base" },
  { code: "base_5", name: "Base 5", programCode: "base" },
  { code: "benjamin", name: "Benjamín", programCode: "via_olimpica" },
  { code: "alevin", name: "Alevín", programCode: "via_olimpica" },
  { code: "infantil", name: "Infantil", programCode: "via_olimpica" },
  { code: "cadete", name: "Cadete", programCode: "via_olimpica" },
  { code: "juvenil", name: "Juvenil", programCode: "via_olimpica" },
  { code: "senior", name: "Sénior", programCode: "via_olimpica" },
  { code: "junior", name: "Júnior", programCode: "via_olimpica" },
  { code: "senior_elite", name: "Sénior Élite", programCode: "via_olimpica" },
];

// Fuente: RFEG, "Normativa Técnica 2026" GR (NORMATIVA-TECNICA-GR-2026.pdf,
// aprobado JD 26 septiembre 2025). Confirmado 2026-07-12. Categorias del
// Campeonato de España Individual y Autonomias. OJO: cada categoria compite
// con un subconjunto distinto de aparatos (ej. Benjamin solo Manos Libres +
// Cuerda; Senior es Aro + Pelota + Cinta) - esa asignacion aparato-por-
// categoria todavia no esta modelada en el schema (apparatus es una lista
// plana por sportLocaleConfig, no por categoria/nivel). Documentado como
// simplificacion conocida, no corregir aqui sin evaluar cambio de schema.
const GR_AGE_CATEGORIES = [
  { code: "benjamin", name: "Benjamín", minAge: undefined, maxAge: undefined },
  { code: "alevin", name: "Alevín", minAge: undefined, maxAge: undefined },
  { code: "infantil", name: "Infantil", minAge: undefined, maxAge: undefined },
  { code: "junior", name: "Júnior", minAge: undefined, maxAge: undefined },
  { code: "senior", name: "Sénior", minAge: undefined, maxAge: undefined },
  { code: "primera_categoria", name: "1ª Categoría", minAge: undefined, maxAge: undefined },
  { code: "junior_honor", name: "Júnior Honor", minAge: undefined, maxAge: undefined },
  { code: "senior_honor", name: "Sénior Honor", minAge: undefined, maxAge: undefined },
  { code: "master", name: "Máster", minAge: undefined, maxAge: undefined },
];

const ES_COMPETITION_TYPES = [
  { code: "control_tecnico", name: "Control técnico" },
  { code: "campeonato_autonomico", name: "Campeonato autonómico" },
  { code: "copa_espana", name: "Copa de España" },
  { code: "campeonato_espana", name: "Campeonato de España" },
  { code: "liga_iberdrola", name: "Liga Iberdrola" },
  { code: "internacional", name: "Internacional" },
];

export const BASE_TERMINOLOGY = {
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
    configVersion: "rfeg-2026-v2",
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
      levelOptions: GAF_AGE_CATEGORIES.map((category) => category.name),
      levelPlaceholder: "Ej. Alevín VO4, Base 6",
    },
    programs: GAF_ARTISTIC_PROGRAMS,
    levels: GAF_ARTISTIC_LEVELS,
    ageCategories: GAF_AGE_CATEGORIES,
    competitionTypes: ES_COMPETITION_TYPES,
  },
  {
    code: "ES:artistic_male",
    country: { code: "ES", name: "España", locale: "es-ES" },
    discipline: { code: "artistic", name: "Gimnasia Artística" },
    branch: { code: "male", name: "Masculina" },
    name: "España - Gimnasia Artística Masculina",
    federation: "RFEG",
    configVersion: "rfeg-2026-v2",
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
      levelOptions: GAM_AGE_CATEGORIES.map((category) => category.name),
      levelPlaceholder: "Ej. Base 3",
    },
    programs: GAM_ARTISTIC_PROGRAMS,
    levels: GAM_ARTISTIC_LEVELS,
    ageCategories: GAM_AGE_CATEGORIES,
    competitionTypes: ES_COMPETITION_TYPES,
  },
  {
    code: "ES:rhythmic",
    country: { code: "ES", name: "España", locale: "es-ES" },
    discipline: { code: "rhythmic", name: "Gimnasia Rítmica" },
    branch: { code: "individual_group", name: "Individual / Conjunto" },
    name: "España - Gimnasia Rítmica",
    federation: "RFEG",
    configVersion: "rfeg-2026-v2",
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
      levelOptions: GR_AGE_CATEGORIES.map((category) => category.name),
      levelPlaceholder: "Ej. Alevín, 1ª Categoría",
    },
    // NOTA: el programa/niveles de Base de GR (Base 1..N) NO esta confirmado
    // contra fuente primaria todavia - "Listado ascensos Nivel Base" PDF no
    // leido. Se deja el listado anterior (Base 1..4 + FIG) sin tocar en vez
    // de inventar un numero de niveles. Solo se corrigieron ageCategories
    // (categorias individuales del Campeonato de España, si confirmadas).
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
    ageCategories: GR_AGE_CATEGORIES,
    competitionTypes: ES_COMPETITION_TYPES,
  },
  ...buildGenericFallbackSeeds(),
];

/**
 * Configuraciones "genéricas" para academias cuyo país todavía no tiene
 * catálogo federativo propio en SPORT_CONFIG_SEEDS. Deliberadamente NO
 * mencionan ninguna federación real (federation queda vacío) y usan
 * únicamente terminología/aparatos estándar FIG (internacionales, no
 * específicos de ningún país) para no hacerle creer a un dueño de academia
 * que está viendo datos oficiales de su federación local cuando no lo son.
 * Ver getSportConfigSeedByVariant: se usan solo cuando no hay match exacto
 * de país+variante.
 */
function buildGenericFallbackSeeds(): SportConfigSeed[] {
  const genericAgeCategories = [
    { code: "infantil", name: "Infantil", minAge: 6, maxAge: 11 },
    { code: "juvenil", name: "Juvenil", minAge: 12, maxAge: 15 },
    { code: "absoluta", name: "Absoluta", minAge: 16, maxAge: 99 },
  ];
  const genericPrograms = [
    { code: "recreativo", name: "Recreativo" },
    { code: "competitivo", name: "Competitivo" },
  ];
  const genericCompetitionTypes = [
    { code: "interno", name: "Torneo interno" },
    { code: "regional", name: "Competición regional" },
    { code: "nacional", name: "Competición nacional" },
  ];
  const genericLevels = [
    { code: "nivel_1", name: "Nivel 1", programCode: "recreativo" },
    { code: "nivel_2", name: "Nivel 2", programCode: "recreativo" },
    { code: "nivel_3", name: "Nivel 3", programCode: "competitivo" },
    { code: "nivel_4", name: "Nivel 4", programCode: "competitivo" },
    { code: "nivel_5", name: "Nivel 5", programCode: "competitivo" },
  ];

  const base = {
    country: { code: "GENERIC", name: "Genérico (sin país configurado)", locale: "es-ES" },
    federation: "",
    configVersion: "generic-fallback-v1",
    isGenericFallback: true as const,
    categories: {
      levelOptions: genericAgeCategories.map((category) => category.name),
      levelPlaceholder: "Ej. Infantil, Nivel 2",
    },
    programs: genericPrograms,
    levels: genericLevels,
    ageCategories: genericAgeCategories,
    competitionTypes: genericCompetitionTypes,
  };

  const seeds: SportConfigSeed[] = [
    {
      ...base,
      code: "GENERIC:artistic_female",
      discipline: { code: "artistic", name: "Gimnasia Artística" },
      branch: { code: "female", name: "Femenina" },
      name: "Genérico - Gimnasia Artística Femenina",
      defaultAcademyType: "artistica",
      defaultDisciplineVariant: "artistic_female",
      labels: {
        disciplineName: "Gimnasia artística femenina",
        athleteSingular: "Gimnasta",
        athletesPlural: "Gimnastas",
        groupLabel: "Grupo",
        classLabel: "Entrenamiento",
        sessionLabel: "Sesión",
        levelLabel: "Nivel",
        coachLabel: "Entrenadora",
        dashboardHeadline: "Panel de la academia",
        familyHeadline: "Seguimiento deportivo familiar",
      },
      terminology: { ...BASE_TERMINOLOGY, coach: "Entrenadora" },
      evaluation: {
        apparatus: [
          { code: "vt", label: "Salto" },
          { code: "ub", label: "Paralelas asimétricas" },
          { code: "bb", label: "Barra de equilibrio" },
          { code: "fx", label: "Suelo" },
        ],
        assessmentTypes: [...DEFAULT_ASSESSMENT_TYPES],
      },
    },
    {
      ...base,
      code: "GENERIC:artistic_male",
      discipline: { code: "artistic", name: "Gimnasia Artística" },
      branch: { code: "male", name: "Masculina" },
      name: "Genérico - Gimnasia Artística Masculina",
      defaultAcademyType: "artistica",
      defaultDisciplineVariant: "artistic_male",
      labels: {
        disciplineName: "Gimnasia artística masculina",
        athleteSingular: "Gimnasta",
        athletesPlural: "Gimnastas",
        groupLabel: "Grupo",
        classLabel: "Entrenamiento",
        sessionLabel: "Sesión",
        levelLabel: "Nivel",
        coachLabel: "Entrenador",
        dashboardHeadline: "Panel de la academia",
        familyHeadline: "Seguimiento deportivo familiar",
      },
      terminology: { ...BASE_TERMINOLOGY, coach: "Entrenador" },
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
    },
    {
      ...base,
      code: "GENERIC:rhythmic",
      discipline: { code: "rhythmic", name: "Gimnasia Rítmica" },
      branch: { code: "individual_group", name: "Individual / Conjunto" },
      name: "Genérico - Gimnasia Rítmica",
      defaultAcademyType: "ritmica",
      defaultDisciplineVariant: "rhythmic",
      labels: {
        disciplineName: "Gimnasia rítmica",
        athleteSingular: "Gimnasta",
        athletesPlural: "Gimnastas",
        groupLabel: "Grupo de entrenamiento",
        classLabel: "Entrenamiento",
        sessionLabel: "Pase",
        levelLabel: "Nivel",
        coachLabel: "Entrenadora",
        dashboardHeadline: "Panel de la academia",
        familyHeadline: "Seguimiento deportivo familiar",
      },
      terminology: {
        ...BASE_TERMINOLOGY,
        group: "Grupo de entrenamiento",
        groups: "Grupos de entrenamiento",
        team: "Conjunto",
        coach: "Entrenadora",
      },
      evaluation: {
        apparatus: [
          { code: "rope", label: "Cuerda" },
          { code: "hoop", label: "Aro" },
          { code: "ball", label: "Pelota" },
          { code: "clubs", label: "Mazas" },
          { code: "ribbon", label: "Cinta" },
        ],
        assessmentTypes: [...DEFAULT_ASSESSMENT_TYPES],
      },
    },
    {
      ...base,
      code: "GENERIC:general",
      discipline: { code: "general", name: "General" },
      branch: { code: "general", name: "General" },
      name: "Genérico - General",
      defaultAcademyType: "general",
      defaultDisciplineVariant: "general",
      labels: {
        disciplineName: "Deporte",
        athleteSingular: "Deportista",
        athletesPlural: "Deportistas",
        groupLabel: "Grupo",
        classLabel: "Entrenamiento",
        sessionLabel: "Sesión",
        levelLabel: "Nivel",
        coachLabel: "Entrenador/a",
        dashboardHeadline: "Panel de la academia",
        familyHeadline: "Seguimiento familiar",
      },
      terminology: { ...BASE_TERMINOLOGY, athlete: "Deportista", athletes: "Deportistas" },
      evaluation: {
        apparatus: [],
        assessmentTypes: [...DEFAULT_ASSESSMENT_TYPES],
      },
    },
  ];

  return seeds;
}

export function getSportConfigSeedByCode(code?: string | null) {
  return SPORT_CONFIG_SEEDS.find((config) => config.code === code) ?? null;
}

export function getSportConfigSeedByVariant(countryCode?: string | null, variant?: string | null) {
  const normalizedCountryCode = countryCode?.trim().toUpperCase() || "ES";
  const exactMatch = SPORT_CONFIG_SEEDS.find(
    (config) =>
      config.country.code === normalizedCountryCode &&
      config.defaultDisciplineVariant === variant
  );
  if (exactMatch) return exactMatch;

  // País sin catálogo propio todavía: fallback genérico explícito en vez de
  // null silencioso (ver isGenericFallback). No caer nunca en el seed de
  // España por defecto para un país que no matcheó - eso sería peor: el
  // dueño vería terminología RFEG sin saber que no es la de su país.
  return (
    SPORT_CONFIG_SEEDS.find(
      (config) => config.country.code === "GENERIC" && config.defaultDisciplineVariant === variant
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
