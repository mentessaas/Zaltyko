import { z } from "zod";

/**
 * Niveles y progresión por aparato (brecha A6 del análisis de competencia).
 * Dominio puro: valores admitidos, textos visibles, permisos, validación de
 * órdenes y cálculos de progreso. Nada aquí toca la base de datos.
 * Producto: docs/producto/niveles-y-progresion.md.
 */

/* ------------------------------------------------------------------------ */
/* Bandera y disponibilidad                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Bandera de servidor, apagada por defecto. Con ella apagada, o sin el
 * candidato SQL aplicado, la función no existe: las páginas dan 404, las API
 * responden 503 con SKILL_LEVELS_UNAVAILABLE_REASON y /familia no muestra nada.
 */
export const SKILL_LEVELS_ENV_FLAG = "ZALTYKO_SKILL_LEVELS_ENABLED";

export function isSkillLevelsFlagOn(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return env[SKILL_LEVELS_ENV_FLAG] === "true";
}

/** Motivo del 503: el cliente solo muestra «no disponible» con este motivo. */
export const SKILL_LEVELS_UNAVAILABLE_REASON = "skill_levels_unavailable";

/* ------------------------------------------------------------------------ */
/* Disciplinas, aparatos y estados                                           */
/* ------------------------------------------------------------------------ */

/** Mismas claves que las disciplinas de la academia (artística y rítmica). */
export const SKILL_DISCIPLINES = ["artistic_female", "artistic_male", "rhythmic"] as const;
export type SkillDiscipline = (typeof SKILL_DISCIPLINES)[number];

export const skillDisciplineLabels: Record<SkillDiscipline, string> = {
  artistic_female: "Artística femenina (GAF)",
  artistic_male: "Artística masculina (GAM)",
  rhythmic: "Rítmica (GR)",
};

export const SKILL_APPARATUS = [
  "vault",
  "uneven_bars",
  "beam",
  "floor",
  "pommel_horse",
  "rings",
  "parallel_bars",
  "high_bar",
  "rope",
  "hoop",
  "ball",
  "clubs",
  "ribbon",
  "body",
] as const;
export type SkillApparatus = (typeof SKILL_APPARATUS)[number];

/** Aparatos de cada disciplina. Sin aparato (null) es «General». */
export const SKILL_APPARATUS_BY_DISCIPLINE = {
  artistic_female: ["vault", "uneven_bars", "beam", "floor"],
  artistic_male: ["floor", "pommel_horse", "rings", "vault", "parallel_bars", "high_bar"],
  rhythmic: ["body", "rope", "hoop", "ball", "clubs", "ribbon"],
} as const satisfies Record<SkillDiscipline, readonly SkillApparatus[]>;

export const skillApparatusLabels: Record<SkillApparatus, string> = {
  vault: "Salto",
  uneven_bars: "Paralelas asimétricas",
  beam: "Barra de equilibrio",
  floor: "Suelo",
  pommel_horse: "Caballo con arcos",
  rings: "Anillas",
  parallel_bars: "Paralelas",
  high_bar: "Barra fija",
  rope: "Cuerda",
  hoop: "Aro",
  ball: "Pelota",
  clubs: "Mazas",
  ribbon: "Cinta",
  body: "Sin aparato (cuerpo)",
};

export const GENERAL_APPARATUS_LABEL = "General";

export function apparatusLabel(apparatus: SkillApparatus | null | undefined): string {
  return apparatus ? skillApparatusLabels[apparatus] : GENERAL_APPARATUS_LABEL;
}

export function apparatusBelongsToDiscipline(
  discipline: SkillDiscipline,
  apparatus: SkillApparatus | null | undefined
): boolean {
  if (!apparatus) return true;
  return (SKILL_APPARATUS_BY_DISCIPLINE[discipline] as readonly string[]).includes(apparatus);
}

