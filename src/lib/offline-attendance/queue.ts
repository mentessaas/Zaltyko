import type { OfflineStore } from "./store";
import {
  queueKey,
  type AttendanceStatus,
  type QueuedMark,
  type SyncResultEntry,
} from "./types";

/** El servidor acepta hasta 500 por petición; se envía en trozos más pequeños. */
export const SYNC_BATCH_SIZE = 100;

export function newOpId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Respaldo para navegadores antiguos: v4 con Math.random (solo identifica la
  // operación, no es un secreto).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface RecordMarkInput {
  userId: string;
  academyId: string;
  sessionId: string;
  athleteId: string;
  status: AttendanceStatus;
  now?: Date;
  opId?: string;
  /** `recordedAt` que se veía en pantalla al marcar (null: no había marca). */
  seenRecordedAt?: string | null;
}

/**
 * Guarda una marca en la cola local. Si ya había una pendiente para la misma
 * gimnasta y sesión, la sustituye: la última marca gana.
 */
export async function recordMark(store: OfflineStore, input: RecordMarkInput): Promise<QueuedMark> {
  const key = queueKey(input.sessionId, input.athleteId, input.userId);
  // Si ya había una marca pendiente, lo que la entrenadora «vio» sigue siendo
  // lo que había en el servidor antes de sus cambios sin red.
  const previous = await store.getQueued(key);
  const seen = previous ? previous.seenRecordedAt : input.seenRecordedAt ?? null;

  const mark: QueuedMark = {
    key,
    opId: input.opId ?? newOpId(),
    userId: input.userId,
    academyId: input.academyId,
    sessionId: input.sessionId,
    athleteId: input.athleteId,
    status: input.status,
    markedAt: (input.now ?? new Date()).toISOString(),
    seenRecordedAt: seen,
    state: "pending",
    attempts: 0,
  };
  await store.putQueued(mark);
  return mark;
}

export interface BatchEntry {
  athleteId: string;
  status: AttendanceStatus;
  markedAt: string;
  opId: string;
  seenRecordedAt: string | null;
}

export interface Batch {
  academyId: string;
  sessionId: string;
  entries: BatchEntry[];
}

/** Lo que el envío de un trozo puede responder, ya sin detalles de `fetch`. */
export type SendResult =
  | { kind: "ok"; results: SyncResultEntry[] }
  /** El servidor entendió la petición y la rechaza para siempre (403, 404, 400…). */
  | { kind: "rejected"; status: number; code?: string }
  /** Sesión caducada: hay que volver a entrar antes de reintentar. */
  | { kind: "unauthorized" }
  /** Sin red o error pasajero (5xx, 429, 408): se reintenta más tarde. */
  | { kind: "retry" };

export type SendBatch = (batch: Batch) => Promise<SendResult>;

export type StopReason = "offline" | "unauthorized";

/** Marca confirmada, con lo que quedó guardado en el servidor. */
export type ConfirmedMark = QueuedMark & { serverRecordedAt?: string };

export interface FlushSummary {
  /** Marcas confirmadas por el servidor (aplicadas o ya estaban). */
  sent: number;
  /** De las enviadas, las que el servidor ya tenía idénticas (reenvío). */
  duplicates: number;
  /** Marcas descartadas porque había otra más reciente en el servidor. */
  superseded: number;
  /** Marcas que el servidor rechazó de forma definitiva. */
  failed: number;
  /** Marcas que siguen pendientes de enviar. */
  remaining: number;
  /** Las marcas confirmadas (aplicadas o ya existentes), para refrescar la pantalla. */
  confirmed: ConfirmedMark[];
  /** Las marcas descartadas por haber otra más reciente en el servidor. */
  supersededMarks: QueuedMark[];
  stoppedBecause?: StopReason;
}

const inFlight = new WeakMap<OfflineStore, Promise<FlushSummary>>();

/** Cuántas marcas están pendientes de enviar (no cuenta las rechazadas). */
export async function countPending(store: OfflineStore, userId?: string): Promise<number> {
  const all = await store.listQueued();
  return all.filter((m) => m.state === "pending" && (!userId || m.userId === userId)).length;
}

/**
 * Envía la cola al servidor. Seguro de llamar varias veces a la vez: si ya hay
 * un envío en curso, devuelve el mismo resultado en vez de lanzar otro.
 */
export function flushQueue(
  store: OfflineStore,
  send: SendBatch,
  options: { userId: string }
): Promise<FlushSummary> {
  const running = inFlight.get(store);
  if (running) return running;

  const task = doFlush(store, send, options.userId).finally(() => {
    inFlight.delete(store);
  });
  inFlight.set(store, task);
  return task;
}

