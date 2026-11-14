"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CloudOff, ChevronRight } from "lucide-react";

import { AttendanceSheet } from "@/components/attendance/AttendanceSheet";
import {
  OFFLINE_ATTENDANCE_EVENT,
  getOfflineStore,
  refreshTodaySnapshot,
  resolveUserId,
  syncPendingAttendance,
} from "@/lib/offline-attendance/runtime";
import { getFreshSnapshots, mergeMarks, purgeExpiredSnapshots } from "@/lib/offline-attendance/snapshot";
import type { AttendanceStatus, QueuedMark, TodaySnapshot } from "@/lib/offline-attendance/types";

function timeLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Pantalla de «Pasar lista» que funciona con la lista guardada en el móvil.
 * Es la misma para todas las academias y no lleva datos en el HTML: todo sale
 * de IndexedDB. La abre el service worker cuando no hay red.
 */
export function OfflineAttendanceShell() {
  const [loading, setLoading] = useState(true);
  const [snapshots, setSnapshots] = useState<TodaySnapshot[]>([]);
  const [queued, setQueued] = useState<QueuedMark[]>([]);
  const [selected, setSelected] = useState<{ academyId: string; sessionId: string } | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  const load = useCallback(async () => {
    try {
      const store = getOfflineStore();
      await purgeExpiredSnapshots(store);
      const userId = await resolveUserId();
      setSnapshots(userId ? await getFreshSnapshots(store, userId) : []);
      setQueued(await store.listQueued());
    } catch {
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    void load();

    const wanted = new URLSearchParams(window.location.search).get("sesion");
    const onOnline = () => {
      setIsOnline(true);
      void (async () => {
        await syncPendingAttendance();
        const userId = await resolveUserId();
        if (userId) {
          for (const snap of await getFreshSnapshots(getOfflineStore(), userId)) {
            await refreshTodaySnapshot(snap.academyId);
          }
        }
        await load();
      })();
    };
    const onOffline = () => setIsOnline(false);
    const onChange = () => void load();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(OFFLINE_ATTENDANCE_EVENT, onChange);

    if (wanted) {
      // Se resuelve la academia de la sesión pedida cuando carguen las listas.
      setSelected({ academyId: "", sessionId: wanted });
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(OFFLINE_ATTENDANCE_EVENT, onChange);
    };
  }, [load]);

  const back = useCallback(() => {
    setSelected(null);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const pick = useCallback((academyId: string, sessionId: string) => {
    setSelected({ academyId, sessionId });
    window.history.replaceState(null, "", `${window.location.pathname}?sesion=${encodeURIComponent(sessionId)}`);
  }, []);

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Cargando la lista guardada…</p>;
  }

  if (selected) {
    for (const snap of snapshots) {
      const session = snap.sessions.find((s) => s.id === selected.sessionId);
      if (session) {
        const statuses = Object.fromEntries(
          Object.entries(session.marks).map(([id, mark]) => [id, mark.status as AttendanceStatus])
        );
        return (
          <div className="px-4 py-4 sm:px-6 sm:py-6">
            <AttendanceSheet
              academyId={snap.academyId}
              sessionId={session.id}
              className={session.className}
              athletes={session.athletes}
              initialStatuses={statuses}
              onBack={back}
            />
          </div>
        );
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1 py-4">
        <h1 className="font-display text-2xl font-bold text-foreground">Pasar lista</h1>
        <p className="flex items-center gap-1 text-sm text-ochre-ink">
          <CloudOff className="h-4 w-4" aria-hidden="true" />
          {isOnline ? "Lista guardada en este móvil" : "Sin conexión · trabajas con la lista guardada en este móvil"}
        </p>
      </header>

      {snapshots.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="font-semibold text-foreground">Todavía no hay ninguna lista guardada en este móvil</p>
          <p className="text-sm text-muted-foreground">
            Abre «Pasar lista» una vez con conexión y Zaltyko guardará las clases de hoy para que puedas
            usarlas sin cobertura.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center rounded-xl bg-zaltyko-teal px-4 text-sm font-semibold text-white"
          >
            Ir a Zaltyko
          </Link>
        </div>
      ) : (
        snapshots.map((snap) => (
          <section key={snap.key} className="space-y-3" aria-label={snap.academyName ?? "Academia"}>
            <p className="text-xs text-muted-foreground">
              {snap.academyName ?? "Academia"} · {snap.date} · guardada a las {timeLabel(snap.savedAt)}
            </p>
            {snap.sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay sesiones guardadas para hoy.</p>
            ) : (
              <ul className="space-y-3">
                {snap.sessions.map((session) => {
                  const marks = mergeMarks(session, queued);
                  const marked = session.athletes.filter((a) => marks[a.id]).length;
                  const pending = Object.values(marks).filter((m) => m.state === "pending").length;
                  return (
                    <li key={session.id}>
                      <button
                        type="button"
                        onClick={() => pick(snap.academyId, session.id)}
                        className="flex min-h-[64px] w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-soft"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-foreground">{session.className}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {session.startTime ? session.startTime.slice(0, 5) : "Sin horario"}
                            {pending > 0 ? ` · ${pending} pendientes de enviar` : ""}
                          </span>
                        </span>
                        <span className="ml-3 flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-zaltyko-teal">
                          {marked}/{session.athletes.length}
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