export const ELEMENT_STATUSES = ["not_started", "in_progress", "achieved"] as const;
export type ElementStatus = (typeof ELEMENT_STATUSES)[number];

export const elementStatusLabels: Record<ElementStatus, string> = {
  not_started: "No iniciado",
  in_progress: "En progreso",
  achieved: "Conseguido",
};

export const TEMPLATE_SOURCES = ["blank", "starter", "copy"] as const;
export type TemplateSource = (typeof TEMPLATE_SOURCES)[number];

export const TEMPLATE_NAME_MAX = 80;
export const LEVEL_NAME_MAX = 60;
export const ELEMENT_NAME_MAX = 100;
export const DESCRIPTION_MAX = 300;
export const MAX_LEVELS_PER_TEMPLATE = 20;
export const MAX_ELEMENTS_PER_LEVEL = 40;
export const MAX_ELEMENTS_PER_TEMPLATE = 300;
export const MAX_EVALUATION_ATHLETES = 60;
export const MAX_EVALUATION_ELEMENTS = 40;
export const MAX_EVALUATION_CELLS = 400;
export const MAX_ROSTER_ATHLETES = 80;

/** Aviso que acompaña a cualquier plantilla de ejemplo. */
export const STARTER_TEMPLATE_NOTICE =
  "Plantilla orientativa de Zaltyko. No reproduce el reglamento ni los programas de ninguna federación: adáptala a los niveles y elementos de tu academia antes de usarla.";

/* ------------------------------------------------------------------------ */
/* Permisos                                                                  */
/* ------------------------------------------------------------------------ */

export type SkillMemberRole = "owner" | "admin" | "manager" | "coach";

/** Roles que pueden usar la sección. Las familias solo leen en /familia. */
export const SKILL_ROLES = ["owner", "admin", "manager", "coach"] as const;

export function isManagementRole(role: SkillMemberRole): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

/** Crear, copiar, editar y archivar plantillas: dirección, administración y coordinación. */
export function canManageTemplates(role: SkillMemberRole): boolean {
  return isManagementRole(role);
}

/** Evaluar elementos y registrar el paso de nivel: todo el equipo técnico. */
export function canEvaluate(role: SkillMemberRole): boolean {
  return SKILL_ROLES.includes(role);
}

/* ------------------------------------------------------------------------ */
/* Validación                                                                */
/* ------------------------------------------------------------------------ */

const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f]/u;

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const calendarDateSchema = z
  .string()
  .refine(isCalendarDate, "Fecha no válida")
  .refine((value) => value >= "2000-01-01" && value <= "2100-12-31", "Fecha fuera de rango");

function singleLine(label: string, min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min, `${label}: mínimo ${min} caracteres`)
    .max(max, `${label}: máximo ${max} caracteres`)
    .refine((value) => !SINGLE_LINE_CONTROL.test(value), `${label}: sin saltos de línea`)
    .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "));
}

const templateNameSchema = singleLine("El nombre de la plantilla", 2, TEMPLATE_NAME_MAX);
const levelNameSchema = singleLine("El nombre del nivel", 1, LEVEL_NAME_MAX);
const elementNameSchema = singleLine("El nombre del elemento", 2, ELEMENT_NAME_MAX);

const descriptionSchema = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX, `La descripción admite ${DESCRIPTION_MAX} caracteres`)
  .refine((value) => !SINGLE_LINE_CONTROL.test(value), "La descripción no admite saltos de línea")
  .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "))
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

const scopeShape = {
  organizationId: z.guid(),
  locationId: z.guid(),
};

/** URLSearchParams.get() devuelve null cuando falta un parámetro. */
export const templatesQuerySchema = z
  .object({ ...scopeShape, includeArchived: z.enum(["true", "false"]).nullable().optional() })
  .strict();

export const templateQuerySchema = z.object({ ...scopeShape }).strict();

export const athleteSkillsQuerySchema = z
  .object({ ...scopeShape, templateId: z.guid().nullable().optional() })
  .strict();

