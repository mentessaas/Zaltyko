"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, Clock, CloudOff, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { useAttendanceMarks } from "@/hooks/useAttendanceMarks";
import type { AttendanceStatus, SnapshotMark } from "@/lib/offline-attendance/types";

interface AttendanceAthlete {
  id: string;
  name: string;
  groupName: string | null;
}

interface AttendanceSheetProps {
  academyId: string;
  sessionId: string;
  className: string;
  athletes: AttendanceAthlete[];
  initialStatuses: Record<string, AttendanceStatus | undefined>;
  /** Cuándo se guardó cada marca inicial (ISO). */
  initialRecordedAt?: Record<string, string | null>;
  /** Enlace de vuelta (pantalla normal). */
  backHref?: string;
  /** Vuelta sin navegar (pantalla sin conexión). */
  onBack?: () => void;
}

const STATUS_OPTIONS: { key: AttendanceStatus; label: string; icon: typeof Check; activeClass: string }[] = [
  { key: "present", label: "Presente", icon: Check, activeClass: "bg-zaltyko-teal text-white border-zaltyko-teal" },
  { key: "absent", label: "Ausente", icon: X, activeClass: "bg-zaltyko-coral text-white border-zaltyko-coral" },
  { key: "late", label: "Tarde", icon: Clock, activeClass: "bg-zaltyko-navy text-white border-zaltyko-navy" },
  { key: "excused", label: "Justificada", icon: FileText, activeClass: "bg-zaltyko-mist text-foreground border-border" },
];

const BACK_CLASS =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted";

/**
 * Hoja de «Pasar lista». Cada toque se guarda primero en el móvil (cola
 * local) y se envía en cuanto hay red: sin cobertura no se pierde nada. Cada
 * gimnasta muestra si su marca está «Guardada» o «Pendiente de enviar».
 */
