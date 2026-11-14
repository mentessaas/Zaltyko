"use client";

/**
 * Pegamento del navegador: almacén único, usuario actual, envío por `fetch`,
 * descarga de la lista de hoy y limpieza al cerrar sesión. La lógica pura está
 * en queue.ts y snapshot.ts (con pruebas); aquí solo se conecta al navegador.
 */

import { createClient } from "@/lib/supabase/client";
import { createIndexedDbStore, createMemoryStore, type OfflineStore } from "./store";
import { countPending, flushQueue, type Batch, type FlushSummary, type SendResult } from "./queue";
import { purgeExpiredSnapshots, saveSnapshot, type TodayPayload } from "./snapshot";
import { isAttendanceStatus, type SyncOutcome, type SyncResultEntry, type TodaySnapshot } from "./types";

/** Evento del navegador: la cola o las listas han cambiado. */
export const OFFLINE_ATTENDANCE_EVENT = "zaltyko:offline-attendance-changed";

export interface OfflineAttendanceChange {
  /** Resultado del último envío, si el cambio viene de enviar la cola. */
  flush?: FlushSummary;
}

export const LAST_USER_KEY = "zaltyko:offline-attendance:user";

let storeSingleton: OfflineStore | null = null;

export function getOfflineStore(): OfflineStore {
  if (!storeSingleton) {
    storeSingleton =
      typeof indexedDB !== "undefined" ? createIndexedDbStore() : createMemoryStore();
  }
  return storeSingleton;
}

export function notifyOfflineAttendanceChanged(change: OfflineAttendanceChange = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OfflineAttendanceChange>(OFFLINE_ATTENDANCE_EVENT, { detail: change }));
}

function rememberUser(userId: string): void {
  try {
    localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    // Sin localStorage (modo privado): se vuelve a leer la sesión cada vez.
  }
}

function recallUser(): string | null {
  try {
    return localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

function forgetUser(): void {
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // nada que borrar
  }
}

/**
 * Quién está usando el dispositivo. Con red se lee de la sesión; sin red y con
 * la sesión caducada se usa la última persona conocida, que se borra al
 * cerrar sesión.
 */
export async function resolveUserId(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getSession();
    const id = data.session?.user?.id ?? null;
    if (id) {
      rememberUser(id);
      return id;
    }
  } catch {
    // sin sesión legible: se prueba con la última conocida
  }
  return recallUser();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Convierte la respuesta HTTP de `POST /api/attendance` en un `SendResult`. */
export function interpretSyncResponse(status: number, body: unknown, sentAthleteIds: string[]): SendResult {
  if (status === 401) return { kind: "unauthorized" };
  if (status === 408 || status === 429 || status >= 500) return { kind: "retry" };
  if (status >= 400) {
    const code = isPlainObject(body) && typeof body.code === "string" ? body.code : undefined;
    return { kind: "rejected", status, code };
  }

  // 2xx: se esperan resultados por gimnasta. Si el servidor no los manda
  // (versión antigua), todas se dan por aplicadas.
  const data = isPlainObject(body) && isPlainObject(body.data) ? body.data : null;
  const rawResults = data && Array.isArray(data.results) ? data.results : null;
  if (!rawResults) {
    return {
      kind: "ok",
      results: sentAthleteIds.map((athleteId) => ({ athleteId, outcome: "applied" as SyncOutcome })),
    };
  }
  const results: SyncResultEntry[] = [];
  for (const item of rawResults) {
    if (
      isPlainObject(item) &&
      typeof item.athleteId === "string" &&
      (item.outcome === "applied" || item.outcome === "duplicate" || item.outcome === "superseded")
    ) {
      results.push({ athleteId: item.athleteId, outcome: item.outcome });
    }
  }
  return { kind: "ok", results };
}

async function sendBatch(batch: Batch): Promise<SendResult> {
  try {
    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: batch.sessionId,
        entries: batch.entries.map((e) => ({
          athleteId: e.athleteId,
          status: e.status,
          markedAt: e.markedAt,
          opId: e.opId,
        })),
      }),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Un portal cautivo o un corte devuelven HTML: no es una respuesta de Zaltyko.
      if (response.ok) return { kind: "retry" };
    }
    return interpretSyncResponse(
      response.status,
      body,
      batch.entries.map((e) => e.athleteId)
    );
  } catch {
    return { kind: "retry" };
  }
}

/** Envía las marcas pendientes. Devuelve `null` si no se sabe quién es la usuaria. */
export async function syncPendingAttendance(): Promise<FlushSummary | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  const userId = await resolveUserId();
  if (!userId) return null;
  const summary = await flushQueue(getOfflineStore(), sendBatch, { userId });
  notifyOfflineAttendanceChanged({ flush: summary });
  return summary;
}

export async function pendingAttendanceCount(): Promise<number> {
  const userId = await resolveUserId();
  if (!userId) return 0;
  return countPending(getOfflineStore(), userId);
}

/** Descarga y guarda la lista de las sesiones de hoy de una academia. */
export async function refreshTodaySnapshot(academyId: string): Promise<TodaySnapshot | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  try {
    const response = await fetch(`/api/attendance/today?academyId=${encodeURIComponent(academyId)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const payload = isPlainObject(body) && isPlainObject(body.data) ? (body.data as unknown as TodayPayload) : null;
    if (!payload || !Array.isArray(payload.sessions) || typeof payload.userId !== "string") return null;

    // Se descartan sesiones o estados con forma inesperada antes de guardarlos.
    const safe: TodayPayload = {
      ...payload,
      sessions: payload.sessions.map((session) => ({
        ...session,
        marks: Object.fromEntries(
          Object.entries(session.marks ?? {}).filter(([, mark]) => isAttendanceStatus(mark?.status))
        ),
      })),
    };

    const store = getOfflineStore();
    await purgeExpiredSnapshots(store);
    rememberUser(safe.userId);
    const snapshot = await saveSnapshot(store, safe);
    notifyOfflineAttendanceChanged();
    return snapshot;
  } catch {
    return null;
  }
}

/** Borra del dispositivo listas, cola y recuerdo de la usuaria. */
export async function clearOfflineAttendanceData(): Promise<void> {
  forgetUser();
  try {
    await getOfflineStore().clearAll();
  } catch {
    // Si IndexedDB falla no hay nada más que borrar desde aquí.
  }
  notifyOfflineAttendanceChanged();
}

/**
 * Antes de cerrar sesión: intenta enviar lo pendiente (hasta 4 s) y borra los
 * datos locales. Se llama desde los botones de «Cerrar sesión».
 */
export async function prepareOfflineSignOut(): Promise<void> {
  try {
    await Promise.race([
      syncPendingAttendance(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
  } catch {
    // el cierre de sesión no debe bloquearse por esto
  }
  await clearOfflineAttendanceData();
}