export const rosterQuerySchema = z.object({ ...scopeShape, templateId: z.guid() }).strict();

export const sessionRosterQuerySchema = z
  .object({ ...scopeShape, templateId: z.guid() })
  .strict();

const apparatusSchema = z.enum(SKILL_APPARATUS).nullable().optional();

export const createTemplateCommandSchema = z.discriminatedUnion("source", [
  z
    .object({
      ...scopeShape,
      clientRequestId: z.guid(),
      source: z.literal("blank"),
      discipline: z.enum(SKILL_DISCIPLINES),
      name: templateNameSchema,
      description: descriptionSchema,
    })
    .strict(),
  z
    .object({
      ...scopeShape,
      clientRequestId: z.guid(),
      source: z.literal("starter"),
      starterKey: z.string().regex(/^[a-z][a-z0-9_]{1,47}$/),
      name: templateNameSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      ...scopeShape,
      clientRequestId: z.guid(),
      source: z.literal("copy"),
      templateId: z.guid(),
      name: templateNameSchema,
    })
    .strict(),
]);

const elementInputSchema = z
  .object({
    id: z.guid().nullable().optional(),
    name: elementNameSchema,
    apparatus: apparatusSchema,
    description: descriptionSchema,
    required: z.boolean().default(true),
  })
  .strict();

const levelInputSchema = z
  .object({
    id: z.guid().nullable().optional(),
    name: levelNameSchema,
    description: descriptionSchema,
    elements: z.array(elementInputSchema).max(MAX_ELEMENTS_PER_LEVEL),
  })
  .strict();

/**
 * Guarda la estructura completa de una plantilla. Lo que lleva `id` se
 * actualiza, lo nuevo se crea y lo que falta se archiva (no se borra: el
 * progreso ya registrado se conserva). El orden del array es el orden visible.
 */
export const saveTemplateCommandSchema = z
  .object({
    ...scopeShape,
    expectedRevision: z.number().int().positive(),
    name: templateNameSchema,
    description: descriptionSchema,
    archived: z.boolean().default(false),
    levels: z.array(levelInputSchema).min(1, "Añade al menos un nivel").max(MAX_LEVELS_PER_TEMPLATE),
  })
  .strict()
  .superRefine((value, context) => {
    const total = value.levels.reduce((sum, level) => sum + level.elements.length, 0);
    if (total > MAX_ELEMENTS_PER_TEMPLATE) {
      context.addIssue({
        code: "custom",
        path: ["levels"],
        message: `Una plantilla admite como mucho ${MAX_ELEMENTS_PER_TEMPLATE} elementos`,
      });
    }
    const seen = new Set<string>();
    for (const level of value.levels) {
      if (level.id) {
        if (seen.has(level.id)) {
          context.addIssue({ code: "custom", path: ["levels"], message: "Nivel repetido" });
        }
        seen.add(level.id);
      }
      for (const element of level.elements) {
        if (element.id) {
          if (seen.has(element.id)) {
            context.addIssue({ code: "custom", path: ["levels"], message: "Elemento repetido" });
          }
          seen.add(element.id);
        }
      }
    }
  });

export const evaluateSkillsCommandSchema = z
  .object({
    ...scopeShape,
    clientRequestId: z.guid(),
    templateId: z.guid(),
    athleteIds: z.array(z.guid()).min(1).max(MAX_EVALUATION_ATHLETES),
    elementIds: z.array(z.guid()).min(1).max(MAX_EVALUATION_ELEMENTS),
    status: z.enum(ELEMENT_STATUSES),
    achievedOn: calendarDateSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.athleteIds).size !== value.athleteIds.length) {
      context.addIssue({ code: "custom", path: ["athleteIds"], message: "Gimnasta repetida" });
    }
    if (new Set(value.elementIds).size !== value.elementIds.length) {
      context.addIssue({ code: "custom", path: ["elementIds"], message: "Elemento repetido" });
    }
    if (value.athleteIds.length * value.elementIds.length > MAX_EVALUATION_CELLS) {
      context.addIssue({
        code: "custom",
        path: ["elementIds"],
        message: `Como mucho ${MAX_EVALUATION_CELLS} marcas por envío`,
      });
    }
    if (value.status !== "achieved" && value.achievedOn) {
      context.addIssue({
        code: "custom",
        path: ["achievedOn"],
        message: "La fecha solo se indica al marcar «Conseguido»",
      });
    }
  });

