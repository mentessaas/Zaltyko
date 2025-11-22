"use client";

import { FormEvent, useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { createExtraClassAction } from "@/app/actions/classes/create-extra-class";
import { useToast } from "@/components/ui/toast-provider";

interface CreateExtraClassDialogProps {
  academyId: string;
  athleteId: string;
  availableCoaches: Array<{
    id: string;
    name: string;
    email: string | null;
  }>;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateExtraClassDialog({
  academyId,
  athleteId,
  availableCoaches,
  open,
  onClose,
  onCreated,
}: CreateExtraClassDialogProps) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const [coachId, setCoachId] = useState<string>("");
  const [date, setDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [startTime, setStartTime] = useState<string>("09:00");
  const [duration, setDuration] = useState<number>(60);
  const [capacity, setCapacity] = useState<number>(1);
  const [createCharge, setCreateCharge] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setConflictError(null);

    if (!coachId) {
      setError("Selecciona un entrenador");
      return;
    }

    if (!date) {
      setError("Selecciona una fecha");
      return;
    }

    // Construir datetime strings
    const startDateTime = `${date}T${startTime}:00`;
    const startDate = new Date(startDateTime);
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
    const endDateTime = endDate.toISOString();

    startTransition(async () => {
      try {
        const result = await createExtraClassAction({
          athleteId,
          coachId,
          startTime: startDateTime,
          endTime: endDateTime,
          duration,
          capacity,
          createCharge,
          notes: notes || undefined,
          academyId,
        });

        if (result.error) {
          if (result.error === "SCHEDULE_CONFLICT") {
            setConflictError(result.message || "Conflicto de horario detectado");
            toast.pushToast({
              title: "Conflicto de horario",
              description: result.message || "El atleta o entrenador ya tiene una clase en ese horario.",
              variant: "error",
            });
          } else {
            setError(result.message || "Error al crear la clase extra");
            toast.pushToast({
              title: "Error",
              description: result.message || "Error al crear la clase extra",
              variant: "error",
            });
          }
          return;
        }

        toast.pushToast({
          title: "Clase extra creada",
          description: "La clase extra ha sido creada exitosamente.",
          variant: "success",
        });

        // Reset form
        setCoachId("");
        setDate(new Date().toISOString().split("T")[0]);
        setStartTime("09:00");
        setDuration(60);
        setCapacity(1);
        setCreateCharge(false);
        setNotes("");

        onCreated();
        onClose();
      } catch (err: any) {
        setError(err.message || "Error desconocido al crear la clase extra");
        toast.pushToast({
          title: "Error",
          description: err.message || "Error al crear la clase extra",
          variant: "error",
        });
      }
    });
  };

  const handleClose = () => {
    if (isPending) return;
    setError(null);
    setConflictError(null);
    onClose();
  };

  // Calcular hora fin automáticamente
  const endTime = (() => {
    if (!startTime) return "";
    try {
      const [hours, minutes] = startTime.split(":").map(Number);
      const startDate = new Date();
      startDate.setHours(hours, minutes, 0, 0);
      const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
      return `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
    } catch {
      return "";
    }
  })();

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Añadir clase extra"
      description="Crea una clase individual adicional para este atleta. Se validará que no haya conflictos de horario."
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
            form="create-extra-class-form"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || !coachId || !date}
          >
            {isPending ? "Creando..." : "Crear clase"}
          </button>
        </div>
      }
    >
      <form id="create-extra-class-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {conflictError && (
          <div className="rounded-md border border-yellow-400 bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
            {conflictError}
          </div>
        )}

        <div>
          <label htmlFor="coach" className="block text-sm font-medium text-foreground mb-1">
            Entrenador <span className="text-red-500">*</span>
          </label>
          <select
            id="coach"
            value={coachId}
            onChange={(e) => setCoachId(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Selecciona un entrenador</option>
            {availableCoaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="date" className="block text-sm font-medium text-foreground mb-1">
            Fecha <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            id="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            min={new Date().toISOString().split("T")[0]}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-foreground mb-1">
              Hora inicio <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              id="startTime"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="duration" className="block text-sm font-medium text-foreground mb-1">
              Duración (minutos) <span className="text-red-500">*</span>
            </label>
            <select
              id="duration"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>60 minutos</option>
              <option value={90}>90 minutos</option>
            </select>
          </div>
        </div>

        {endTime && (
          <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Hora fin calculada: <span className="font-semibold">{endTime}</span>
          </div>
        )}

        <div>
          <label htmlFor="capacity" className="block text-sm font-medium text-foreground mb-1">
            Capacidad
          </label>
          <input
            type="number"
            id="capacity"
            value={capacity}
            onChange={(e) => setCapacity(Math.max(1, Number(e.target.value)))}
            min={1}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="createCharge"
            checked={createCharge}
            onChange={(e) => setCreateCharge(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <label htmlFor="createCharge" className="text-sm font-medium text-foreground">
            Generar cargo automáticamente
          </label>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-1">
            Notas / Comentarios
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Notas adicionales sobre esta clase extra..."
          />
        </div>
      </form>
    </Modal>
  );
}

