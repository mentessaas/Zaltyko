"use client";

import { useEffect } from "react";

import { hasOfflineAttendanceData } from "@/lib/offline-attendance/sign-out";

const RETRY_MS = 45_000;

/**
 * Se queda vigilando en segundo plano, pero solo si en este móvil se guardó
 * algo de pasar lista (no pesa en las páginas públicas):
 *  - envía lo pendiente al volver la red o al volver a la app;
 *  - al cerrar la sesión borra las listas y conserva las marcas sin enviar;
 *  - borra lo caducado (listas y marcas) al arrancar.
 */
export function OfflineAttendanceBoot() {
  useEffect(() => {
    if (!hasOfflineAttendanceData()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;
    const cleanups: Array<() => void> = [];

    void (async () => {
      const runtime = await import("@/lib/offline-attendance/runtime");
      const { createClient } = await import("@/lib/supabase/client");
      if (cancelled) return;

      const sync = () => void runtime.syncPendingAttendance();
      // Caducidad al arrancar la app: no depende de abrir «Pasar lista».
      await runtime.expireStoredAttendance();
      sync();

      window.addEventListener("online", sync);
      cleanups.push(() => window.removeEventListener("online", sync));
      const onVisible = () => {
        if (document.visibilityState === "visible") sync();
      };
      document.addEventListener("visibilitychange", onVisible);
      cleanups.push(() => document.removeEventListener("visibilitychange", onVisible));

      timer = setInterval(() => {
        void runtime.pendingAttendanceCount().then((n) => {
          if (n > 0) sync();
        });
      }, RETRY_MS);

      try {
        const { data } = createClient().auth.onAuthStateChange((event) => {
          // Sesión caducada u otro cierre: se borran las listas (nombres) pero
          // se conservan las marcas sin enviar de esa usuaria hasta que vuelva
          // a entrar. Los botones de «Cerrar sesión» ya avisaron antes.
          if (event === "SIGNED_OUT") void runtime.clearOfflineAttendanceData({ keepQueue: true });
        });
        unsubscribe = () => data.subscription.unsubscribe();
      } catch {
        // sin cliente de Supabase no hay evento de cierre de sesión que escuchar
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      unsubscribe?.();
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
