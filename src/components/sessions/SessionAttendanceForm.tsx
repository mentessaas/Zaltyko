"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatLongDateForCountry } from "@/lib/date-utils";

type AthleteRow = {
  id: string;
  name: string | null;
};

type AttendanceRow = {
  id: string;
  athleteId: string;
  status: string;
  notes: string | null;
};

const attendanceStatuses = [
  { value: "present", label: "Presente" },
  { value: "absent", label: "Ausente" },
  { value: "late", label: "Tarde" },
  { value: "excused", label: "Justificado" },
];

interface SessionAttendanceFormProps {
  sessionId: string;
  sessionDate: string;
  athletes: AthleteRow[];
  existingAttendance: AttendanceRow[];
  academyCountry?: string | null;
}

export default function SessionAttendanceForm({
  sessionId,
  sessionDate,
  athletes,
  existingAttendance,
  academyCountry,
}: SessionAttendanceFormProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [formState, setFormState] = useState<Record<string, { status: string; notes: string }>>(
    () =>
      existingAttendance.reduce<Record<string, { status: string; notes: string }>>(
        (acc, record) => {
          acc[record.athleteId] = {
            status: record.status,
            notes: record.notes ?? "",
          };
          return acc;
        },
        {}
      )
  );

  const filteredAthletes = useMemo(() => {
    if (!searchTerm.trim()) return athletes;
    const term = searchTerm.toLowerCase();
    return athletes.filter((athlete) => athlete.name?.toLowerCase().includes(term));
  }, [athletes, searchTerm]);

  const updateAttendance = (athleteId: string, field: "status" | "notes", value: string) => {
    setFormState((prev) => ({
      ...prev,
      [athleteId]: {
        status: field === "status" ? value : prev[athleteId]?.status ?? "present",
        notes: field === "notes" ? value : prev[athleteId]?.notes ?? "",
      },
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    try {
      const entries = Object.entries(formState)
        .filter(([athleteId]) => athletes.some((athlete) => athlete.id === athleteId))
        .map(([athleteId, data]) => ({
          athleteId,
          status: data.status,
          notes: data.notes || undefined,
        }));

      if (entries.length === 0) {
        setStatusMessage("No hay cambios para guardar.");
        setSaving(false);
        return;
      }

      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          entries,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "No se pudo guardar la asistencia.");
      }

      setStatusMessage("Asistencia guardada correctamente.");
    } catch (error) {
      console.error(error);
      setStatusMessage(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border bg-card p-6 shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Registro de asistencia</h2>
          <p className="text-sm text-muted-foreground">
            Marca el estado de cada atleta para la sesión del {formatLongDateForCountry(sessionDate, academyCountry)}. Puedes añadir notas
            puntuales por atleta.
          </p>
        </div>
        <Input
          placeholder="Buscar atleta..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="w-full max-w-xs"
        />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Atleta</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Notas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredAthletes.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  No hay atletas que coincidan con el filtro.
                </td>
              </tr>
            ) : (
              filteredAthletes.map((athlete) => {
                const state = formState[athlete.id] ?? { status: "present", notes: "" };
                return (
                  <tr key={athlete.id} className="bg-background">
                    <td className="px-4 py-3">
                      <span className="font-medium">{athlete.name ?? "Sin nombre"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={state.status}
                        onChange={(event) =>
                          updateAttendance(athlete.id, "status", event.target.value)
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm"
                      >
                        {attendanceStatuses.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Textarea
                        value={state.notes}
                        placeholder="Notas opcionales"
                        onChange={(event) =>
                          updateAttendance(athlete.id, "notes", event.target.value)
                        }
                        rows={2}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <Button type="submit" disabled={saving || athletes.length === 0}>
          {saving ? "Guardando..." : "Guardar asistencia"}
        </Button>
        {statusMessage && <p className="text-sm text-emerald-600">{statusMessage}</p>}
      </div>
    </form>
  );
}


