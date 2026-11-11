import { z } from "zod";

import { apparatusLabels as artisticApparatusLabels } from "@/modules/athlete-progress/domain/athlete-progress";

/**
 * P2 #17 (segunda parte): planificación sobre sesiones.
 * Dominio puro: listas cerradas, textos visibles, permisos y validación de las
 * órdenes. Nada aquí toca la base de datos.
 * Producto: docs/producto/planificacion-sesiones.md.
 */

export const BLOCK_KINDS = [
  "warmup",
  "technique",
  "conditioning",
  "flexibility",
  "choreography",
  "cooldown",
  "other",
] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

/** GAF, GAM y rítmica. Sin biblioteca de elementos: el contenido es texto libre. */
export const PLAN_DISCIPLINES = ["gaf", "gam", "gr"] as const;
export type PlanDiscipline = (typeof PLAN_DISCIPLINES)[number];

export const PLAN_APPARATUS_BY_DISCIPLINE = {
  gaf: ["vault", "uneven_bars", "beam", "floor"],
  gam: ["floor", "pommel_horse", "rings", "vault", "parallel_bars", "high_bar"],
  gr: ["freehand", "rope", "hoop", "ball", "clubs", "ribbon"],
} as const satisfies Record<PlanDiscipline, readonly string[]>;

export const PLAN_APPARATUS = [
  "vault",
  "uneven_bars",
  "beam",
  "floor",
  "pommel_horse",
  "rings",
  "parallel_bars",
  "high_bar",
  "freehand",
  "rope",
  "hoop",
  "ball",
  "clubs",
  "ribbon",
] as const;
export type PlanApparatus = (typeof PLAN_APPARATUS)[number];

export const blockKindLabels: Record<BlockKind, string> = {
  warmup: "Calentamiento",
  technique: "Técnica",
  conditioning: "Preparación física",
  flexibility: "Flexibilidad",
  choreography: "Coreografía",
  cooldown: "Vuelta a la calma",
  other: "Otro",
};

export const planDisciplineLabels: Record<PlanDiscipline, string> = {
  gaf: "GAF",
  gam: "GAM",
  gr: "Rítmica",
};

export const planApparatusLabels: Record<PlanApparatus, string> = {
  ...artisticApparatusLabels,
  freehand: "Manos libres",
  rope: "Cuerda",
  hoop: "Aro",
  ball: "Pelota",
  clubs: "Mazas",
  ribbon: "Cinta",
};

/**
 * Motivo del 503 cuando el candidato SQL no está aplicado. El cliente solo
 * muestra «no disponible» con este motivo; cualquier otro 503 es un error.
 */
export const SESSION_PLANS_UNAVAILABLE_REASON = "session_plans_unavailable";

export const PLAN_FOCUS_MAX = 200;
export const PLAN_NOTE_MAX = 1000;
export const BLOCK_CONTENT_MAX = 300;
export const BLOCKS_MAX = 20;
export const BLOCK_DURATION_MAX = 240;
export const PLAN_OBJECTIVES_MAX = 30;

export function planApparatusBelongsToDiscipline(
  discipline: PlanDiscipline | null | undefined,
  apparatus: PlanApparatus | null | undefined
): boolean {
  if (!apparatus) return true;
  if (!discipline) return false;
  return (PLAN_APPARATUS_BY_DISCIPLINE[discipline] as readonly string[]).includes(apparatus);
}

/* ------------------------------------------------------------------------ */
/* Permisos                                                                  */
/* ------------------------------------------------------------------------ */

export type PlanMemberRole = "owner" | "admin" | "manager" | "coach";

/**
 * Plan de una sesión: mismo criterio que Pasar lista. La dirección,
 * administración y coordinación, y el entrenador con esa sede en su alcance.
 * No depende de quién está asignado a la sesión (session_staff).
 */
export const SESSION_PLAN_ROLES = ["owner", "admin", "manager", "coach"] as const;

/**
 * Plantilla de la clase: decisión conservadora (Decide Elvis). Solo la
 * dirección, administración y coordinación la crean o cambian, porque afecta a
 * todas las sesiones futuras de la clase y no solo a la de hoy.
 */
export const CLASS_TEMPLATE_PLAN_ROLES = ["owner", "admin", "manager"] as const;