export const passLevelCommandSchema = z
  .object({
    ...scopeShape,
    clientRequestId: z.guid(),
    templateId: z.guid(),
    levelId: z.guid(),
    passedOn: calendarDateSchema.nullable().optional(),
  })
  .strict();

export type TemplatesQuery = z.infer<typeof templatesQuerySchema>;
export type AthleteSkillsQuery = z.infer<typeof athleteSkillsQuerySchema>;
export type RosterQuery = z.infer<typeof rosterQuerySchema>;
export type CreateTemplateCommand = z.infer<typeof createTemplateCommandSchema>;
export type SaveTemplateCommand = z.infer<typeof saveTemplateCommandSchema>;
export type EvaluateSkillsCommand = z.infer<typeof evaluateSkillsCommandSchema>;
export type PassLevelCommand = z.infer<typeof passLevelCommandSchema>;

/* ------------------------------------------------------------------------ */
/* Vistas                                                                    */
/* ------------------------------------------------------------------------ */

export type TemplateElementView = {
  id: string;
  name: string;
  apparatus: SkillApparatus | null;
  description: string | null;
  required: boolean;
};

export type TemplateLevelView = {
  id: string;
  position: number;
  name: string;
  description: string | null;
  elements: TemplateElementView[];
};

export type SkillTemplateSummary = {
  id: string;
  name: string;
  discipline: SkillDiscipline;
  description: string | null;
  source: TemplateSource;
  starterKey: string | null;
  archived: boolean;
  revision: number;
  levelCount: number;
  elementCount: number;
  updatedAt: string;
};

export type SkillTemplateView = SkillTemplateSummary & {
  levels: TemplateLevelView[];
  /** Quien lo ve puede guardar cambios (dirección, administración y coordinación). */
  canEdit: boolean;
};

export type StarterTemplateSummary = {
  key: string;
  name: string;
  discipline: SkillDiscipline;
  description: string;
  levelCount: number;
  elementCount: number;
};

export type SkillTemplatesListView = {
  templates: SkillTemplateSummary[];
  starters: StarterTemplateSummary[];
  canManage: boolean;
  /** Plan en solo lectura: se consulta todo, no se escribe. */
  readOnly: boolean;
};

export type ProgressEntry = {
  status: ElementStatus;
  achievedOn: string | null;
  evaluatedByName: string | null;
  evaluatedAt: string | null;
};

export type LevelPassView = {
  id: string;
  levelId: string;
  levelName: string;
  levelPosition: number;
  passedOn: string;
  /** null en la vista de familias: no se muestran nombres del equipo. */
  passedByName: string | null;
};

export type WriteResult = { id: string; revision: number; replayed: boolean };
/** Una evaluación en bloque: cuántas marcas cambiaron de verdad. */
export type EvaluationResult = WriteResult & { changed: number; unchanged: number };

/* ------------------------------------------------------------------------ */
/* Cálculos                                                                  */
/* ------------------------------------------------------------------------ */

export type CalcElement = { id: string; required: boolean };
export type CalcLevel = { id: string; position: number; elements: readonly CalcElement[] };

export type LevelCompletion = {
  levelId: string;
  position: number;
  totalElements: number;
  requiredElements: number;
  achievedRequired: number;
  inProgressRequired: number;
  achievedOptional: number;
  /** 0 a 100, entero, sobre los elementos obligatorios. */
  percent: number;
  /** Tiene al menos un obligatorio y todos están conseguidos. */
  complete: boolean;
};

