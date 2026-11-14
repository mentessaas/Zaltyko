/**
 * Pasar lista sin conexión — tipos compartidos.
 *
 * Datos mínimos a propósito: de cada gimnasta solo se guarda en el dispositivo
 * lo que hace falta para pasar lista (identificador, nombre y grupo). Nunca
 * fecha de nacimiento, datos de salud, contactos de familia ni notas.
 */

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  "present",
  "absent",
  "late",
  "excused",
];

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

export interface SnapshotAthlete {
  id: string;
  name: string;
  groupName: string | null;
}

export interface SnapshotMark {
  status: AttendanceStatus;
  /** Momento de la marca guardado en el servidor (ISO). */
  recordedAt: string | null;
}

export interface SnapshotSession {
  id: string;
  classId: string;
  className: string;
  startTime: string | null;
  endTime: string | null;
  athletes: SnapshotAthlete[];
  /** Marcas que ya había en el servidor al descargar la lista. */
  marks: Record<string, SnapshotMark>;
}

/** Lista de las sesiones de hoy guardada en el dispositivo. */
export interface TodaySnapshot {
  /** `${userId}:${academyId}` */
  key: string;
  userId: string;
  academyId: string;
  academyName: string | null;
  /** Día de la lista (AAAA-MM-DD, en la zona de la academia). */
  date: string;
  /** Cuándo se descargó (ISO). */
  savedAt: string;
  sessions: SnapshotSession[];
}

export type QueuedMarkState = "pending" | "failed";

/**
 * Una marca hecha en el tapiz que aún no está confirmada por el servidor.
 * Hay como mucho una por (sesión, gimnasta): la última marca sustituye a la
 * anterior («la última marca de la entrenadora gana»).
 */
export interface QueuedMark {
  /** Clave de la cola: `${userId}:${sessionId}:${athleteId}`. */
  key: string;
  /** Identificador de la operación; el servidor lo anota si hay conflicto. */
  opId: string;
  userId: string;
  academyId: string;
  sessionId: string;
  athleteId: string;
  status: AttendanceStatus;
  /** Momento real en que la entrenadora tocó el botón (ISO). */
  markedAt: string;
  /**
   * `recordedAt` que la entrenadora vio en pantalla al marcar (null si no
   * había marca). El servidor lo compara con lo guardado para saber si
   * alguien cambió esa marca mientras tanto.
   */
  seenRecordedAt: string | null;
  state: QueuedMarkState;
  attempts: number;
  /** Código corto del último rechazo definitivo del servidor. */
  lastError?: string;
}

/** Cada usuaria tiene su propia cola: nadie pisa las marcas de otra. */
export function queueKey(sessionId: string, athleteId: string, userId: string): string {
  return `${userId}:${sessionId}:${athleteId}`;
}

export function snapshotKey(userId: string, academyId: string): string {
  return `${userId}:${academyId}`;
}

/** Resultado por gimnasta que devuelve `POST /api/attendance`. */
export type SyncOutcome = "applied" | "duplicate" | "superseded";

export interface SyncResultEntry {
  athleteId: string;
  outcome: SyncOutcome;
  /** Lo que queda guardado en el servidor para esa gimnasta (ISO). */
  recordedAt?: string;
}
