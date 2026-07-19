"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import type { SportConfigOption } from "@/components/groups/types";
import { getTerminology, getTerminologyForSportConfig } from "@/lib/sport-config/terminology";

type AttendanceStatus = "present" | "absent" | "late" | "excused";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Presente" },
  { value: "absent", label: "Ausente" },
  { value: "late", label: "Tarde" },
  { value: "excused", label: "Justificada" },
];

const fieldClassName =
  "rounded-card border border-zaltyko-mist bg-white px-3 py-2 text-sm shadow-none focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15";

interface AthleteOption {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  primarySportConfigId?: string | null;
  groupSportConfigId?: string | null;
}

interface AttendanceDialogProps {
  sessionId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  athletes: AthleteOption[];
  sportConfigs?: SportConfigOption[];
}

interface AttendanceRecord {
  athleteId: string;
  status: AttendanceStatus;
  notes?: string | null;
}

export function AttendanceDialog({
  sessionId,
  open,
  onClose,
  onSaved,
  athletes,
  sportConfigs = [],
}: AttendanceDialogProps) {
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("");
  const [sportConfigFilter, setSportConfigFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !sessionId) return;
    const abortController = new AbortController();

    const fetchAttendance = async () => {
      try {
        const response = await fetch(`/api/attendance?sessionId=${sessionId}`, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error("No se pudo cargar la asistencia previa.");
        }
        const data = await response.json();
        const newStatus: Record<string, AttendanceStatus> = {};
        const newNotes: Record<string, string> = {};
        ((data.data?.items ?? data.items ?? []) as AttendanceRecord[]).forEach((record) => {
          newStatus[record.athleteId] = record.status;
          if (record.notes) {
            newNotes[record.athleteId] = record.notes;
          }
        });
        setStatusMap(newStatus);
        setNotesMap(newNotes);
        setError(null);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError((err as Error).message ?? "Error al cargar la asistencia.");
        }
      }
    };

    fetchAttendance();
    return () => abortController.abort();
  }, [open, sessionId]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setStatusMap({});
      setNotesMap({});
      setError(null);
      setGroupFilter("");
      setSportConfigFilter("");
    }
  }, [open]);

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const filteredAthletes = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return athletes.filter((athlete) => {
      if (groupFilter && athlete.groupId !== groupFilter) {
        return false;
      }
      const athleteSportConfigId = athlete.primarySportConfigId ?? athlete.groupSportConfigId ?? "";
      if (sportConfigFilter && athleteSportConfigId !== sportConfigFilter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return athlete.name.toLowerCase().includes(needle);
    });
  }, [athletes, search, groupFilter, sportConfigFilter]);

  const terms = getTerminologyForSportConfig(sportConfigs, sportConfigFilter);
  const athleteTermLower = terms.athlete.toLowerCase();
  const athleteTermPluralLower = terms.athletes.toLowerCase();
  const groupTermLower = terms.group.toLowerCase();
  const attendanceTermLower = terms.attendance.toLowerCase();

  const groupOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string | null }>();
    athletes.forEach((athlete) => {
      if (athlete.groupId && !map.has(athlete.groupId)) {
        map.set(athlete.groupId, {
          id: athlete.groupId,
          name: athlete.groupName ?? `${terms.group} sin nombre`,
          color: athlete.groupColor ?? null,
        });
      }
    });
    return Array.from(map.values());
  }, [athletes, terms.group]);

  const sportConfigOptions = useMemo(() => {
    const ids = new Set<string>();
    athletes.forEach((athlete) => {
      const sportConfigId = athlete.primarySportConfigId ?? athlete.groupSportConfigId;
      if (sportConfigId) ids.add(sportConfigId);
    });
    return Array.from(ids);
  }, [athletes]);
  const sportConfigLabelById = useMemo(
    () =>
      new Map(
        sportConfigs.map((config) => [
          config.id,
          `${config.branchName} · ${config.disciplineName}`,
        ])
      ),
    [sportConfigs]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionId) {
      setError("No se encontró la sesión.");
      return;
    }

    const entries: AttendanceRecord[] = athletes
      .filter((athlete) => statusMap[athlete.id])
      .map((athlete) => ({
        athleteId: athlete.id,
        status: statusMap[athlete.id],
        notes: notesMap[athlete.id] || undefined,
      }));

    if (entries.length === 0) {
      setError(`Registra al menos un ${athleteTermLower} para guardar.`);
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/attendance", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId,
            entries,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? `No se pudo guardar la ${attendanceTermLower}.`);
        }

        onSaved();
        onClose();
      } catch (err: unknown) {
        setError((err instanceof Error ? err.message : "Error desconocido") ?? `Error al guardar la ${attendanceTermLower}.`);
      }
    });
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Registrar ${attendanceTermLower}`}
      description={`Marca el estado de cada ${athleteTermLower} para esta sesión.`}
      widthClassName="w-full max-w-4xl"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="min-h-11 rounded-xl border border-zaltyko-indigo px-4 py-2 text-sm font-medium text-zaltyko-indigo transition hover:bg-zaltyko-indigo/5 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="attendance-form"
            className="min-h-11 rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Guardando…" : `Guardar ${attendanceTermLower}`}
          </button>
        </div>
      }
    >
      <form id="attendance-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-zaltyko-coral/35 bg-zaltyko-coral/10 px-3 py-2 text-sm text-zaltyko-coral">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder={`Buscar ${athleteTermLower}`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={`${fieldClassName} min-w-[220px] flex-1`}
          />
          <select
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
            className={`${fieldClassName} min-w-[200px]`}
          >
            <option value="">Todos los {groupTermLower}s</option>
            {groupOptions.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          {sportConfigOptions.length > 1 && (
            <select
              value={sportConfigFilter}
              onChange={(event) => setSportConfigFilter(event.target.value)}
              className={`${fieldClassName} min-w-[200px]`}
            >
              <option value="">Todas las ramas</option>
              {sportConfigOptions.map((sportConfigId) => (
                <option key={sportConfigId} value={sportConfigId}>
                  {sportConfigLabelById.get(sportConfigId) ?? `Rama ${sportConfigId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => {
              const updated: Record<string, AttendanceStatus> = {};
              athletes.forEach((athlete) => {
                updated[athlete.id] = "present";
              });
              setStatusMap(updated);
            }}
            className="min-h-11 rounded-xl border border-zaltyko-teal/25 bg-zaltyko-teal/10 px-3 py-2 text-xs font-semibold text-zaltyko-teal transition hover:bg-zaltyko-teal/15"
          >
            Marcar todos presentes
          </button>
        </div>

        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-2">
          {filteredAthletes.length === 0 && (
            <p className="text-sm text-zaltyko-text-secondary">
              No se encontraron {athleteTermPluralLower} con ese criterio.
            </p>
          )}
          {filteredAthletes.map((athlete) => (
            <div
              key={athlete.id}
              className="rounded-xl border border-zaltyko-mist/70 bg-white px-4 py-3 shadow-soft"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zaltyko-navy">{athlete.name}</p>
                  <p className="text-xs text-zaltyko-text-secondary">{athlete.id}</p>
                  {athlete.groupName && (
                    <span
                      className="mt-1 inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide"
                      style={
                        athlete.groupColor
                          ? {
                              borderColor: athlete.groupColor,
                              color: athlete.groupColor,
                            }
                          : undefined
                      }
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: athlete.groupColor ?? "currentColor" }}
                      />
                      {athlete.groupName}
                    </span>
                  )}
                </div>
                <select
                  value={statusMap[athlete.id] ?? ""}
                  onChange={(event) =>
                    setStatusMap((prev) => ({
                      ...prev,
                      [athlete.id]: event.target.value as AttendanceStatus,
                    }))
                  }
                  className={`${fieldClassName} min-w-[140px]`}
                >
                  <option value="">Sin registrar</option>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {statusMap[athlete.id] && (
                <textarea
                  value={notesMap[athlete.id] ?? ""}
                  onChange={(event) =>
                    setNotesMap((prev) => ({
                      ...prev,
                      [athlete.id]: event.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="Notas adicionales…"
                  className={`${fieldClassName} mt-3 w-full text-xs`}
                />
              )}
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}
