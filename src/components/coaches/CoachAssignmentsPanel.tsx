"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CoachSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  academyId: string;
  academyName: string | null;
  createdAt: Date | null;
  classes: Array<{ id: string; name: string | null; academyId: string }>;
};

type ClassGroup = {
  academyId: string;
  academyName: string | null;
  classes: Array<{ id: string; name: string | null }>;
};

interface CoachAssignmentsPanelProps {
  tenantId: string;
  coaches: CoachSummary[];
  classGroups: ClassGroup[];
}

export default function CoachAssignmentsPanel({
  tenantId,
  coaches,
  classGroups,
}: CoachAssignmentsPanelProps) {
  const [filter, setFilter] = useState("");
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(
    coaches[0]?.id ?? null
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredCoaches = useMemo(() => {
    if (!filter.trim()) return coaches;
    const term = filter.toLowerCase();
    return coaches.filter(
      (coach) =>
        coach.name.toLowerCase().includes(term) ||
        (coach.email && coach.email.toLowerCase().includes(term))
    );
  }, [coaches, filter]);

  const selectedCoach = useMemo(
    () => coaches.find((coach) => coach.id === selectedCoachId) ?? null,
    [coaches, selectedCoachId]
  );

  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(
    selectedCoach?.classes.map((item) => item.id) ?? []
  );

  // Re-sync selected class IDs when the coach changes.
  useEffect(() => {
    if (selectedCoach) {
      setSelectedClassIds(selectedCoach.classes.map((item) => item.id));
    }
  }, [selectedCoach]);

  const toggleAssignment = (classId: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  };

  const handleSave = async () => {
    if (!selectedCoach) return;
    setSaving(true);
    setStatusMessage(null);

    try {
      const response = await fetch(
        `/api/coaches/${selectedCoach.id}/assignments`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classIds: selectedClassIds }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "No se pudo actualizar las asignaciones.");
      }

      setStatusMessage("Asignaciones guardadas correctamente.");
    } catch (error) {
      console.error(error);
      setStatusMessage(
        error instanceof Error ? error.message : "Error inesperado al guardar."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <aside className="rounded-lg border bg-card p-4 shadow">
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Entrenadores ({coaches.length})</h2>
            <p className="text-sm text-muted-foreground">
              Filtra por nombre o correo para encontrar un entrenador rápidamente.
            </p>
          </div>
          <Input
            placeholder="Buscar entrenador..."
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <ul className="space-y-2">
            {filteredCoaches.map((coach) => (
              <li key={coach.id}>
                <button
                  type="button"
                  onClick={() => setSelectedCoachId(coach.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                    coach.id === selectedCoachId
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  <span className="font-medium">{coach.name}</span>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    {coach.email ?? "sin correo"}
                  </span>
                </button>
              </li>
            ))}
            {filteredCoaches.length === 0 && (
              <li className="text-sm text-muted-foreground">
                No se encontró ningún entrenador con ese criterio.
              </li>
            )}
          </ul>
        </div>
      </aside>

      <section className="space-y-6 rounded-lg border bg-card p-6 shadow">
        {classGroups.length === 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No hay clases disponibles en este tenant. Crea una clase desde el módulo de clases
            para asignarla a entrenadores.
          </div>
        )}
        {selectedCoach ? (
          <>
            <header className="space-y-1">
              <h2 className="text-xl font-semibold">{selectedCoach.name}</h2>
              <p className="text-sm text-muted-foreground">
                Academia base: {selectedCoach.academyName ?? "Sin academia"}
              </p>
              <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Correo
                  </Label>
                  <p>{selectedCoach.email ?? "No registrado"}</p>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Teléfono
                  </Label>
                  <p>{selectedCoach.phone ?? "No registrado"}</p>
                </div>
              </div>
            </header>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Asignar clases</h3>
                <p className="text-sm text-muted-foreground">
                  Marca las clases donde este entrenador participará. Los cambios impactan en el
                  calendario y la toma de asistencia.
                </p>
              </div>
              <div className="space-y-4">
                {classGroups.map((group) => (
                  <div key={group.academyId} className="rounded-md border border-dashed p-3">
                    <p className="text-sm font-semibold">
                      {group.academyName ?? "Academia sin nombre"}
                    </p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {group.classes.map((classItem) => (
                        <label
                          key={classItem.id}
                          className="flex items-center gap-2 rounded-md border border-transparent px-2 py-2 text-sm hover:border-emerald-300"
                        >
                          <input
                            type="checkbox"
                            checked={selectedClassIds.includes(classItem.id)}
                            onChange={() => toggleAssignment(classItem.id)}
                          />
                          <span>{classItem.name ?? "Clase sin nombre"}</span>
                        </label>
                      ))}
                      {group.classes.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Aún no hay clases en esta academia.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {classGroups.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No hay clases creadas en este tenant. Crea algunas clases primero para asignarlas.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <Button onClick={handleSave} disabled={saving || classGroups.length === 0}>
                {saving ? "Guardando..." : "Guardar asignaciones"}
              </Button>
              {statusMessage && (
                <p className="text-sm text-emerald-600">{statusMessage}</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Selecciona un entrenador de la lista para ver detalles y asignarle clases.
          </p>
        )}
      </section>
    </div>
  );
}