/** Estado de cada elemento por id. Lo que falta cuenta como «No iniciado». */
export type ProgressLookup = ReadonlyMap<string, ElementStatus>;

export function statusOf(progress: ProgressLookup, elementId: string): ElementStatus {
  return progress.get(elementId) ?? "not_started";
}

export function computeLevelCompletion(
  level: CalcLevel,
  progress: ProgressLookup
): LevelCompletion {
  let required = 0;
  let achievedRequired = 0;
  let inProgressRequired = 0;
  let achievedOptional = 0;
  for (const element of level.elements) {
    const status = statusOf(progress, element.id);
    if (element.required) {
      required += 1;
      if (status === "achieved") achievedRequired += 1;
      else if (status === "in_progress") inProgressRequired += 1;
    } else if (status === "achieved") {
      achievedOptional += 1;
    }
  }
  return {
    levelId: level.id,
    position: level.position,
    totalElements: level.elements.length,
    requiredElements: required,
    achievedRequired,
    inProgressRequired,
    achievedOptional,
    percent: required === 0 ? 0 : Math.round((achievedRequired * 100) / required),
    complete: required > 0 && achievedRequired === required,
  };
}

export type TrackState = {
  levels: LevelCompletion[];
  /** Ids de los niveles ya superados (con paso de nivel registrado). */
  passedLevelIds: string[];
  /** Nivel en el que trabaja: el primero sin superar. null si superó todos. */
  currentLevelId: string | null;
  /** Todos los niveles tienen paso de nivel registrado. */
  finished: boolean;
  /** El nivel actual está completo y falta registrar el paso de nivel. */
  readyToPass: boolean;
  /** Progreso global 0 a 100: niveles superados más el avance del actual. */
  overallPercent: number;
};

/**
 * Estado de una gimnasta frente a una plantilla. El nivel actual es el
 * primero (por posición) sin paso de nivel registrado: los niveles se superan
 * en orden. Un nivel superado no se recalcula si luego se edita la plantilla:
 * el paso de nivel es un hecho con fecha.
 */
export function computeTrackState(input: {
  levels: readonly CalcLevel[];
  progress: ProgressLookup;
  passedLevelIds: readonly string[];
}): TrackState {
  const ordered = [...input.levels].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const passed = new Set(input.passedLevelIds);
  const completions = ordered.map((level) => computeLevelCompletion(level, input.progress));
  const current = ordered.find((level) => !passed.has(level.id)) ?? null;
  const currentCompletion = current ? completions.find((entry) => entry.levelId === current.id) ?? null : null;
  const passedCount = ordered.filter((level) => passed.has(level.id)).length;
  const total = ordered.length;
  const overall =
    total === 0 ? 0 : Math.round(((passedCount + (currentCompletion ? currentCompletion.percent / 100 : 0)) * 100) / total);
  return {
    levels: completions,
    passedLevelIds: ordered.filter((level) => passed.has(level.id)).map((level) => level.id),
    currentLevelId: current?.id ?? null,
    finished: total > 0 && current === null,
    readyToPass: Boolean(currentCompletion?.complete),
    overallPercent: Math.min(100, overall),
  };
}

export type PassLevelCheck =
  | { ok: true }
  | { ok: false; reason: "unknown_level" | "already_passed" | "not_current" | "no_required_elements" | "incomplete" };

