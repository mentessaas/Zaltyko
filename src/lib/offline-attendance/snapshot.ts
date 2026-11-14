import type { OfflineStore } from "./store";
import {
  snapshotKey,
  type AttendanceStatus,
  type QueuedMark,
  type SnapshotSession,
  type TodaySnapshot,
} from "./types";

/** Lo que devuelve `GET /api/attendance/today`. */
export interface TodayPayload {
  academyId: string;
  academyName?: string | null;
  userId: string;
  date: string;
  generatedAt: string;
  sessions: SnapshotSession[];
}

/** Una lista guardada deja de mostrarse (y se borra) pasadas estas horas. */
export const SNAPSHOT_MAX_AGE_HOURS = 36;

export async function saveSnapshot(store: OfflineStore, payload: TodayPayload): Promise<TodaySnapshot> {
  const snapshot: TodaySnapshot = {
    key: snapshotKey(payload.userId, payload.academyId),
    userId: payload.userId,
    academyId: payload.academyId,
    academyName: payload.academyName ?? null,
    date: payload.date,
    savedAt: payload.generatedAt,
    sessions: payload.sessions,
  };
  await store.putSnapshot(snapshot);
  return snapshot;
}

export function isSnapshotExpired(snapshot: TodaySnapshot, now: Date = new Date()): boolean {
  const savedAt = Date.parse(snapshot.savedAt);
  if (Number.isNaN(savedAt)) return true;
  return now.getTime() - savedAt > SNAPSHOT_MAX_AGE_HOURS * 3_600_000;
}

/** Borra las listas viejas: no se guardan datos de gimnastas más de lo necesario. */
export async function purgeExpiredSnapshots(store: OfflineStore, now: Date = new Date()): Promise<number> {
  const all = await store.listSnapshots();
  let removed = 0;
  for (const snapshot of all) {
    if (isSnapshotExpired(snapshot, now)) {
      await store.deleteSnapshot(snapshot.key);
      removed += 1;
    }
  }
  return removed;
}

/** La lista más reciente y vigente de un usuario (para la pantalla sin conexión). */
export async function getFreshSnapshots(
  store: OfflineStore,
  userId: string,
  now: Date = new Date()
): Promise<TodaySnapshot[]> {
  const all = await store.listSnapshots();
  return all
    .filter((s) => s.userId === userId && !isSnapshotExpired(s, now))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export type MarkDisplayState = "saved" | "pending" | "failed";

export interface DisplayedMark {
  status: AttendanceStatus;
  state: MarkDisplayState;
}

/**
 * Lo que se enseña en pantalla: lo que había en el servidor y, encima, lo que
 * la entrenadora ha marcado y aún no se ha enviado.
 */
export function mergeMarks(
  session: Pick<SnapshotSession, "id" | "marks">,
  queued: readonly QueuedMark[]
): Record<string, DisplayedMark> {
  const merged: Record<string, DisplayedMark> = {};
  for (const [athleteId, mark] of Object.entries(session.marks)) {
    merged[athleteId] = { status: mark.status, state: "saved" };
  }
  for (const mark of queued) {
    if (mark.sessionId !== session.id) continue;
    merged[mark.athleteId] = {
      status: mark.status,
      state: mark.state === "failed" ? "failed" : "pending",
    };
  }
  return merged;
}
