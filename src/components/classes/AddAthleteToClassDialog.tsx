"use client";

import { FormEvent, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { createClient } from "@/lib/supabase/client";

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
}

export function AddAthleteToClassDialog({
  classId,
  academyId,
  open,
  onClose,
  onAdded,
  athletes,
  existingAthleteIds,
}: AddAthleteToClassDialogProps) {
  const toast = useToast();
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      setError("Selecciona al menos un atleta para añadir.");
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
          headers["x-user-id"] = currentUser.id;
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
            errors.push(`Error al añadir atleta: ${result.reason}`);
          } else if (!result.value.ok) {
            const athleteId = Array.from(selectedAthleteIds)[index];
            const athlete = athletes.find((a) => a.id === athleteId);
            
            try {
              const errorData = await result.value.json();
              if (errorData.error === "SCHEDULE_CONFLICT") {
                scheduleConflicts.push(errorData.message || `Conflicto de horario para ${athlete?.name ?? "el atleta"}`);
              } else {
                errors.push(`No se pudo añadir a ${athlete?.name ?? "el atleta"}: ${errorData.message || "Error desconocido"}`);
              }
            } catch {
              errors.push(`No se pudo añadir a ${athlete?.name ?? "el atleta"}`);
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
          title: "Atletas añadidos",
          description: `Se añadieron ${successCount} atleta${successCount !== 1 ? "s" : ""} a la clase.`,
          variant: "success",
        });

        setSelectedAthleteIds(new Set());
        setSearch("");
        setGroupFilter("");
        onAdded();
        onClose();
      } catch (err: any) {
        setError(err.message ?? "Error desconocido al añadir atletas.");
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
      title="Añadir atletas extra a la clase"
      description="Selecciona los atletas que quieres añadir como clase extra. Los atletas que ya están en la clase (por grupo base) no aparecen en esta lista."
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
            form="add-athlete-form"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || selectedAthleteIds.size === 0}
          >
            {isPending ? "Añadiendo..." : `Añadir ${selectedAthleteIds.size} atleta${selectedAthleteIds.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      }
    >
      <form id="add-athlete-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-700">
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
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {groups.length > 0 && (
              <select
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
                className="min-w-[160px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Todos los grupos</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {selectedAthleteIds.size} atleta{selectedAthleteIds.size !== 1 ? "s" : ""} seleccionado{selectedAthleteIds.size !== 1 ? "s" : ""}
          </span>
          {selectedAthleteIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedAthleteIds(new Set())}
              className="hover:underline"
            >
              Limpiar selección
            </button>
          )}
        </div>

        <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-3">
          {filteredAthletes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {availableAthletes.length === 0
                ? "Todos los atletas de la academia ya están en esta clase."
                : "No hay atletas que coincidan con los filtros."}
            </p>
          ) : (
            filteredAthletes.map((athlete) => (
              <label
                key={athlete.id}
                className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={selectedAthleteIds.has(athlete.id)}
                  onChange={() => toggleAthlete(athlete.id)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-1 focus:ring-primary"
                />
                <div className="flex flex-1 flex-col">
                  <span className="font-medium text-foreground">{athlete.name}</span>
                  {athlete.groupName && (
                    <span className="text-xs text-muted-foreground">
                      Grupo principal: {athlete.groupName}
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

