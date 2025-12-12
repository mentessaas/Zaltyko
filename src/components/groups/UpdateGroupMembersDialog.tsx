"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { AthleteOption } from "./types";
import { createClient } from "@/lib/supabase/client";

interface UpdateGroupMembersDialogProps {
  academyId: string;
  groupId: string;
  open: boolean;
  selected: string[];
  athletes: AthleteOption[];
  onClose: () => void;
  onUpdated: (athleteIds: string[]) => Promise<void> | void;
}

export function UpdateGroupMembersDialog({
  academyId,
  groupId,
  open,
  selected,
  athletes,
  onClose,
  onUpdated,
}: UpdateGroupMembersDialogProps) {
  const { pushToast } = useToast();
  const [selection, setSelection] = useState<string[]>(selected);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setSelection(selected);
    setError(null);
  }, [open, selected]);

  const selectionSet = useMemo(() => new Set(selection), [selection]);

  const toggleAthlete = (id: string) => {
    setSelection((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (selection.length === 0 && selected.length > 0) {
      const confirmed = window.confirm(
        "Eliminarás todos los atletas de este grupo. ¿Quieres continuar?"
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

        const response = await fetch(`/api/groups/${groupId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
            ...(user?.id ? { "x-user-id": user.id } : {}),
          },
          body: JSON.stringify({ athleteIds: selection }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo actualizar el grupo.");
        }

        await onUpdated(selection);
        onClose();
        pushToast({
          title: "Grupo actualizado",
          description: "La lista de atletas se guardó correctamente.",
          variant: "success",
        });
      } catch (err: any) {
        setError(err.message ?? "Error desconocido al actualizar los atletas.");
        pushToast({
          title: "No se pudo actualizar el grupo",
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
      title="Actualizar atletas del grupo"
      description="Selecciona los atletas que pertenecen a este grupo."
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
            form="group-members-form"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      }
    >
      <form id="group-members-form" onSubmit={handleSubmit} className="space-y-4 text-sm">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-600">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {selection.length} atleta{selection.length === 1 ? "" : "s"} seleccionados
          </span>
          <button
            type="button"
            onClick={() => setSelection([])}
            className="text-xs text-muted-foreground hover:underline"
          >
            Limpiar selección
          </button>
        </div>

        <div className="grid max-h-64 gap-2 overflow-y-auto rounded-md border border-border p-3">
          {athletes.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No hay atletas disponibles en la academia.
            </p>
          ) : (
            athletes.map((athlete) => (
              <label key={athlete.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectionSet.has(athlete.id)}
                  onChange={() => toggleAthlete(athlete.id)}
                />
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{athlete.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {athlete.level ? `${athlete.level} · ` : ""}
                    {athlete.status}
                  </span>
                </div>
              </label>
            ))
          )}
        </div>
      </form>
    </Modal>
  );
}