export const AttendanceSheet = memo(function AttendanceSheet({
  academyId,
  sessionId,
  className,
  athletes,
  initialStatuses,
  initialRecordedAt,
  backHref,
  onBack,
}: AttendanceSheetProps) {
  const toast = useToast();
  const [serverMarks] = useState<Record<string, SnapshotMark>>(() =>
    Object.fromEntries(
      Object.entries(initialStatuses)
        .filter((entry): entry is [string, AttendanceStatus] => Boolean(entry[1]))
        .map(([athleteId, status]) => [athleteId, { status, recordedAt: initialRecordedAt?.[athleteId] ?? null }])
    )
  );
  const {
    marks,
    pendingCount,
    failedCount,
    isOnline,
    syncing,
    needsLogin,
    supersededNotice,
    mark,
    markMany,
    retry,
  } = useAttendanceMarks({ academyId, sessionId, serverMarks });

  const markOne = useCallback(
    async (athleteId: string, status: AttendanceStatus) => {
      const saved = await mark(athleteId, status);
      if (!saved) {
        toast.pushToast({
          title: "No se pudo guardar la marca en este móvil",
          description: "Vuelve a tocar. Si sigue igual, recarga la página.",
          variant: "error",
        });
      }
    },
    [mark, toast]
  );

  const markAllPresent = useCallback(async () => {
    const pending = athletes.filter((athlete) => !marks[athlete.id]);
    if (pending.length === 0) return;
    const saved = await markMany(
      pending.map((athlete) => athlete.id),
      "present"
    );
    if (saved) {
      toast.pushToast({
        title: isOnline ? "Asistencia guardada" : "Asistencia guardada en este móvil",
        description: isOnline
          ? `${pending.length} gimnasta${pending.length > 1 ? "s" : ""} marcadas como presentes.`
          : "Se enviará sola cuando vuelva la conexión.",
        variant: "success",
      });
    }
  }, [athletes, marks, markMany, toast, isOnline]);

  useEffect(() => {
    if (supersededNotice === 0) return;
    toast.pushToast({
      title: "Otra marca más reciente se ha mantenido",
      description: "Alguien marcó a una gimnasta después que tú. Hemos conservado la última.",
      variant: "info",
    });
    // Solo reacciona al contador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supersededNotice]);

  const marked = athletes.filter((athlete) => marks[athlete.id]).length;

  let saveState: string;
  if (needsLogin && pendingCount > 0) {
    saveState = `${pendingCount} sin enviar · entra de nuevo para enviarlas`;
  } else if (pendingCount > 0) {
    saveState = isOnline
      ? syncing
        ? `Enviando ${pendingCount}…`
        : `${pendingCount} pendientes de enviar`
      : `Sin conexión · ${pendingCount} pendientes de enviar`;
  } else if (failedCount > 0) {
    saveState = "Algunas marcas no se pudieron guardar";
  } else if (!isOnline) {
    saveState = "Sin conexión · lo marcado se guarda en este móvil";
  } else {
    saveState = "Guardado";
  }

  const backContent = <ChevronLeft className="h-5 w-5" />;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <header className="sticky top-0 z-10 -mx-4 border-b-2 border-zaltyko-teal bg-card px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          {onBack ? (
            <button type="button" onClick={onBack} className={BACK_CLASS} aria-label="Volver a las sesiones de hoy">
              {backContent}
            </button>
          ) : (
            <Link href={backHref ?? "/"} className={BACK_CLASS} aria-label="Volver a las sesiones de hoy">
              {backContent}
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-bold text-foreground">{className}</p>
            <p
              className={cn(
                "flex items-center gap-1 text-xs font-medium tabular-nums",
                pendingCount > 0 || failedCount > 0 || !isOnline ? "text-ochre-ink" : "text-muted-foreground"
              )}
              role="status"
              aria-live="polite"
            >
              {!isOnline && <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              <span>
                {marked}/{athletes.length} marcadas · {saveState}
              </span>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-11 shrink-0 border-border"
            onClick={markAllPresent}
            disabled={marked === athletes.length}
          >
            Todas presentes
          </Button>
        </div>
        {needsLogin && pendingCount > 0 && (
          <p className="mt-2 text-xs text-ochre-ink">
            Tu sesión ha caducado. Lo marcado sigue guardado en este móvil;{" "}
            <Link href="/auth/login" className="font-semibold underline">
              entra de nuevo
            </Link>{" "}
            para enviarlo.
          </p>
        )}
        {pendingCount > 0 && isOnline && !syncing && !needsLogin && (
          <button
            type="button"
            onClick={() => void retry()}
            className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-zaltyko-teal underline"
          >
            Enviar ahora
          </button>
        )}
      </header>

      <ul className="flex-1 divide-y divide-zaltyko-mist/60">
        {athletes.map((athlete) => {
          const current = marks[athlete.id];
          return (
            <li key={athlete.id} className="flex items-center gap-3 px-1 py-3 sm:px-0">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{athlete.name}</p>
                {athlete.groupName && (
                  <p className="truncate text-xs text-zaltyko-text-light">{athlete.groupName}</p>
                )}
                {current?.state === "pending" && (
                  <p className="flex items-center gap-1 text-xs font-medium text-ochre-ink">
                    <CloudOff className="h-3 w-3" aria-hidden="true" />
                    Pendiente de enviar
                  </p>
                )}
                {current?.state === "failed" && (
                  <p className="text-xs font-medium text-zaltyko-coral">
                    No se pudo guardar. Revisa que siga en esta clase y vuelve a tocar.
                  </p>
                )}
                {current?.state === "saved" && (
                  <p className="flex items-center gap-1 text-xs text-zaltyko-text-light">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Guardado
                  </p>
                )}
              </div>
              <div className="flex gap-1" role="radiogroup" aria-label={`Asistencia de ${athlete.name}`}>
                {STATUS_OPTIONS.map(({ key, label, icon: Icon, activeClass }) => {
                  const selected = current?.status === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={label}
                      onClick={() => void markOne(athlete.id, key)}
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-lg border transition-colors",
                        selected ? activeClass : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
