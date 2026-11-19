import { z } from "zod";

import { apparatusLabels as artisticApparatusLabels } from "@/modules/athlete-progress/domain/athlete-progress";
import {
  fromSessionPlanApparatus,
  fromSessionPlanDiscipline,
  type CanonicalDiscipline,
} from "@/modules/shared/domain/discipline-keys";
import type { SkillApparatus } from "@/modules/skill-levels/domain/skill-levels";

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

/**
 * GAF, GAM y rítmica. El contenido es texto libre y obligatorio; el enlace
 * opcional a la biblioteca de elementos no lo sustituye.
 */
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

/**
 * Disciplina y aparato del bloque con las claves de la biblioteca de
 * elementos (ADR-0029 §5: se convierte en el borde), o null si falta alguno.
 */
export function blockCatalogTarget(block: {
  discipline: PlanDiscipline | null | undefined;
  apparatus: PlanApparatus | null | undefined;
}): { discipline: CanonicalDiscipline; apparatus: SkillApparatus } | null {
  const discipline = block.discipline ? fromSessionPlanDiscipline(block.discipline) : null;
  const apparatus = block.apparatus ? fromSessionPlanApparatus(block.apparatus) : null;
  return discipline && apparatus ? { discipline, apparatus } : null;
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
  /**
   * Enlace opcional a un elemento de la biblioteca (ADR-0029 §3.2 y §3.3):
   * ausente conserva el guardado, `null` lo quita y un uuid lo pone. Exige
   * disciplina y aparato; qué elemento se puede enlazar lo decide la
   * aplicación con la biblioteca instalada. El contenido sigue siendo obligatorio.
   */
  catalogElementId: z.string().uuid().nullable().optional(),
};

/** Respuesta 400 al enlazar un elemento en un bloque sin disciplina o sin aparato. */
export const BLOCK_CATALOG_LINK_NEEDS_APPARATUS_MESSAGE = "Elige disciplina y aparato para enlazar un elemento";

/** Respuesta 400 al enlazar un elemento de otro aparato, de otra disciplina o que la academia no ve. */
export const BLOCK_CATALOG_LINK_MISMATCH_MESSAGE = "Ese elemento de la biblioteca no corresponde a este aparato";

function refineApparatus(
  value: { discipline?: PlanDiscipline | null; apparatus?: PlanApparatus | null; catalogElementId?: string | null },
  context: z.RefinementCtx
) {
  if (!planApparatusBelongsToDiscipline(value.discipline, value.apparatus)) {
    context.addIssue({
      code: "custom",
      path: ["apparatus"],
      message: "El aparato no corresponde a la disciplina",
    });
  }
  // Un elemento de la biblioteca es de un aparato concreto (ADR-0029 §3.2).
  if (typeof value.catalogElementId === "string" && (!value.discipline || !value.apparatus)) {
    context.addIssue({
      code: "custom",
      path: ["catalogElementId"],
      message: BLOCK_CATALOG_LINK_NEEDS_APPARATUS_MESSAGE,
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
  /** Solo si el bloque está enlazado: sin enlace no hay clave, y el jsonb queda como antes. */
  catalogElementId?: string;
};

export function normalizeTemplateBlock(block: z.infer<typeof templateBlockSchema>): TemplateBlock {
  return {
    kind: block.kind,
    discipline: block.discipline ?? null,
    apparatus: block.apparatus ?? null,
    content: block.content,
    durationMinutes: block.durationMinutes ?? null,
    ...(block.catalogElementId ? { catalogElementId: block.catalogElementId } : {}),
  };
}

/**
 * Lee el jsonb guardado; cualquier bloque que ya no valide se descarta. Un
 * bloque con enlace a la biblioteca (catalogElementId) es válido.
 */
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

/**
 * Enlace de un bloque con la biblioteca (ADR-0029 §3.6). «current»: está en la
 * biblioteca; «withdrawn»: ya no está; «previous_edition»: es de una edición
 * anterior. `replacementId` es el mismo elemento en una edición más nueva.
 */
export type BlockCatalogLinkStatus = "current" | "withdrawn" | "previous_edition";

export type BlockCatalogLink = {
  id: string;
  /** Nombre del elemento en la biblioteca; el bloque conserva su propio contenido. */
  name: string;
  status: BlockCatalogLinkStatus;
  replacementId: string | null;
};

export const blockCatalogLinkLabels: Record<BlockCatalogLinkStatus, string> = {
  current: "De la biblioteca",
  withdrawn: "Ya no está en la biblioteca",
  previous_edition: "Edición anterior",
};

export type SessionPlanBlockView = Omit<TemplateBlock, "catalogElementId"> & {
  id: string;
  position: number;
  done: boolean;
  doneAt: string | null;
  /** Elemento de la biblioteca enlazado, o null. */
  catalogLink: BlockCatalogLink | null;
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
  /** La biblioteca de elementos está activa: los bloques de artística pueden enlazar un elemento. */
  libraryAvailable: boolean;
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