async function doFlush(store: OfflineStore, send: SendBatch, userId: string): Promise<FlushSummary> {
  const summary: FlushSummary = {
    sent: 0,
    duplicates: 0,
    superseded: 0,
    failed: 0,
    remaining: 0,
    confirmed: [],
    supersededMarks: [],
  };

  const queued = await store.listQueued();

  // Las marcas de otra persona que usó este dispositivo no se envían nunca
  // con esta sesión (se atribuirían a quien no las hizo) ni se borran: se
  // conservan hasta que esa persona vuelva a entrar o caduquen.
  const mine = queued.filter((m) => m.userId === userId && m.state === "pending");
  mine.sort((a, b) => a.markedAt.localeCompare(b.markedAt));

  const groups = new Map<string, QueuedMark[]>();
  for (const mark of mine) {
    const groupKey = `${mark.academyId}|${mark.sessionId}`;
    const list = groups.get(groupKey) ?? [];
    list.push(mark);
    groups.set(groupKey, list);
  }

  /**
   * Envía un trozo. Si el servidor lo rechaza entero (por ejemplo, una
   * gimnasta que ya no está en la clase), se reintenta de una en una para
   * que una sola marca mala no bloquee las demás.
   * Devuelve `false` si hay que parar (sin red o sesión caducada).
   */
  const sendChunk = async (chunk: QueuedMark[]): Promise<boolean> => {
    const batch: Batch = {
      academyId: chunk[0].academyId,
      sessionId: chunk[0].sessionId,
      entries: chunk.map((m) => ({
        athleteId: m.athleteId,
        status: m.status,
        markedAt: m.markedAt,
        opId: m.opId,
        seenRecordedAt: m.seenRecordedAt ?? null,
      })),
    };

    let result: SendResult;
    try {
      result = await send(batch);
    } catch {
      result = { kind: "retry" };
    }

    if (result.kind === "retry") {
      summary.stoppedBecause = "offline";
      return false;
    }
    if (result.kind === "unauthorized") {
      summary.stoppedBecause = "unauthorized";
      return false;
    }

    if (result.kind === "rejected") {
      if (chunk.length > 1) {
        for (const single of chunk) {
          if (!(await sendChunk([single]))) return false;
        }
        return true;
      }
      const only = chunk[0];
      const current = await store.getQueued(only.key);
      // Si mientras tanto hubo una marca más nueva, esa sigue su camino.
      if (current && current.opId === only.opId) {
        await store.putQueued({
          ...current,
          state: "failed",
          attempts: current.attempts + 1,
          lastError: result.code ?? `http-${result.status}`,
        });
        summary.failed += 1;
      }
      return true;
    }

    const outcomes = new Map(result.results.map((r) => [r.athleteId, r]));
    for (const sent of chunk) {
      const entry = outcomes.get(sent.athleteId);
      // Si el servidor no confirmó a esta gimnasta, la marca sigue pendiente.
      if (!entry) continue;
      const outcome = entry.outcome;
      const current = await store.getQueued(sent.key);
      if (current && current.opId === sent.opId) {
        await store.deleteQueued(sent.key);
      }
      if (outcome === "superseded") {
        summary.superseded += 1;
        summary.supersededMarks.push(sent);
      } else {
        summary.sent += 1;
        summary.confirmed.push({ ...sent, serverRecordedAt: entry.recordedAt });
        if (outcome === "duplicate") summary.duplicates += 1;
      }
    }
    return true;
  };

  outer: for (const marks of groups.values()) {
    for (let i = 0; i < marks.length; i += SYNC_BATCH_SIZE) {
      if (!(await sendChunk(marks.slice(i, i + SYNC_BATCH_SIZE)))) break outer;
    }
  }

  summary.remaining = await countPending(store, userId);
  return summary;
}

/** Marcas rechazadas de forma definitiva, para que la entrenadora las vea. */
export async function listFailed(store: OfflineStore, userId: string): Promise<QueuedMark[]> {
  return (await store.listQueued()).filter((m) => m.state === "failed" && m.userId === userId);
}

/** Descarta las marcas rechazadas (la entrenadora ya las vio). */
export async function discardFailed(store: OfflineStore, userId: string): Promise<number> {
  const failed = await listFailed(store, userId);
  for (const mark of failed) await store.deleteQueued(mark.key);
  return failed.length;
}

/** Cuánto se guarda una marca sin enviar antes de darla por perdida. */
export const QUEUE_PENDING_MAX_AGE_DAYS = 7;
/** Las rechazadas por el servidor no se reintentan: se guardan menos. */
export const QUEUE_FAILED_MAX_AGE_DAYS = 3;

/**
 * Borra las marcas de la cola que ya no tiene sentido guardar: pendientes de
 * hace más de 7 días y rechazadas de hace más de 3. Vale para cualquier
 * persona que usara el móvil. Devuelve cuántas borró.
 */
export async function purgeExpiredQueue(store: OfflineStore, now: Date = new Date()): Promise<number> {
  let removed = 0;
  for (const mark of await store.listQueued()) {
    const markedAt = Date.parse(mark.markedAt);
    const maxDays = mark.state === "failed" ? QUEUE_FAILED_MAX_AGE_DAYS : QUEUE_PENDING_MAX_AGE_DAYS;
    if (Number.isNaN(markedAt) || now.getTime() - markedAt > maxDays * 86_400_000) {
      await store.deleteQueued(mark.key);
      removed += 1;
    }
  }
  return removed;
}
