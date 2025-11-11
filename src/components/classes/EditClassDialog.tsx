"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

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

interface CoachOption {
  id: string;
  name: string;
  email: string | null;
}

interface ClassItem {
  id: string;
  name: string;
  weekday: number | null;
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  coaches: CoachOption[];
}

interface EditClassDialogProps {
  classItem: ClassItem;
  availableCoaches: CoachOption[];
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted?: () => void;
  academyId: string;
}

export function EditClassDialog({
  classItem,
  availableCoaches,
  open,
  onClose,
  onUpdated,
  onDeleted,
  academyId,
}: EditClassDialogProps) {
  const [name, setName] = useState(classItem.name);
  const [weekday, setWeekday] = useState<string>(
    classItem.weekday !== null && classItem.weekday !== undefined ? String(classItem.weekday) : ""
  );
  const [startTime, setStartTime] = useState(classItem.startTime ?? "");
  const [endTime, setEndTime] = useState(classItem.endTime ?? "");
  const [capacity, setCapacity] = useState(classItem.capacity ? String(classItem.capacity) : "");
  const [selectedCoaches, setSelectedCoaches] = useState<string[]>(
    classItem.coaches.map((coach) => coach.id)
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setName(classItem.name);
    setWeekday(
      classItem.weekday !== null && classItem.weekday !== undefined
        ? String(classItem.weekday)
        : ""
    );
    setStartTime(classItem.startTime ?? "");
    setEndTime(classItem.endTime ?? "");
    setCapacity(classItem.capacity ? String(classItem.capacity) : "");
    setSelectedCoaches(classItem.coaches.map((coach) => coach.id));
    setError(null);
  }, [classItem, open]);

  const hasChanges = useMemo(() => {
    const originalCoachIds = classItem.coaches.map((coach) => coach.id).sort();
    const newCoachIds = [...selectedCoaches].sort();

    const sameCoaches =
      originalCoachIds.length === newCoachIds.length &&
      originalCoachIds.every((value, index) => value === newCoachIds[index]);

    return (
      name.trim() !== classItem.name ||
      weekday !== (classItem.weekday !== null && classItem.weekday !== undefined
        ? String(classItem.weekday)
        : "") ||
      startTime !== (classItem.startTime ?? "") ||
      endTime !== (classItem.endTime ?? "") ||
      capacity !== (classItem.capacity ? String(classItem.capacity) : "") ||
      !sameCoaches
    );
  }, [name, weekday, startTime, endTime, capacity, selectedCoaches, classItem]);

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        const payload: Record<string, unknown> = {
          name: name.trim(),
          weekday: weekday ? Number(weekday) : null,
          startTime: startTime || null,
          endTime: endTime || null,
          capacity: capacity ? Number(capacity) : null,
          coachIds: selectedCoaches,
        };

        const response = await fetch(`/api/classes/${classItem.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
            ...(currentUser?.id ? { "x-user-id": currentUser.id } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo actualizar la clase.");
        }

        onUpdated();
        onClose();
      } catch (err: any) {
        setError(err.message ?? "Error al guardar cambios.");
      }
    });
  };

  const toggleCoach = (coachId: string) => {
    setSelectedCoaches((prev) =>
      prev.includes(coachId) ? prev.filter((id) => id !== coachId) : [...prev, coachId]
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Editar clase"
      description="Actualiza el horario, capacidad y entrenadores asignados."
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
            form="edit-class-form"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || !hasChanges}
          >
            {isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      }
    >
      <form id="edit-class-form" onSubmit={handleSubmit} className="space-y-4">
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

        <section className="space-y-3 rounded-md border border-dashed border-border/70 p-4">
          <header>
            <h3 className="text-sm font-semibold text-foreground">Entrenadores asignados</h3>
            <p className="text-xs text-muted-foreground">
              Selecciona quiénes tienen acceso directo a esta clase.
            </p>
          </header>

          <div className="grid gap-2 sm:grid-cols-2">
            {availableCoaches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay entrenadores registrados en la academia.
              </p>
            ) : (
              availableCoaches.map((coach) => {
                const checked = selectedCoaches.includes(coach.id);
                return (
                  <label
                    key={coach.id}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-sm transition ${
                      checked ? "border-primary/60 bg-primary/5" : "border-border bg-background"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCoach(coach.id)}
                    />
                    <div>
                      <p className="font-medium">{coach.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {coach.email ?? "Sin correo"}
                      </p>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </section>
      </form>
    </Modal>
  );
}


