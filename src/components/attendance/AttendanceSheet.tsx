"use client";

import Link from "next/link";
import { memo, useCallback, useState, useTransition } from "react";
import { Check, ChevronLeft, Clock, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";

type AttendanceStatus = "present" | "absent" | "late" | "excused";

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
  backHref: string;
}

const STATUS_OPTIONS: { key: AttendanceStatus; label: string; icon: typeof Check; activeClass: string }[] = [
  { key: "present", label: "Presente", icon: Check, activeClass: "bg-zaltyko-teal text-white border-zaltyko-teal" },
  { key: "absent", label: "Ausente", icon: X, activeClass: "bg-zaltyko-coral text-white border-zaltyko-coral" },
  { key: "late", label: "Tarde", icon: Clock, activeClass: "bg-zaltyko-navy text-white border-zaltyko-navy" },
  { key: "excused", label: "Justificada", icon: FileText, activeClass: "bg-zaltyko-mist text-zaltyko-navy border-zaltyko-mist" },
];

export const AttendanceSheet = memo(function AttendanceSheet({
  sessionId,
  className,
  athletes,
  initialStatuses,
  backHref,
}: AttendanceSheetProps) {
  const toast = useToast();
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus | undefined>>(initialStatuses);
  const [isPending, startTransition] = useTransition();
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const saveEntry = useCallback(
    (athleteId: string, status: AttendanceStatus) => {
      setStatuses((current) => ({ ...current, [athleteId]: status }));
      setFailedIds((current) => {
        const next = new Set(current);
        next.delete(athleteId);
        return next;
      });

      startTransition(async () => {
        try {
          const res = await fetch("/api/attendance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              entries: [{ athleteId, status }],
            }),
          });
          if (!res.ok) throw new Error("save failed");
        } catch {
          setFailedIds((current) => new Set(current).add(athleteId));
        }
      });
    },
    [sessionId]
  );

  const markAllPresent = useCallback(() => {
    const pending = athletes.filter((athlete) => !statuses[athlete.id]);
    if (pending.length === 0) return;

    setStatuses((current) => {
      const next = { ...current };
      pending.forEach((athlete) => {
        next[athlete.id] = "present";
      });
      return next;
    });

    startTransition(async () => {
      try {
        const res = await fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            entries: pending.map((athlete) => ({ athleteId: athlete.id, status: "present" })),
          }),
        });
        if (!res.ok) throw new Error("save failed");
        toast.pushToast({
          title: "Asistencia guardada",
          description: `${pending.length} gimnasta${pending.length > 1 ? "s" : ""} marcadas como presentes.`,
          variant: "success",
        });
      } catch {
        setFailedIds((current) => {
          const next = new Set(current);
          pending.forEach((athlete) => next.add(athlete.id));
          return next;
        });
      }
    });
  }, [athletes, statuses, sessionId, toast]);

  const marked = Object.values(statuses).filter(Boolean).length;
  const hasFailures = failedIds.size > 0;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <header className="sticky top-0 z-10 -mx-4 border-b-2 border-zaltyko-teal bg-white px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zaltyko-text-secondary hover:bg-zaltyko-white"
            aria-label="Volver a las sesiones de hoy"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-bold text-zaltyko-navy">{className}</p>
            <p className="text-xs font-medium tabular-nums text-zaltyko-text-secondary">
              {marked}/{athletes.length} marcadas · {isPending ? "Guardando…" : hasFailures ? "Algunas sin guardar" : "Guardado"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-11 shrink-0 border-zaltyko-mist"
            onClick={markAllPresent}
            disabled={marked === athletes.length}
          >
            Todas presentes
          </Button>
        </div>
      </header>

      <ul className="flex-1 divide-y divide-zaltyko-mist/60">
        {athletes.map((athlete) => (
          <li key={athlete.id} className="flex items-center gap-3 px-1 py-3 sm:px-0">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zaltyko-navy">{athlete.name}</p>
              {athlete.groupName && (
                <p className="truncate text-xs text-zaltyko-text-light">{athlete.groupName}</p>
              )}
              {failedIds.has(athlete.id) && (
                <p className="text-xs font-medium text-zaltyko-coral">No se pudo guardar, vuelve a tocar</p>
              )}
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label={`Asistencia de ${athlete.name}`}>
              {STATUS_OPTIONS.map(({ key, label, icon: Icon, activeClass }) => {
                const selected = statuses[athlete.id] === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={label}
                    onClick={() => saveEntry(athlete.id, key)}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-lg border transition-colors",
                      selected ? activeClass : "border-zaltyko-mist text-zaltyko-text-light hover:bg-zaltyko-white"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
});
