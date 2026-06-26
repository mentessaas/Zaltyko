"use client";

import { FormEvent, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { createClient } from "@/lib/supabase/client";

const fieldClassName =
  "rounded-[10px] border border-zaltyko-mist bg-white px-3 py-2 text-sm shadow-none focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15";

interface AthleteOption {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
}

interface AddAthleteToClassDialogProps {
  classId: string;
  academyId: string;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  athletes: AthleteOption[];
  existingAthleteIds: string[]; // IDs de atletas que ya están en la clase (por grupo o extra)
  athleteLabel?: string;
  athletesLabel?: string;
  groupLabel?: string;
  classLabel?: string;
}

export function AddAthleteToClassDialog({
  classId,
  academyId,
  open,
  onClose,
  onAdded,
  athletes,
  existingAthleteIds,
  athleteLabel = "Atleta",
  athletesLabel = "Atletas",
  groupLabel = "Grupo",
  classLabel = "Clase",
}: AddAthleteToClassDialogProps) {
  const toast = useToast();
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const athleteTermLower = athleteLabel.toLowerCase();
  const athletesTermLower = athletesLabel.toLowerCase();
  const groupTermLower = groupLabel.toLowerCase();
  const classTermLower = classLabel.toLowerCase();

  // Filtrar atletas disponibles (excluir los que ya están en la clase)
  const availableAthletes = athletes.filter((athlete) => !existingAthleteIds.includes(athlete.id));

  // Filtrar por búsqueda y grupo
  const filteredAthletes = availableAthletes.filter((athlete) => {
    const matchesSearch = search.trim() === "" || athlete.name.toLowerCase().includes(search.toLowerCase());
    const matchesGroup = groupFilter === "" || athlete.groupId === groupFilter;
    return matchesSearch && matchesGroup;
  });

  // Obtener grupos únicos para el filtro
  const groups = Array.from(
    new Map(
      availableAthletes
        .filter((a) => a.groupId && a.groupName)
        .map((a) => [a.groupId!, { id: a.groupId!, name: a.groupName! }])
    ).values()
  );

  const toggleAthlete = (athleteId: string) => {
    setSelectedAthleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(athleteId)) {
        next.delete(athleteId);
      } else {
        next.add(athleteId);
      }
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (selectedAthleteIds.size === 0) {
      setError(`Selecciona al menos un ${athleteTermLower} para añadir.`);
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-academy-id": academyId,
        };

        if (currentUser?.id) {
        }

        // Crear enrollments para cada atleta seleccionado
        const promises = Array.from(selectedAthleteIds).map((athleteId) =>
          fetch("/api/class-enrollments", {
            method: "POST",
            headers,
            body: JSON.stringify({
              academyId,
              classId,
              athleteId,
            }),
          })
        );

        const results = await Promise.allSettled(promises);
        const errors: string[] = [];
        const scheduleConflicts: string[] = [];

        for (let index = 0; index < results.length; index++) {
          const result = results[index];
          if (result.status === "rejected") {
            errors.push(`Error al añadir ${athleteTermLower}: ${result.reason}`);
          } else if (!result.value.ok) {
            const athleteId = Array.from(selectedAthleteIds)[index];
            const athlete = athletes.find((a) => a.id === athleteId);
            
            try {
              const errorData = await result.value.json();
              if (errorData.error === "SCHEDULE_CONFLICT") {
                scheduleConflicts.push(errorData.message || `Conflicto de horario para ${athlete?.name ?? `el ${athleteTermLower}`}`);
              } else {
                errors.push(`No se pudo añadir a ${athlete?.name ?? `el ${athleteTermLower}`}: ${errorData.message || "Error desconocido"}`);
              }
            } catch {
              errors.push(`No se pudo añadir a ${athlete?.name ?? `el ${athleteTermLower}`}`);
            }
          }
        }

        if (scheduleConflicts.length > 0) {
          setError(scheduleConflicts.join(". "));
          return;
        }

        if (errors.length > 0) {
          setError(errors.join(". "));
          return;
        }

        const successCount = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
        toast.pushToast({
          title: `${athletesLabel} añadidos`,
          description: `Se añadieron ${successCount} ${successCount === 1 ? athleteTermLower : athletesTermLower} a la ${classTermLower}.`,
          variant: "success",
        });

        setSelectedAthleteIds(new Set());
        setSearch("");
        setGroupFilter("");
        onAdded();
        onClose();
      } catch (err: unknown) {
        setError((err instanceof Error ? err.message : "Error desconocido") ?? `Error desconocido al añadir ${athletesTermLower}.`);
      }
    });
  };

  const handleClose = () => {
    if (isPending) return;
    setError(null);
    setSelectedAthleteIds(new Set());
    setSearch("");
    setGroupFilter("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Añadir ${athletesTermLower} extra a la ${classTermLower}`}
      description={`Selecciona los ${athletesTermLower} que quieres añadir como ${classTermLower} extra. Los ${athletesTermLower} que ya están en la ${classTermLower} por ${groupTermLower} base no aparecen en esta lista.`}
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
            form="add-athlete-form"
            className="min-h-11 rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || selectedAthleteIds.size === 0}
          >
            {isPending ? "Añadiendo..." : `Añadir ${selectedAthleteIds.size} ${selectedAthleteIds.size === 1 ? athleteTermLower : athletesTermLower}`}
          </button>
        </div>
      }
    >
      <form id="add-athlete-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-zaltyko-coral/35 bg-zaltyko-coral/10 px-3 py-2 text-sm text-zaltyko-coral">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Buscar por nombre..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${fieldClassName} flex-1`}
            />
            {groups.length > 0 && (
              <select
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
                className={`${fieldClassName} min-w-[160px]`}
              >
                <option value="">Todos los {groupTermLower}s</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-zaltyko-text-secondary">
          <span>
            {selectedAthleteIds.size} {selectedAthleteIds.size === 1 ? athleteTermLower : athletesTermLower} seleccionado{selectedAthleteIds.size !== 1 ? "s" : ""}
          </span>
          {selectedAthleteIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedAthleteIds(new Set())}
              className="font-medium text-zaltyko-teal hover:underline"
            >
              Limpiar selección
            </button>
          )}
        </div>

        <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white p-3">
          {filteredAthletes.length === 0 ? (
            <p className="text-sm text-zaltyko-text-secondary">
              {availableAthletes.length === 0
                ? `Todos los ${athletesTermLower} de la academia ya están en esta ${classTermLower}.`
                : `No hay ${athletesTermLower} que coincidan con los filtros.`}
            </p>
          ) : (
            filteredAthletes.map((athlete) => (
              <label
                key={athlete.id}
                className="flex items-center gap-3 rounded-xl border border-zaltyko-mist/70 bg-white px-3 py-2 transition hover:border-zaltyko-teal/40"
              >
                <input
                  type="checkbox"
                  checked={selectedAthleteIds.has(athlete.id)}
                  onChange={() => toggleAthlete(athlete.id)}
                  className="h-4 w-4 rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
                />
                <div className="flex flex-1 flex-col">
                  <span className="font-medium text-zaltyko-navy">{athlete.name}</span>
                  {athlete.groupName && (
                    <span className="text-xs text-zaltyko-text-secondary">
                      {groupLabel} principal: {athlete.groupName}
                    </span>
                  )}
                </div>
              </label>
            ))
          )}
        </div>
      </form>
    </Modal>
  );
}