export function canManageClassPlanTemplate(role: PlanMemberRole): boolean {
  return (CLASS_TEMPLATE_PLAN_ROLES as readonly string[]).includes(role);
}

/**
 * Un bloque se marca como hecho cuando la sesión ya empezó y no está
 * cancelada. Antes de empezar solo se planifica.
 */
export function canMarkBlocks(session: { startsAt: Date; status: string }, now: Date): boolean {
  return session.status !== "cancelled" && session.startsAt.getTime() <= now.getTime();
}

/* ------------------------------------------------------------------------ */
/* Validación                                                                */
/* ------------------------------------------------------------------------ */

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f]/u;

/** Texto de una línea; vacío equivale a no indicarlo. */
const focusSchema = z
  .string()
  .trim()
  .max(PLAN_FOCUS_MAX, `El foco admite hasta ${PLAN_FOCUS_MAX} caracteres`)
  .refine((value) => !SINGLE_LINE_CONTROL.test(value), "El foco no admite saltos de línea")
  .transform((value) => (value === "" ? null : value.normalize("NFC").replace(/\s+/gu, " ")));

const noteSchema = z
  .string()
  .trim()
  .max(PLAN_NOTE_MAX, `La nota admite hasta ${PLAN_NOTE_MAX} caracteres`)
  .refine((value) => !CONTROL_CHARACTERS.test(value), "La nota tiene caracteres no válidos")
  .transform((value) => (value === "" ? null : value.normalize("NFC").replace(/\r\n?/gu, "\n")));

const blockContentSchema = z
  .string()
  .trim()
  .min(1, "Describe el contenido del bloque")
  .max(BLOCK_CONTENT_MAX, `El contenido admite hasta ${BLOCK_CONTENT_MAX} caracteres`)
  .refine((value) => !CONTROL_CHARACTERS.test(value), "El contenido tiene caracteres no válidos")
  .transform((value) => value.normalize("NFC").replace(/\r\n?/gu, "\n"));

const blockShape = {
  kind: z.enum(BLOCK_KINDS),
  discipline: z.enum(PLAN_DISCIPLINES).nullable().optional(),
  apparatus: z.enum(PLAN_APPARATUS).nullable().optional(),
  content: blockContentSchema,
  durationMinutes: z.number().int().min(1).max(BLOCK_DURATION_MAX).nullable().optional(),
};

function refineApparatus(
  value: { discipline?: PlanDiscipline | null; apparatus?: PlanApparatus | null },
  context: z.RefinementCtx
) {
  if (!planApparatusBelongsToDiscipline(value.discipline, value.apparatus)) {
    context.addIssue({
      code: "custom",
      path: ["apparatus"],
      message: "El aparato no corresponde a la disciplina",
    });
  }
}

/** Bloque de la plantilla (y de su copia en jsonb): sin identificador ni marca de hecho. */
export const templateBlockSchema = z.object(blockShape).strict().superRefine(refineApparatus);

/** Bloque del plan: `id` conserva un bloque existente y su marca de hecho. */
export const sessionPlanBlockSchema = z
  .object({ id: z.guid().nullable().optional(), ...blockShape })
  .strict()
  .superRefine(refineApparatus);

export type TemplateBlock = {
  kind: BlockKind;
  discipline: PlanDiscipline | null;
  apparatus: PlanApparatus | null;
  content: string;
  durationMinutes: number | null;
};

export function normalizeTemplateBlock(block: z.infer<typeof templateBlockSchema>): TemplateBlock {
  return {
    kind: block.kind,
    discipline: block.discipline ?? null,
    apparatus: block.apparatus ?? null,
    content: block.content,
    durationMinutes: block.durationMinutes ?? null,
  };
}

/** Lee el jsonb guardado; cualquier bloque que ya no valide se descarta. */
export function parseStoredTemplateBlocks(value: unknown): TemplateBlock[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, BLOCKS_MAX).flatMap((item) => {
    const parsed = templateBlockSchema.safeParse(item);
    return parsed.success ? [normalizeTemplateBlock(parsed.data)] : [];
  });
}

const scopeShape = {
  organizationId: z.guid(),
  locationId: z.guid(),
};

/**
 * Consulta del guion y del modelo: academia y sede, ambas obligatorias. Se
 * valida el objeto de URLSearchParams entero y `.strict()` rechaza cualquier
 * otro parámetro.
 */
