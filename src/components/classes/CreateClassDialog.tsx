"use client";

import { FormEvent, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";

const WEEKDAY_OPTIONS = [
  { value: "", label: "Sin día fijo" },
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miércoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sábado" },
  { value: "0", label: "Domingo" },
];

interface CreateClassDialogProps {
  academyId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateClassDialog({ academyId, open, onClose, onCreated }: CreateClassDialogProps) {
  const [name, setName] = useState("");
  const [weekday, setWeekday] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [capacity, setCapacity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const resetForm = () => {
    setName("");
    setWeekday("");
    setStartTime("");
    setEndTime("");
    setCapacity("");
    setError(null);
  };

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("El nombre de la clase es obligatorio.");
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        const payload = {
          academyId,
          name: name.trim(),
          weekday: weekday ? Number(weekday) : undefined,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          capacity: capacity ? Number(capacity) : undefined,
        };

        const response = await fetch("/api/classes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
            ...(currentUser?.id ? { "x-user-id": currentUser.id } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo crear la clase.");
        }

        resetForm();
        onCreated();
        onClose();
      } catch (err: any) {
        setError(err.message ?? "Error desconocido al crear la clase.");
      }
    });
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Crear nueva clase"
      description="Define los datos básicos de la clase. Podrás asignar entrenadores más adelante."
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
            form="create-class-form"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Guardando…" : "Guardar clase"}
          </button>
        </div>
      }
    >
      <form id="create-class-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Nombre</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Equipo FIG Avanzado"
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Día de la semana</label>
            <select
              value={weekday}
              onChange={(event) => setWeekday(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {WEEKDAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Capacidad</label>
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="20"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Hora de inicio</label>
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Hora de fin</label>
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}


