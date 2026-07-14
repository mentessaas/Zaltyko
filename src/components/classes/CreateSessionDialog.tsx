"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type { SportConfigOption } from "@/components/groups/types";
import { getTerminology } from "@/lib/sport-config/terminology";

const fieldClassName =
  "w-full rounded-card border border-zaltyko-mist bg-white px-3 py-2 text-sm shadow-none focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15";
const labelClassName = "text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy";

interface CoachOption {
  id: string;
  name: string;
  sportConfigIds?: string[];
}

interface CreateSessionDialogProps {
  classId: string;
  academyId: string;
  coaches: CoachOption[];
  sportConfigId?: string | null;
  sportConfigs?: SportConfigOption[];
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateSessionDialog({
  classId,
  academyId,
  coaches,
  sportConfigId,
  sportConfigs = [],
  open,
  onClose,
  onCreated,
}: CreateSessionDialogProps) {
  const [sessionDate, setSessionDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [coachId, setCoachId] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const compatibleCoaches = useMemo(
    () =>
      sportConfigId
        ? coaches.filter((coach) => !coach.sportConfigIds?.length || coach.sportConfigIds.includes(sportConfigId))
        : coaches,
    [coaches, sportConfigId]
  );
  const selectedSportConfig = useMemo(
    () => sportConfigs.find((config) => config.id === sportConfigId) ?? null,
    [sportConfigId, sportConfigs]
  );
  const terms = getTerminology(selectedSportConfig);
  const coachTermLower = terms.coach.toLowerCase();

  const resetForm = () => {
    setSessionDate("");
    setStartTime("");
    setEndTime("");
    setCoachId("");
    setStatus("scheduled");
    setNotes("");
    setError(null);
  };

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!sessionDate) {
      setError("La fecha de la sesión es obligatoria.");
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
          classId,
          sessionDate,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          coachId: coachId || undefined,
          status,
          notes: notes || undefined,
        };

        const response = await fetch("/api/class-sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo crear la sesión.");
        }

        resetForm();
        onCreated();
        onClose();
      } catch (err: unknown) {
        setError((err instanceof Error ? err.message : "Error desconocido") ?? "Error desconocido al crear la sesión.");
      }
    });
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Programar sesión"
      description={`Define la próxima sesión y asigna ${coachTermLower} responsable.`}
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
            form="create-session-form"
            className="min-h-11 rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Guardando…" : "Guardar sesión"}
          </button>
        </div>
      }
    >
      <form id="create-session-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-zaltyko-coral/35 bg-zaltyko-coral/10 px-3 py-2 text-sm text-zaltyko-coral">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className={labelClassName}>Fecha</label>
          <input
            type="date"
            value={sessionDate}
            onChange={(event) => setSessionDate(event.target.value)}
            className={fieldClassName}
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className={labelClassName}>Hora de inicio</label>
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={fieldClassName}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClassName}>Hora de fin</label>
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={fieldClassName}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelClassName}>{terms.coach} responsable</label>
          <select
            value={coachId}
            onChange={(event) => setCoachId(event.target.value)}
            className={fieldClassName}
          >
            <option value="">Sin asignar</option>
            {compatibleCoaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className={labelClassName}>Estado</label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={fieldClassName}
          >
            <option value="scheduled">Programada</option>
            <option value="in_progress">En curso</option>
            <option value="completed">Completada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className={labelClassName}>Notas</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className={fieldClassName}
            placeholder="Objetivos o recordatorios para la sesión…"
          />
        </div>
      </form>
    </Modal>
  );
}