export const sessionPlanQuerySchema = z.object(scopeShape).strict();
export const classPlanTemplateQuerySchema = z.object(scopeShape).strict();

function uniqueValues(values: ReadonlyArray<string | null | undefined>): boolean {
  const present = values.filter((value): value is string => Boolean(value));
  return new Set(present).size === present.length;
}

/**
 * Guardar el plan de la sesión.
 * - `expectedRevision: null` crea el plan (clientRequestId hace el reintento
 *   idempotente); un número actualiza solo si nadie lo cambió antes.
 * - `source: "template"` crea el plan copiando la plantilla de la clase e
 *   ignora foco, nota y bloques de la petición.
 */
export const saveSessionPlanCommandSchema = z
  .object({
    ...scopeShape,
    clientRequestId: z.guid(),
    expectedRevision: z.number().int().positive().nullable(),
    source: z.enum(["manual", "template"]).default("manual"),
    focus: focusSchema.nullable().optional(),
    note: noteSchema.nullable().optional(),
    blocks: z.array(sessionPlanBlockSchema).max(BLOCKS_MAX, `Hasta ${BLOCKS_MAX} bloques`).default([]),
    objectiveIds: z.array(z.guid()).max(PLAN_OBJECTIVES_MAX).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (!uniqueValues(value.blocks.map((block) => block.id))) {
      context.addIssue({ code: "custom", path: ["blocks"], message: "Hay bloques repetidos" });
    }
    if (!uniqueValues(value.objectiveIds)) {
      context.addIssue({ code: "custom", path: ["objectiveIds"], message: "Hay objetivos repetidos" });
    }
    if (value.source === "template" && value.expectedRevision !== null) {
      context.addIssue({
        code: "custom",
        path: ["source"],
        message: "El modelo de la clase solo se copia al crear el guion",
      });
    }
  });

export const markBlockCommandSchema = z
  .object({
    ...scopeShape,
    done: z.boolean(),
  })
  .strict();

export const saveClassPlanTemplateCommandSchema = z
  .object({
    ...scopeShape,
    expectedRevision: z.number().int().positive().nullable(),
    focus: focusSchema.nullable().optional(),
    note: noteSchema.nullable().optional(),
    blocks: z.array(templateBlockSchema).max(BLOCKS_MAX, `Hasta ${BLOCKS_MAX} bloques`).default([]),
  })
  .strict();

export type SessionPlanQuery = z.infer<typeof sessionPlanQuerySchema>;
export type SaveSessionPlanCommand = z.infer<typeof saveSessionPlanCommandSchema>;
export type MarkBlockCommand = z.infer<typeof markBlockCommandSchema>;
export type SaveClassPlanTemplateCommand = z.infer<typeof saveClassPlanTemplateCommandSchema>;

/* ------------------------------------------------------------------------ */
/* Vistas                                                                    */
/* ------------------------------------------------------------------------ */

export type SessionPlanBlockView = TemplateBlock & {
  id: string;
  position: number;
  done: boolean;
  doneAt: string | null;
};

export type SessionPlanObjectiveView = {
  objectiveId: string;
  athleteId: string;
  athleteName: string;
  title: string;
  status: string;
};

export type SessionPlanView = {
  id: string;
  revision: number;
  focus: string | null;
  note: string | null;
  fromTemplateRevision: number | null;
  blocks: SessionPlanBlockView[];
  objectives: SessionPlanObjectiveView[];
  updatedAt: string;
};

export type SessionPlanPageView = {
  session: {
    id: string;
    classTemplateId: string;
    startsAt: string;
    started: boolean;
    cancelled: boolean;
    canMarkBlocks: boolean;
  };
  plan: SessionPlanView | null;
  template: { exists: boolean; revision: number | null };
  canManageTemplate: boolean;
  /** Objetivos en curso de las gimnastas de esta sesión, más los ya vinculados. */
  objectiveOptions: SessionPlanObjectiveView[];
};

export type ClassPlanTemplateView = {
  classTemplateId: string;
  template: {
    id: string;
    revision: number;
    focus: string | null;
    note: string | null;
    blocks: TemplateBlock[];
    updatedAt: string;
  } | null;
};

export type SessionPlanWriteResult = { id: string; revision: number; replayed: boolean };
export type BlockMarkResult = { id: string; done: boolean; replayed: boolean };
