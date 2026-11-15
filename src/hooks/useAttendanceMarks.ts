"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { recordMark } from "@/lib/offline-attendance/queue";
import {
  OFFLINE_ATTENDANCE_EVENT,
  getOfflineStore,
  notifyOfflineAttendanceChanged,
  resolveUserId,
  syncPendingAttendance,
  type OfflineAttendanceChange,
} from "@/lib/offline-attendance/runtime";
import { mergeMarks, type DisplayedMark } from "@/lib/offline-attendance/snapshot";
import {
  isAttendanceStatus,
  type AttendanceStatus,
  type QueuedMark,
  type SnapshotMark,
} from "@/lib/offline-attendance/types";

interface Options {
  academyId: string;
  sessionId: string;
  /** Lo que el servidor (o la lista guardada) ya tenía marcado. */
  serverMarks: Record<string, SnapshotMark>;
}

export interface AttendanceMarksState {
  marks: Record<string, DisplayedMark>;
  /** Marcas hechas aquí que aún no confirma el servidor. */
  pendingCount: number;
  /** Marcas que el servidor rechazó (ya no están en la clase, sin permiso…). */
  failedCount: number;
  isOnline: boolean;
  syncing: boolean;
  /** La sesión caducó: hay que entrar de nuevo para poder enviar. */
  needsLogin: boolean;
  /** Hubo marcas descartadas por haber otra más reciente de otro dispositivo. */
  supersededNotice: number;
  mark: (athleteId: string, status: AttendanceStatus) => Promise<boolean>;
  markMany: (athleteIds: string[], status: AttendanceStatus) => Promise<boolean>;
  retry: () => Promise<void>;
}

export function useAttendanceMarks({ academyId, sessionId, serverMarks }: Options): AttendanceMarksState {
  const [server, setServer] = useState<Record<string, SnapshotMark>>(serverMarks);
  const [queued, setQueued] = useState<QueuedMark[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [supersededNotice, setSupersededNotice] = useState(0);
  const mounted = useRef(true);
  const serverRef = useRef(server);
  serverRef.current = server;

  const reloadQueue = useCallback(async () => {
    try {
      const userId = await resolveUserId();
      const all = await getOfflineStore().listQueued();
      // Solo las marcas de esta sesión y de esta usuaria.
      if (mounted.current) setQueued(all.filter((m) => m.sessionId === sessionId && m.userId === userId));
    } catch {
      // Sin almacén local no hay cola; la pantalla sigue con lo del servidor.
    }
  }, [sessionId]);

  const reloadServerMarks = useCallback(async () => {
    try {
      const response = await fetch(`/api/attendance?sessionId=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = (await response.json()) as {
        data?: { items?: Array<{ athleteId: string; status: string; recordedAt: string | null }> };
      };
      const next: Record<string, SnapshotMark> = {};
      for (const item of body.data?.items ?? []) {
        if (isAttendanceStatus(item.status)) {
          next[item.athleteId] = { status: item.status, recordedAt: item.recordedAt ?? null };
        }
      }
      if (mounted.current) setServer(next);
    } catch {
      // Sin red: se queda lo que había.
    }
  }, [sessionId]);

  useEffect(() => {
    mounted.current = true;
    setIsOnline(navigator.onLine);
    void reloadQueue();

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onChange = (event: Event) => {
      const flush = (event as CustomEvent<OfflineAttendanceChange>).detail?.flush;
      if (flush) {
        setNeedsLogin(flush.stoppedBecause === "unauthorized");
        const confirmed = flush.confirmed.filter((m) => m.sessionId === sessionId);
        if (confirmed.length > 0) {
          const now = new Date().toISOString();
          setServer((current) => {
            const next = { ...current };
            for (const mark of confirmed) {
              next[mark.athleteId] = { status: mark.status, recordedAt: mark.serverRecordedAt ?? now };
            }
            return next;
          });
        }
        if (flush.supersededMarks.some((m) => m.sessionId === sessionId)) {
          setSupersededNotice((n) => n + 1);
          void reloadServerMarks();
        }
      }
      void reloadQueue();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(OFFLINE_ATTENDANCE_EVENT, onChange);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(OFFLINE_ATTENDANCE_EVENT, onChange);
    };
  }, [reloadQueue, reloadServerMarks, sessionId]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      await syncPendingAttendance();
    } finally {
      if (mounted.current) setSyncing(false);
    }
  }, []);

  const markMany = useCallback(
    async (athleteIds: string[], status: AttendanceStatus) => {
      const userId = await resolveUserId();
      if (!userId) return false;
      const store = getOfflineStore();
      try {
        for (const athleteId of athleteIds) {
          await recordMark(store, {
            userId,
            academyId,
            sessionId,
            athleteId,
            status,
            // Lo que se veía en pantalla: el servidor decide con ello si hubo conflicto.
            seenRecordedAt: serverRef.current[athleteId]?.recordedAt ?? null,
          });
        }
      } catch {
        return false;
      }
      notifyOfflineAttendanceChanged();
      void runSync();
      return true;
    },
    [academyId, sessionId, runSync]
  );

  const mark = useCallback(
    (athleteId: string, status: AttendanceStatus) => markMany([athleteId], status),
    [markMany]
  );

  const marks = useMemo(() => mergeMarks({ id: sessionId, marks: server }, queued), [sessionId, server, queued]);
  const pendingCount = queued.filter((m) => m.state === "pending").length;
  const failedCount = queued.filter((m) => m.state === "failed").length;

  return {
    marks,
    pendingCount,
    failedCount,
    isOnline,
    syncing,
    needsLogin,
    supersededNotice,
    mark,
    markMany,
    retry: runSync,
  };
}
