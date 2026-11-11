import { z } from "zod";

/**
 * O1 · Entrenadora titular por clase y sustitución por sesión.
 *
 * Dominio puro: contratos de entrada (Zod), tipos de las vistas y reglas que
 * no dependen de la base de datos. Ver docs/producto/entrenadoras-por-clase.md.
 */

/** Motivo del 503 cuando el candidato SQL no está aplicado. */
export const COACH_ASSIGNMENT_UNAVAILABLE_REASON = "coach_assignment_storage_unavailable";

/** Tope de entrenadoras por clase o por sesión. */
export const MAX_COACHES_PER_ASSIGNMENT = 6;

/** Roles que asignan y sustituyen: la dirección, administración y coordinación. */
export const COACH_ASSIGNMENT_MANAGER_ROLES = ["owner", "admin", "manager"] as const;
/** Roles que leen quién está en una sesión de su sede. */
export const COACH_ASSIGNMENT_READER_ROLES = ["owner", "admin", "manager", "coach"] as const;

/**
 * Motivo de una sustitución. Código cerrado, sin texto libre: una nota libre
 * acabaría guardando datos de salud («baja por lesión») en un registro que no
 * se puede editar. Decide Elvis si hace falta una nota.
 */
export const SUBSTITUTION_REASONS = ["absence", "reinforcement", "one_off_change", "other"] as const;
export type SubstitutionReason = (typeof SUBSTITUTION_REASONS)[number];

export const SUBSTITUTION_REASON_LABELS: Record<SubstitutionReason, string> = {
  absence: "Ausencia",
  reinforcement: "Refuerzo",
  one_off_change: "Cambio puntual",
  other: "Otro motivo",
};

const staffProfileIdsSchema = z
  .array(z.guid())
  .max(MAX_COACHES_PER_ASSIGNMENT, `Como máximo ${MAX_COACHES_PER_ASSIGNMENT} entrenadoras.`)
  .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, "No repitas entrenadoras.");

export const classCoachesQuerySchema = z
  .object({
    organizationId: z.guid(),
    // Opcional: la sede sale de la clase. Si llega, tiene que coincidir.
    locationId: z.guid().nullable().optional(),
  })
  .strict();

export const sessionCoachesQuerySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
  })
  .strict();

export const setClassCoachesCommandSchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid().nullable().optional(),
    clientRequestId: z.guid(),
    staffProfileIds: staffProfileIdsSchema,
    /** Lista que vio la pantalla antes de guardar: si ya no coincide, 409. */
    expectedStaffProfileIds: staffProfileIdsSchema,
  })
  .strict();

export const setSessionCoachesCommandSchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
    clientRequestId: z.guid(),
    staffProfileIds: staffProfileIdsSchema,
    expectedStaffProfileIds: staffProfileIdsSchema,
    reason: z.enum(SUBSTITUTION_REASONS).nullable().optional(),
  })
  .strict();

export type ClassCoachesQuery = z.infer<typeof classCoachesQuerySchema>;
export type SessionCoachesQuery = z.infer<typeof sessionCoachesQuerySchema>;
export type SetClassCoachesCommand = z.infer<typeof setClassCoachesCommandSchema>;
export type SetSessionCoachesCommand = z.infer<typeof setSessionCoachesCommandSchema>;

export type CoachRef = { staffProfileId: string; name: string };

export type ClassCoachesView = {
  classTemplateId: string;
  locationId: string;
  titulars: CoachRef[];
  /** Miembros con rol entrenador, ficha activa y acceso a la sede de la clase. */
  eligible: CoachRef[];
  canWrite: boolean;
};

export type SessionSubstitution = {
  reason: SubstitutionReason | null;
  changedAt: string;
  changedByName: string;
};

export type SessionCoachesView = {
  sessionId: string;
  classTemplateId: string;
  locationId: string;
  coaches: CoachRef[];
  titulars: CoachRef[];
  substitution: SessionSubstitution | null;
  /** Solo para la dirección; null para quien solo lee. */
  eligible: CoachRef[] | null;
  canWrite: boolean;
  assignedToViewer: boolean;
};

export type ClassCoachesWriteResult = ClassCoachesView & {
  /** Sesiones futuras sin sustitución que pasaron a las nuevas titulares. */
  updatedSessionCount: number;
  replayed: boolean;
};

export type SessionCoachesWriteResult = SessionCoachesView & { replayed: boolean };

/** Resumen de una sesión de Hoy: quién está y si hay sustitución. */
export type SessionCoachSummary = {
  coachNames: string[];
  substitution: boolean;
  assignedToViewer: boolean;
};

export type CoachAssignmentRole = (typeof COACH_ASSIGNMENT_READER_ROLES)[number];

export function isCoachAssignmentManager(role: string): boolean {
  return (COACH_ASSIGNMENT_MANAGER_ROLES as readonly string[]).includes(role);
}

/** Ids en minúsculas, sin repetir y ordenados: la forma canónica de comparar. */
export function normalizeStaffProfileIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.toLowerCase()))].sort();
}

export function sameStaffSet(left: readonly string[], right: readonly string[]): boolean {
  const a = normalizeStaffProfileIds(left);
  const b = normalizeStaffProfileIds(right);
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Ids que entran en la nueva lista y no estaban: son los que hay que validar. */
export function addedStaffProfileIds(current: readonly string[], target: readonly string[]): string[] {
  const before = new Set(normalizeStaffProfileIds(current));
  return normalizeStaffProfileIds(target).filter((id) => !before.has(id));
}

export function removedStaffProfileIds(current: readonly string[], target: readonly string[]): string[] {
  const after = new Set(normalizeStaffProfileIds(target));
  return normalizeStaffProfileIds(current).filter((id) => !after.has(id));
}

/**
 * Una sesión está «en sustitución» cuando la dirección fijó a mano una lista
 * distinta de las titulares. Si la lista que se guarda coincide con las
 * titulares, la sesión vuelve a heredar de la clase.
 */
export function isSubstitution(target: readonly string[], titulars: readonly string[]): boolean {
  return !sameStaffSet(target, titulars);
}

export function coachDisplayName(person: {
  givenName: string;
  familyName: string;
  preferredName?: string | null;
}): string {
  const preferred = person.preferredName?.trim();
  if (preferred) return `${preferred} ${person.familyName}`.trim();
  return `${person.givenName} ${person.familyName}`.trim();
}

/** Orden estable por nombre visible, con el id como desempate. */
export function sortCoaches(coaches: readonly CoachRef[]): CoachRef[] {
  return [...coaches].sort(
    (left, right) =>
      left.name.localeCompare(right.name, "es", { sensitivity: "base" }) ||
      left.staffProfileId.localeCompare(right.staffProfileId)
  );
}

/**
 * Hoy para una entrenadora: primero sus sesiones asignadas y después el resto
 * de la sede, cada bloque en su orden original (hora de inicio). No filtra:
 * solo reordena lo que ya podía ver.
 */
export function partitionAssignedFirst<T extends { assignedToViewer?: boolean }>(
  sessions: readonly T[]
): { assigned: T[]; others: T[] } {
  const assigned: T[] = [];
  const others: T[] = [];
  for (const session of sessions) (session.assignedToViewer ? assigned : others).push(session);
  return { assigned, others };
}

export function substitutionReasonLabel(reason: SubstitutionReason | null): string | null {
  return reason ? SUBSTITUTION_REASON_LABELS[reason] : null;
}
