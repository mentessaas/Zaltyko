"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { recordMark } from "@/lib/offline-attendance/queue";
import { OFFLINE_ATTENDANCE_EVENT } from "@/lib/offline-attendance/events";
import { hasOfflineAttendanceData } from "@/lib/offline-attendance/sign-out";
import type { AttendanceStatus, QueuedMark } from "@/lib/offline-attendance/types";

export interface OwnerConfirmedMark {
  enrollmentId: string;
  status: AttendanceStatus;
  recordedAt: string | null;
}

export interface OwnerOfflineMarks {
  /** Marcas de esta sesión que aún no confirma el servidor, por inscripción. */
  byEnrollment: Record<string, { status: AttendanceStatus; state: "pending" | "failed" }>;
  pendingCount: number;
  failedCount: number;
  isOnline: boolean;
  /** Guarda la marca en el móvil y la envía en cuanto haya red. */
  enqueue: (
    enrollmentId: string,
    status: AttendanceStatus,
    seenRecordedAt: string | null
  ) => Promise<boolean>;
}

/**
 * Cola sin conexión de la pantalla de asistencia de /owner. No toca el envío
 * en línea (que sigue con su clave de idempotencia por marca): solo recoge las
 * marcas hechas sin red, avisa de cuáles están «Pendientes de enviar» y
 * refresca la pantalla cuando el móvil las envía al volver la conexión.
 */
export function useOwnerOfflineMarks(options: {
  organizationId: string;
  sessionId: string;
  /** El servidor confirmó marcas de esta sesión (aplicadas o ya guardadas). */
  onConfirmed?: (marks: OwnerConfirmedMark[]) => void;
  /** El servidor conservó una marca más reciente de otro dispositivo. */
  onSuperseded?: () => void;
}): OwnerOfflineMarks {
  const { organizationId, sessionId } = options;
  const [queued, setQueued] = useState<QueuedMark[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const mounted = useRef(true);
  const callbacks = useRef({ onConfirmed: options.onConfirmed, onSuperseded: options.onSuperseded });
  callbacks.current = { onConfirmed: options.onConfirmed, onSuperseded: options.onSuperseded };

  const reload = useCallback(async () => {
    // Sin nada guardado en este móvil no hay cola que leer ni usuaria que
    // buscar: la pantalla en línea no hace ningún trabajo extra.
    if (!sessionId || !hasOfflineAttendanceData()) {
      if (mounted.current) setQueued([]);
      return;
    }
    try {
      const runtime = await import("@/lib/offline-attendance/runtime");
      const userId = await runtime.resolveUserId();
      const all = await runtime.getOfflineStore().listQueued();
      if (mounted.current) {
        setQueued(
          all.filter(
            (m) => m.source === "owner" && m.sessionId === sessionId && m.userId === userId
          )
        );
      }
    } catch {
      // Sin almacén local no hay cola; la pantalla sigue con lo del servidor.
    }
  }, [sessionId]);

  useEffect(() => {
    mounted.current = true;
    setIsOnline(navigator.onLine);
    void reload();

    const onOnline = () => {
      setIsOnline(true);
      // Vuelve la red: se envía lo pendiente sin esperar a recargar la página
      // (el envío es seguro de lanzar varias veces a la vez).
      if (hasOfflineAttendanceData()) {
        void import("@/lib/offline-attendance/runtime")
          .then((runtime) => runtime.syncPendingAttendance())
          .catch(() => undefined);
      }
    };
    const onOffline = () => setIsOnline(false);
    const onChange = (event: Event) => {
      const flush = (
        event as CustomEvent<{
          flush?: {
            confirmed: Array<QueuedMark & { serverRecordedAt?: string }>;
            supersededMarks: QueuedMark[];
          };
        }>
      ).detail?.flush;
      if (flush) {
        const confirmed = flush.confirmed.filter(
          (m) => m.source === "owner" && m.sessionId === sessionId
        );
        if (confirmed.length > 0) {
          callbacks.current.onConfirmed?.(
            confirmed.map((m) => ({
              enrollmentId: m.athleteId,
              status: m.status,
              recordedAt: m.serverRecordedAt ?? null,
            }))
          );
        }
        if (flush.supersededMarks.some((m) => m.source === "owner" && m.sessionId === sessionId)) {
          callbacks.current.onSuperseded?.();
        }
      }
      void reload();
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
  }, [reload, sessionId]);

  const enqueue = useCallback(
    async (enrollmentId: string, status: AttendanceStatus, seenRecordedAt: string | null) => {
      try {
        const runtime = await import("@/lib/offline-attendance/runtime");
        const userId = await runtime.resolveUserId();
        if (!userId) return false;
        await recordMark(runtime.getOfflineStore(), {
          source: "owner",
          userId,
          academyId: organizationId,
          sessionId,
          athleteId: enrollmentId,
          status,
          seenRecordedAt,
        });
        runtime.notifyOfflineAttendanceChanged();
        // Sin red no sale nada; con red en cuanto se pueda.
        void runtime.syncPendingAttendance();
        return true;
      } catch {
        return false;
      }
    },
    [organizationId, sessionId]
  );

  const byEnrollment = useMemo(
    () =>
      Object.fromEntries(
        queued.map((m) => [m.athleteId, { status: m.status, state: m.state }])
      ) as OwnerOfflineMarks["byEnrollment"],
    [queued]
  );

  return {
    byEnrollment,
    pendingCount: queued.filter((m) => m.state === "pending").length,
    failedCount: queued.filter((m) => m.state === "failed").length,
    isOnline,
    enqueue,
  };
}