/** Reglas del paso de nivel: en orden, y con todos los obligatorios conseguidos. */
export function checkLevelPass(input: {
  levels: readonly CalcLevel[];
  progress: ProgressLookup;
  passedLevelIds: readonly string[];
  levelId: string;
}): PassLevelCheck {
  const level = input.levels.find((entry) => entry.id === input.levelId);
  if (!level) return { ok: false, reason: "unknown_level" };
  if (input.passedLevelIds.includes(level.id)) return { ok: false, reason: "already_passed" };
  const state = computeTrackState(input);
  if (state.currentLevelId !== level.id) return { ok: false, reason: "not_current" };
  const completion = computeLevelCompletion(level, input.progress);
  if (completion.requiredElements === 0) return { ok: false, reason: "no_required_elements" };
  if (!completion.complete) return { ok: false, reason: "incomplete" };
  return { ok: true };
}

export const passLevelRefusalMessages: Record<
  Exclude<PassLevelCheck, { ok: true }>["reason"],
  string
> = {
  unknown_level: "El nivel no existe en esta plantilla.",
  already_passed: "Este nivel ya está superado.",
  not_current: "Los niveles se superan en orden: primero hay que superar el anterior.",
  no_required_elements: "Este nivel no tiene elementos obligatorios: marca alguno como obligatorio antes de pasar de nivel.",
  incomplete: "Faltan elementos obligatorios por conseguir en este nivel.",
};

export type ApparatusSummary = {
  apparatus: SkillApparatus | null;
  total: number;
  achieved: number;
  inProgress: number;
  percent: number;
};

/** Resumen por aparato de los elementos de la plantilla (obligatorios y opcionales). */
export function summarizeByApparatus(
  elements: ReadonlyArray<{ id: string; apparatus: SkillApparatus | null }>,
  progress: ProgressLookup
): ApparatusSummary[] {
  const groups = new Map<string, ApparatusSummary>();
  for (const element of elements) {
    const key = element.apparatus ?? "";
    const entry =
      groups.get(key) ??
      ({ apparatus: element.apparatus, total: 0, achieved: 0, inProgress: 0, percent: 0 } satisfies ApparatusSummary);
    entry.total += 1;
    const status = statusOf(progress, element.id);
    if (status === "achieved") entry.achieved += 1;
    else if (status === "in_progress") entry.inProgress += 1;
    groups.set(key, entry);
  }
  const order = new Map<string, number>(SKILL_APPARATUS.map((apparatus, index): [string, number] => [apparatus, index + 1]));
  return [...groups.values()]
    .map((entry) => ({ ...entry, percent: entry.total === 0 ? 0 : Math.round((entry.achieved * 100) / entry.total) }))
    .sort((a, b) => (order.get(a.apparatus ?? "") ?? 0) - (order.get(b.apparatus ?? "") ?? 0));
}

/**
 * Fecha civil (YYYY-MM-DD) de un instante en la zona horaria dada. Si la zona
 * no es válida usa Europe/Madrid.
 */
export function localDateInTimeZone(instant: Date, timeZone: string | null | undefined): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  try {
    return format(timeZone || "Europe/Madrid");
  } catch {
    return format("Europe/Madrid");
  }
}

/* ------------------------------------------------------------------------ */
/* Vistas de progreso                                                        */
/* ------------------------------------------------------------------------ */

export type ElementStateView = TemplateElementView & { state: ProgressEntry };

export type LevelStateView = {
  id: string;
  position: number;
  name: string;
  description: string | null;
  elements: ElementStateView[];
  completion: LevelCompletion;
  passed: LevelPassView | null;
  /** Es el nivel en el que trabaja ahora. */
  current: boolean;
};

export type TemplateProgressView = {
  template: {
    id: string;
    name: string;
    discipline: SkillDiscipline;
    description: string | null;
    archived: boolean;
  };
  levels: LevelStateView[];
  currentLevelId: string | null;
  finished: boolean;
  readyToPass: boolean;
  overallPercent: number;
  apparatus: ApparatusSummary[];
};

const EMPTY_PROGRESS: ProgressEntry = {
  status: "not_started",
  achievedOn: null,
  evaluatedByName: null,
  evaluatedAt: null,
};

