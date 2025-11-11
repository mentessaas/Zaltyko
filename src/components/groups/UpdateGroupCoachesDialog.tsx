"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { CoachOption } from "./types";
import { createClient } from "@/lib/supabase/client";

interface UpdateGroupCoachesDialogProps {
  academyId: string;
  groupId: string;
  open: boolean;
  coachId: string | null;
  assistantIds: string[];
  coaches: CoachOption[];
  onClose: () => void;
  onUpdated: (coachId: string | null, assistantIds: string[]) => Promise<void> | void;
}

export function UpdateGroupCoachesDialog({
  academyId,
  groupId,
  open,
  coachId,
  assistantIds,
  coaches,
  onClose,
  onUpdated,
}: UpdateGroupCoachesDialogProps) {
  const { pushToast } = useToast();
  const [selectedCoach, setSelectedCoach] = useState<string>(coachId ?? "");
  const [selectedAssistants, setSelectedAssistants] = useState<string[]>(assistantIds);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setSelectedCoach(coachId ?? "");
    setSelectedAssistants(assistantIds);
    setError(null);
  }, [open, coachId, assistantIds]);

  const assistantLookup = useMemo(() => new Set(selectedAssistants), [selectedAssistants]);

  const toggleAssistant = (id: string) => {
    setSelectedAssistants((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (
      !selectedCoach &&
      selectedAssistants.length === 0 &&
      (coachId || assistantIds.length > 0)
    ) {
      const confirmed = window.confirm(
        "Quitarás todos los entrenadores asignados a este grupo. ¿Quieres continuar?"
      );
      if (!confirmed) {
        return;
      }
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (selectedCoach && assistantLookup.has(selectedCoach)) {
          setError("El entrenador principal no puede estar listado como asistente.");
          return;
        }

        const response = await fetch(`/api/groups/${groupId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
            ...(user?.id ? { "x-user-id": user.id } : {}),
          },
          body: JSON.stringify({
            coachId: selectedCoach || null,
            assistantIds: selectedAssistants,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo actualizar el grupo.");
        }

        await onUpdated(selectedCoach || null, selectedAssistants);
        onClose();
        pushToast({
          title: "Equipo actualizado",
          description: "Los entrenadores del grupo fueron actualizados.",
          variant: "success",
        });
      } catch (err: any) {
        setError(err.message ?? "Error desconocido al actualizar entrenadores.");
        pushToast({
          title: "No se pudo actualizar el equipo",
          description: err.message ?? "Error desconocido",
          variant: "error",
        });
      }
    });
  };

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Asignar entrenadores"
      description="Define el entrenador principal y los asistentes para este grupo."
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
            form="group-coaches-form"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      }
    >
      <form id="group-coaches-form" onSubmit={handleSubmit} className="space-y-4 text-sm">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="font-medium">Entrenador principal</label>
          <select
            value={selectedCoach}
            onChange={(event) => setSelectedCoach(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Sin asignar</option>
            {coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="font-medium">Asistentes</label>
            <button
              type="button"
              onClick={() => setSelectedAssistants([])}
              className="text-xs text-muted-foreground hover:underline"
            >
              Limpiar selección
            </button>
          </div>
          <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border border-border p-3">
            {coaches.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay entrenadores registrados en la academia.
              </p>
            ) : (
              coaches.map((coach) => (
                <label key={coach.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={assistantLookup.has(coach.id)}
                    onChange={() => toggleAssistant(coach.id)}
                    disabled={coach.id === selectedCoach}
                  />
                  <span className="flex-1 truncate">{coach.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
