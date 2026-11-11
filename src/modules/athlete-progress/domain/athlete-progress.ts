import { z } from "zod";

/**
 * P2 #17 (primera parte): objetivos y observaciones por gimnasta.
 * Dominio puro: valores admitidos, textos visibles, reglas de permisos y
 * validación de las órdenes. Nada aquí toca la base de datos.
 * Producto: docs/producto/objetivos-y-observaciones.md.
 */

export const OBJECTIVE_STATUSES = ["in_progress", "achieved", "discarded"] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export const DISCIPLINES = ["gaf", "gam"] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const APPARATUS_BY_DISCIPLINE = {
  gaf: ["vault", "uneven_bars", "beam", "floor"],
  gam: ["floor", "pommel_horse", "rings", "vault", "parallel_bars", "high_bar"],
} as const satisfies Record<Discipline, readonly string[]>;

export const APPARATUS = [
  "vault",
  "uneven_bars",
  "beam",
  "floor",
  "pommel_horse",
  "rings",
  "parallel_bars",
  "high_bar",
] as const;
export type Apparatus = (typeof APPARATUS)[number];

export const OBSERVATION_VISIBILITIES = ["team", "family"] as const;
export type ObservationVisibility = (typeof OBSERVATION_VISIBILITIES)[number];

export const objectiveStatusLabels: Record<ObjectiveStatus, string> = {
  in_progress: "En curso",
  achieved: "Conseguido",
  discarded: "Descartado",
};

export const disciplineLabels: Record<Discipline, string> = {
  gaf: "GAF",
  gam: "GAM",
};

export const apparatusLabels: Record<Apparatus, string> = {
  vault: "Salto",
  uneven_bars: "Paralelas asimétricas",
  beam: "Barra de equilibrio",
  floor: "Suelo",
  pommel_horse: "Caballo con arcos",
  rings: "Anillas",
  parallel_bars: "Paralelas",
  high_bar: "Barra fija",
};

export const observationVisibilityLabels: Record<ObservationVisibility, string> = {
  team: "Solo equipo",
  family: "Compartible con la familia",
};

export const OBJECTIVE_TITLE_MAX = 120;
export const OBSERVATION_BODY_MAX = 1000;
export const OBSERVATIONS_PAGE_SIZE = 50;
export const OBJECTIVES_LIMIT = 100;

export function apparatusBelongsToDiscipline(
  discipline: Discipline | null | undefined,
  apparatus: Apparatus | null | undefined
): boolean {
  if (!apparatus) return true;
  if (!discipline) return false;
  return (APPARATUS_BY_DISCIPLINE[discipline] as readonly string[]).includes(apparatus);
}

/* ------------------------------------------------------------------------ */
/* Permisos                                                                  */
/* ------------------------------------------------------------------------ */

export type ProgressMemberRole = "owner" | "admin" | "manager" | "coach";

/** Roles que pueden usar la sección. Las familias no tienen membresía. */
export const PROGRESS_ROLES = ["owner", "admin", "manager", "coach"] as const;

export function isManagementRole(role: ProgressMemberRole): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

/**
 * Decisión conservadora (Decide Elvis): un entrenador solo edita sus propias
 * observaciones y solo cambia el estado de los objetivos que creó. La
 * dirección, administración y coordinación editan cualquiera que vean.
 */
export function canEditObservation(input: {
  role: ProgressMemberRole;
  memberId: string;
  authorMemberId: string;
}): boolean {
  return isManagementRole(input.role) || input.memberId === input.authorMemberId;
}

export function canChangeObjectiveStatus(input: {
  role: ProgressMemberRole;
  memberId: string;
  createdByMemberId: string;
}): boolean {
  return isManagementRole(input.role) || input.memberId === input.createdByMemberId;
}

export function isValidObjectiveTransition(from: ObjectiveStatus, to: ObjectiveStatus): boolean {
  return from !== to;
}

/**
 * Regla de exposición a familias. `visibility = 'family'` solo marca la nota
 * como compartible; el portal de familias NO muestra observaciones todavía.
 * Cuando Elvis lo decida, el portal leerá únicamente las notas para las que
 * esta función devuelva true, y solo si FAMILY_PORTAL_SHOWS_OBSERVATIONS se
 * activa en esa PR.
 */
export const FAMILY_PORTAL_SHOWS_OBSERVATIONS = false as const;

export function isObservationShareableWithFamily(observation: {
  visibility: ObservationVisibility;
}): boolean {
  return FAMILY_PORTAL_SHOWS_OBSERVATIONS && observation.visibility === "family";
}

/** Fecha civil (YYYY-MM-DD) de un instante en la zona horaria de la sede. */
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
/* Validación                                                                */
/* ------------------------------------------------------------------------ */

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
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