/**
 * Une la estructura de una plantilla con lo registrado de una gimnasta:
 * estado de cada elemento, nivel actual, aviso de «listo para pasar» y resumen
 * por aparato. Pura: la usan la ficha, las listas de grupo y de sesión y la
 * vista de familias.
 */
export function buildTemplateProgress(input: {
  template: TemplateProgressView["template"];
  levels: readonly TemplateLevelView[];
  progress: ReadonlyMap<string, ProgressEntry>;
  passes: readonly LevelPassView[];
}): TemplateProgressView {
  const statuses: ProgressLookup = new Map(
    [...input.progress.entries()].map(([id, entry]): [string, ElementStatus] => [id, entry.status])
  );
  const passByLevel = new Map(input.passes.map((pass) => [pass.levelId, pass] as const));
  const track = computeTrackState({
    levels: input.levels.map((level) => ({
      id: level.id,
      position: level.position,
      elements: level.elements.map((element) => ({ id: element.id, required: element.required })),
    })),
    progress: statuses,
    passedLevelIds: input.passes.map((pass) => pass.levelId),
  });
  const completionByLevel = new Map(track.levels.map((entry) => [entry.levelId, entry] as const));
  const levels: LevelStateView[] = input.levels.map((level) => ({
    id: level.id,
    position: level.position,
    name: level.name,
    description: level.description,
    elements: level.elements.map((element) => ({
      ...element,
      state: input.progress.get(element.id) ?? EMPTY_PROGRESS,
    })),
    completion: completionByLevel.get(level.id)!,
    passed: passByLevel.get(level.id) ?? null,
    current: level.id === track.currentLevelId,
  }));
  return {
    template: input.template,
    levels,
    currentLevelId: track.currentLevelId,
    finished: track.finished,
    readyToPass: track.readyToPass,
    overallPercent: track.overallPercent,
    apparatus: summarizeByApparatus(
      input.levels.flatMap((level) =>
        level.elements.map((element) => ({ id: element.id, apparatus: element.apparatus }))
      ),
      statuses
    ),
  };
}

export type AthleteSkillsView = {
  athlete: { id: string; name: string; archived: boolean };
  /** Escritura posible para este rol y gimnasta (el plan se comprueba aparte). */
  canWrite: boolean;
  readOnly: boolean;
  /** Plantillas con progreso o pasos de nivel de la gimnasta, o la pedida. */
  templates: TemplateProgressView[];
  /** Plantillas activas de la academia, para empezar a evaluar con otra. */
  availableTemplates: SkillTemplateSummary[];
};

export type RosterAthleteView = {
  id: string;
  name: string;
  statuses: Record<string, ElementStatus>;
  currentLevelId: string | null;
  readyToPass: boolean;
  finished: boolean;
  overallPercent: number;
  passedLevelIds: string[];
};

export type SkillRosterView = {
  /** Nombre del grupo o de la clase de la sesión. */
  label: string;
  template: { id: string; name: string; discipline: SkillDiscipline; archived: boolean; levels: TemplateLevelView[] };
  athletes: RosterAthleteView[];
  truncated: boolean;
  canWrite: boolean;
  readOnly: boolean;
  /** Plantillas activas de la academia, para cambiar de plantilla en la misma vista. */
  availableTemplates: SkillTemplateSummary[];
};

export type DiplomaView = {
  passId: string;
  athleteName: string;
  academyName: string;
  templateName: string;
  discipline: SkillDiscipline;
  levelName: string;
  levelPosition: number;
  passedOn: string;
  /** Nombres de los elementos obligatorios del nivel (los que se consiguieron). */
  achievements: Array<{ name: string; apparatus: SkillApparatus | null }>;
};

export type FamilySkillsView = {
  athleteName: string;
  academyName: string;
  templates: TemplateProgressView[];
};

/** Fecha larga en español para el diploma: «14 de noviembre de 2026». */
export function formatDiplomaDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return `${day} de ${months[month - 1] ?? ""} de ${year}`;
}
