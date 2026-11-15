"use client";

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";

import { requestOfflineShellCache } from "@/lib/offline-attendance/shell";

/**
 * Guarda en este móvil la lista de las sesiones de hoy (y la pantalla sin
 * conexión) cada vez que se abre «Pasar lista» con red.
 */
export function TodaySnapshotSaver({ academyId }: { academyId: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const runtime = await import("@/lib/offline-attendance/runtime");
        // Primero lo pendiente, para que la lista guardada ya lo incluya.
        await runtime.syncPendingAttendance();
        const snapshot = await runtime.refreshTodaySnapshot(academyId);
        if (snapshot && !cancelled) {
          setSaved(true);
          await requestOfflineShellCache();
        }
      } catch {
        // Si no se puede guardar, pasar lista sigue funcionando con red.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  if (!saved) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="offline-list-saved">
      <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
      Lista de hoy guardada en este móvil para pasar lista sin cobertura.
    </p>
  );
}
