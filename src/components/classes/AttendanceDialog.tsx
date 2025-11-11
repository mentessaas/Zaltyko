"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";

type AttendanceStatus = "present" | "absent" | "late" | "excused";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Presente" },
  { value: "absent", label: "Ausente" },
  { value: "late", label: "Tarde" },
  { value: "excused", label: "Justificada" },
];

interface AthleteOption {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
}

interface AttendanceDialogProps {
  sessionId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  athletes: AthleteOption[];
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
}: AttendanceDialogProps) {
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("");
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
        (data.items as AttendanceRecord[]).forEach((record) => {
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
      if (!needle) {
        return true;
      }
      return athlete.name.toLowerCase().includes(needle);
    });
  }, [athletes, search, groupFilter]);

  const groupOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string | null }>();
    athletes.forEach((athlete) => {
      if (athlete.groupId && !map.has(athlete.groupId)) {
        map.set(athlete.groupId, {
          id: athlete.groupId,
          name: athlete.groupName ?? "Grupo sin nombre",
          color: athlete.groupColor ?? null,
        });
      }
    });
    return Array.from(map.values());
  }, [athletes]);

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
      setError("Registra al menos un atleta para guardar.");
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
          throw new Error(data.error ?? "No se pudo guardar la asistencia.");
        }

        onSaved();
        onClose();
      } catch (err: any) {
        setError(err.message ?? "Error al guardar la asistencia.");
      }
    });
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Registrar asistencia"
      description="Marca el estado de cada atleta para esta sesión."
      widthClassName="w-full max-w-4xl"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="attendance-form"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Guardando…" : "Guardar asistencia"}
          </button>
        </div>
      }
    >
      <form id="attendance-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder="Buscar atleta"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-[220px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <select
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
            className="min-w-[200px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Todos los grupos</option>
            {groupOptions.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const updated: Record<string, AttendanceStatus> = {};
              athletes.forEach((athlete) => {
                updated[athlete.id] = "present";
              });
              setStatusMap(updated);
            }}
            className="rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Marcar todos presentes
          </button>
        </div>

        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-2">
          {filteredAthletes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No se encontraron atletas con ese criterio.
            </p>
          )}
          {filteredAthletes.map((athlete) => (
            <div
              key={athlete.id}
              className="rounded-md border border-border/70 bg-background px-4 py-3 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{athlete.name}</p>
                  <p className="text-xs text-muted-foreground">{athlete.id}</p>
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
                  className="min-w-[140px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                  className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}