const objectiveTitleSchema = z
  .string()
  .trim()
  .min(2, "El objetivo necesita al menos 2 caracteres")
  .max(OBJECTIVE_TITLE_MAX)
  .refine((value) => !SINGLE_LINE_CONTROL.test(value), "El objetivo no admite saltos de línea")
  .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "));

const observationBodySchema = z
  .string()
  .trim()
  .min(1, "Escribe la observación")
  .max(OBSERVATION_BODY_MAX)
  .refine((value) => !CONTROL_CHARACTERS.test(value), "La observación tiene caracteres no válidos")
  .transform((value) => value.normalize("NFC").replace(/\r\n?/gu, "\n"));

const scopeShape = {
  organizationId: z.guid(),
  locationId: z.guid(),
};

/**
 * Consulta de la ficha. URLSearchParams.get() devuelve null cuando falta un
 * parámetro, así que los opcionales aceptan null además de undefined.
 */
export const athleteProgressQuerySchema = z
  .object({
    ...scopeShape,
    objectiveStatus: z.enum(OBJECTIVE_STATUSES).nullable().optional(),
  })
  .strict();

export const createObjectiveCommandSchema = z
  .object({
    ...scopeShape,
    clientRequestId: z.guid(),
    title: objectiveTitleSchema,
    discipline: z.enum(DISCIPLINES).nullable().optional(),
    apparatus: z.enum(APPARATUS).nullable().optional(),
    targetDate: calendarDateSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!apparatusBelongsToDiscipline(value.discipline, value.apparatus)) {
      context.addIssue({
        code: "custom",
        path: ["apparatus"],
        message: "El aparato no corresponde a la disciplina",
      });
    }
  });

export const changeObjectiveStatusCommandSchema = z
  .object({
    ...scopeShape,
    expectedRevision: z.number().int().positive(),
    status: z.enum(OBJECTIVE_STATUSES),
  })
  .strict();

export const createObservationCommandSchema = z
  .object({
    ...scopeShape,
    clientRequestId: z.guid(),
    body: observationBodySchema,
    visibility: z.enum(OBSERVATION_VISIBILITIES).default("team"),
    observedOn: calendarDateSchema.nullable().optional(),
    sessionId: z.guid().nullable().optional(),
    objectiveId: z.guid().nullable().optional(),
  })
  .strict();

export const updateObservationCommandSchema = z
  .object({
    ...scopeShape,
    expectedRevision: z.number().int().positive(),
    body: observationBodySchema,
    visibility: z.enum(OBSERVATION_VISIBILITIES),
  })
  .strict();

/** Acceso rápido desde Pasar lista: la gimnasta llega por su inscripción. */
export const sessionObservationCommandSchema = z
  .object({
    ...scopeShape,
    enrollmentId: z.guid(),
    clientRequestId: z.guid(),
    body: observationBodySchema,
    visibility: z.enum(OBSERVATION_VISIBILITIES).default("team"),
  })
  .strict();

export type AthleteProgressQuery = z.infer<typeof athleteProgressQuerySchema>;
export type CreateObjectiveCommand = z.infer<typeof createObjectiveCommandSchema>;
export type ChangeObjectiveStatusCommand = z.infer<typeof changeObjectiveStatusCommandSchema>;
export type CreateObservationCommand = z.infer<typeof createObservationCommandSchema>;
export type UpdateObservationCommand = z.infer<typeof updateObservationCommandSchema>;
export type SessionObservationCommand = z.infer<typeof sessionObservationCommandSchema>;

/* ------------------------------------------------------------------------ */
/* Lectura                                                                   */
/* ------------------------------------------------------------------------ */

export type ObjectiveHistoryEntry = {
  revision: number;
  fromStatus: ObjectiveStatus | null;
  toStatus: ObjectiveStatus;
  changedByName: string;
  changedAt: string;
};

export type AthleteObjectiveView = {
  id: string;
  title: string;
  discipline: Discipline | null;
  apparatus: Apparatus | null;
  targetDate: string | null;
  status: ObjectiveStatus;
  revision: number;
  createdByName: string;
  createdAt: string;
  statusChangedAt: string;
  canChangeStatus: boolean;
  history: ObjectiveHistoryEntry[];
};

export type AthleteObservationView = {
  id: string;
  body: string;
  visibility: ObservationVisibility;
  observedOn: string;
  sessionId: string | null;
  objectiveId: string | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  canEdit: boolean;
};

export type AthleteProgressView = {
  athlete: { id: string; name: string; archived: boolean };
  objectives: AthleteObjectiveView[];
  observations: AthleteObservationView[];
  /** Escritura posible para este rol y gimnasta (el plan se comprueba aparte). */
  canWrite: boolean;
};

export type ProgressWriteResult = { id: string; revision: number; replayed: boolean };
