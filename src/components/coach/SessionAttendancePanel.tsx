"use client";

import { memo, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Search, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  AttendanceStatus,
  SessionWorkspaceAthlete,
  SessionWorkspaceAttendance,
} from "@/components/coach/session-workspace-types";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: Array<{
  value: AttendanceStatus;
  label: string;
  activeClassName: string;
}> = [
  { value: "present", label: "Presente", activeClassName: "border-emerald-600 bg-emerald-600 text-white" },
  { value: "late", label: "Tarde", activeClassName: "border-amber-500 bg-amber-500 text-white" },
  { value: "excused", label: "Justificada", activeClassName: "border-sky-600 bg-sky-600 text-white" },
  { value: "absent", label: "Ausente", activeClassName: "border-rose-600 bg-rose-600 text-white" },
];

interface SessionAttendancePanelProps {
  sessionId: string;
  athletes: SessionWorkspaceAthlete[];
  initialAttendance: SessionWorkspaceAttendance[];
  athleteTerm: string;
  athletesTerm: string;
  attendanceTerm: string;
  onSaved: (registeredCount: number) => void;
}

function SessionAttendancePanelImpl({
  sessionId,
  athletes,
  initialAttendance,
  athleteTerm,
  athletesTerm,
  attendanceTerm,
  onSaved,
}: SessionAttendancePanelProps) {
  const [search, setSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(initialAttendance.map((record) => [record.athleteId, record.status]))
  );
  const [notesMap, setNotesMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialAttendance.map((record) => [record.athleteId, record.notes ?? ""]))
  );

  const filteredAthletes = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("es");
    if (!needle) return athletes;
    return athletes.filter((athlete) => athlete.name.toLocaleLowerCase("es").includes(needle));
  }, [athletes, search]);

  const registeredCount = Object.keys(statusMap).filter((athleteId) =>
    athletes.some((athlete) => athlete.id === athleteId)
  ).length;

  const markAllPresent = () => {
    setStatusMap(Object.fromEntries(athletes.map((athlete) => [athlete.id, "present"] as const)));
    setFeedback(null);
  };

  const saveAttendance = async () => {
    const entries = athletes
      .filter((athlete) => statusMap[athlete.id])
      .map((athlete) => ({
        athleteId: athlete.id,
        status: statusMap[athlete.id],
        notes: notesMap[athlete.id]?.trim() || undefined,
      }));

    if (entries.length === 0) {
      setFeedback({ type: "error", message: `Marca al menos un ${athleteTerm.toLowerCase()}.` });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, entries }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? `No se pudo guardar la ${attendanceTerm.toLowerCase()}.`);
      }
      setFeedback({
        type: "success",
        message: `${attendanceTerm} guardada para ${entries.length} ${entries.length === 1 ? athleteTerm.toLowerCase() : athletesTerm.toLowerCase()}.`,
      });
      onSaved(entries.length);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : `No se pudo guardar la ${attendanceTerm.toLowerCase()}.`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (athletes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zaltyko-mist bg-white p-8 text-center">
        <UsersRound className="mx-auto h-8 w-8 text-zaltyko-text-secondary" aria-hidden="true" />
        <h3 className="mt-3 font-semibold text-zaltyko-navy">La clase todavía no tiene {athletesTerm.toLowerCase()}</h3>
        <p className="mt-1 text-sm text-zaltyko-text-secondary">Añade miembros al grupo o inscripciones extra antes de pasar lista.</p>
      </div>
    );
  }

  return (
    <section className="space-y-5" aria-labelledby="session-attendance-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zaltyko-teal">Paso 1</p>
          <h2 id="session-attendance-title" className="mt-1 text-xl font-semibold text-zaltyko-navy">
            {attendanceTerm} de la sesión
          </h2>
          <p className="mt-1 text-sm text-zaltyko-text-secondary">
            Marca todas presentes y cambia únicamente las excepciones.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={markAllPresent} className="min-h-11 border-emerald-600/30 text-emerald-700">
          <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Marcar todas presentes
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-zaltyko-mist/70 bg-zaltyko-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block flex-1">
          <span className="sr-only">Buscar {athleteTerm.toLowerCase()}</span>
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zaltyko-text-secondary" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Buscar ${athleteTerm.toLowerCase()}…`}
            className="min-h-11 bg-white pl-9"
          />
        </label>
        <p className="text-sm font-medium text-zaltyko-navy" aria-live="polite">
          {registeredCount}/{athletes.length} registradas
        </p>
      </div>

      <div className="space-y-3">
        {filteredAthletes.map((athlete) => (
          <article key={athlete.id} className="rounded-2xl border border-zaltyko-mist/70 bg-white p-4 shadow-soft">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {athlete.groupColor ? (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: athlete.groupColor }} aria-hidden="true" />
                  ) : null}
                  <h3 className="truncate font-semibold text-zaltyko-navy">{athlete.name}</h3>
                </div>
                <p className="mt-1 text-xs text-zaltyko-text-secondary">
                  {[athlete.groupName, athlete.branchName].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={statusMap[athlete.id] === option.value}
                    aria-label={`${athlete.name}: ${option.label}`}
                    onClick={() => {
                      setStatusMap((current) => ({ ...current, [athlete.id]: option.value }));
                      setFeedback(null);
                    }}
                    className={cn(
                      "min-h-11 rounded-xl border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-teal focus-visible:ring-offset-2",
                      statusMap[athlete.id] === option.value
                        ? option.activeClassName
                        : "border-zaltyko-mist bg-white text-zaltyko-text-secondary hover:border-zaltyko-teal/40"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {statusMap[athlete.id] ? (
              <Input
                value={notesMap[athlete.id] ?? ""}
                onChange={(event) => setNotesMap((current) => ({ ...current, [athlete.id]: event.target.value }))}
                placeholder="Nota opcional"
                aria-label={`Nota de asistencia para ${athlete.name}`}
                maxLength={500}
                className="mt-3 min-h-11 bg-zaltyko-white"
              />
            ) : null}
          </article>
        ))}
      </div>

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-zaltyko-mist bg-white/95 p-3 shadow-medium backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div
          aria-live={feedback?.type === "error" ? "assertive" : "polite"}
          role={feedback?.type === "error" ? "alert" : "status"}
          className="min-h-5 text-sm"
        >
          {feedback?.type === "success" ? (
            <span className="inline-flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{feedback.message}</span>
          ) : null}
          {feedback?.type === "error" ? (
            <span className="inline-flex items-center gap-2 text-rose-700"><CircleAlert className="h-4 w-4" aria-hidden="true" />{feedback.message}</span>
          ) : null}
        </div>
        <Button type="button" onClick={saveAttendance} disabled={isSaving || registeredCount === 0} className="min-h-11 sm:min-w-44">
          {isSaving ? "Guardando…" : `Guardar ${attendanceTerm.toLowerCase()}`}
        </Button>
      </div>
    </section>
  );
}

export const SessionAttendancePanel = memo(SessionAttendancePanelImpl);
