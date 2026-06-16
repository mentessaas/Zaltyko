"use client";

import { FormEvent, useState, useTransition } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getSpecializedClassNameSuggestions } from "@/lib/specialization/technical-guidance";

const WEEKDAY_OPTIONS = [
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miércoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sábado" },
  { value: "0", label: "Domingo" },
];

const fieldClassName =
  "w-full rounded-[10px] border border-zaltyko-mist bg-white px-3 py-2 text-sm shadow-none focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15";
const selectedChipClassName =
  "border-zaltyko-teal bg-zaltyko-teal/10 text-zaltyko-teal";
const unselectedChipClassName =
  "border-zaltyko-mist bg-white text-zaltyko-text-secondary hover:border-zaltyko-teal hover:text-zaltyko-teal";

interface CreateClassDialogProps {
  academyId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateClassDialog({ academyId, open, onClose, onCreated }: CreateClassDialogProps) {
  const { specialization } = useAcademyContext();
  const [name, setName] = useState("");
  const [weekdays, setWeekdays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [capacity, setCapacity] = useState("");
  const [technicalFocus, setTechnicalFocus] = useState("");
  const [selectedApparatus, setSelectedApparatus] = useState<string[]>([]);
  const [allowsFreeTrial, setAllowsFreeTrial] = useState(false);
  const [waitingListEnabled, setWaitingListEnabled] = useState(false);
  const [cancellationHoursBefore, setCancellationHoursBefore] = useState(24);
  const [cancellationPolicy, setCancellationPolicy] = useState("standard");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const classNameSuggestions = getSpecializedClassNameSuggestions(specialization);

  const resetForm = () => {
    setName("");
    setWeekdays([]);
    setStartTime("");
    setEndTime("");
    setCapacity("");
    setTechnicalFocus("");
    setSelectedApparatus([]);
    setAllowsFreeTrial(false);
    setWaitingListEnabled(false);
    setCancellationHoursBefore(24);
    setCancellationPolicy("standard");
    setShowAdvanced(false);
    setError(null);
  };

  const toggleWeekday = (value: string) => {
    setWeekdays((prev) => {
      if (prev.includes(value)) {
        return prev.filter((item) => item !== value);
      }
      return [...prev, value];
    });
  };

  const toggleApparatus = (value: string) => {
    setSelectedApparatus((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
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
          weekdays: weekdays.map((day) => Number(day)),
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          capacity: capacity ? Number(capacity) : undefined,
          technicalFocus: technicalFocus.trim() || undefined,
          apparatus: selectedApparatus,
          allowsFreeTrial,
          waitingListEnabled,
          cancellationHoursBefore: cancellationHoursBefore ? Number(cancellationHoursBefore) : 24,
          cancellationPolicy,
        };

        const response = await fetch("/api/classes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
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
      title={`Crear nuevo ${specialization.labels.classLabel.toLowerCase()}`}
      description={`Define los datos básicos del ${specialization.labels.classLabel.toLowerCase()} y parte de una propuesta coherente para ${specialization.labels.disciplineName.toLowerCase()}.`}
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
            form="create-class-form"
            className="min-h-11 rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Guardando…" : "Guardar clase"}
          </button>
        </div>
      }
    >
      <form id="create-class-form" onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-xl border border-zaltyko-coral/35 bg-zaltyko-coral/10 px-3 py-2 text-sm text-zaltyko-coral">
            {error}
          </div>
        )}

        {/* Campos esenciales */}
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">Nombre del {specialization.labels.classLabel.toLowerCase()} *</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={fieldClassName}
              placeholder={`Ej: ${classNameSuggestions[0]?.name ?? `${specialization.labels.classLabel} base`}`}
              required
            />
            <div className="flex flex-wrap gap-2 pt-2">
              {classNameSuggestions.map((suggestion) => (
                <button
                  key={suggestion.name}
                  type="button"
                  onClick={() => setName(suggestion.name)}
                  className="rounded-full border border-zaltyko-mist bg-white px-3 py-1.5 text-xs font-semibold text-zaltyko-navy transition hover:border-zaltyko-teal hover:bg-zaltyko-teal/10 hover:text-zaltyko-teal"
                  title={suggestion.description}
                >
                  {suggestion.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-zaltyko-text-secondary">
              Sugerencias técnicas para {specialization.labels.disciplineName.toLowerCase()}.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">Días de la semana</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWeekdays([])}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    weekdays.length === 0
                      ? selectedChipClassName
                      : unselectedChipClassName
                  }`}
                >
                  Sin día fijo
                </button>
                {WEEKDAY_OPTIONS.map((option) => {
                  const selected = weekdays.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleWeekday(option.value)}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        selected
                          ? selectedChipClassName
                          : unselectedChipClassName
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">Capacidad</label>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                className={fieldClassName}
                placeholder="20"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">Hora de inicio</label>
              <input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className={fieldClassName}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">Hora de fin</label>
              <input
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className={fieldClassName}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">Foco técnico del bloque</label>
            <textarea
              value={technicalFocus}
              onChange={(event) => setTechnicalFocus(event.target.value)}
              className={`${fieldClassName} min-h-24`}
              placeholder={classNameSuggestions[0]?.description ?? "Describe el objetivo técnico principal de este entrenamiento."}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">Aparatos / material principal</label>
            <div className="flex flex-wrap gap-2">
              {specialization.evaluation.apparatus.map((item) => {
                const selected = selectedApparatus.includes(item.label);
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => toggleApparatus(item.label)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      selected
                        ? selectedChipClassName
                        : unselectedChipClassName
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Opciones avanzadas - colapsable */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white px-3 py-2 text-sm font-medium text-zaltyko-text-secondary transition hover:border-zaltyko-teal hover:text-zaltyko-teal"
        >
          <span>Opciones avanzadas</span>
          {showAdvanced ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {showAdvanced && (
          <div className="space-y-4 rounded-2xl border border-zaltyko-mist bg-zaltyko-warm-white p-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-zaltyko-navy">
                <input
                  type="checkbox"
                  checked={allowsFreeTrial}
                  onChange={(event) => setAllowsFreeTrial(event.target.checked)}
                  className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
                />
                Permite clase de prueba gratuita
              </label>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-zaltyko-navy">
                <input
                  type="checkbox"
                  checked={waitingListEnabled}
                  onChange={(event) => setWaitingListEnabled(event.target.checked)}
                  className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
                />
                Habilitar lista de espera
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">Política de cancelación</label>
                <select
                  value={cancellationPolicy}
                  onChange={(event) => setCancellationPolicy(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="flexible">Flexible (cancelar hasta 2h antes)</option>
                  <option value="standard">Estándar (cancelar hasta 24h antes)</option>
                  <option value="strict">Estricta (cancelar hasta 48h antes)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">Horas mínimas para cancelar</label>
                <input
                  type="number"
                  min={0}
                  max={168}
                  value={cancellationHoursBefore}
                  onChange={(event) => setCancellationHoursBefore(Number(event.target.value))}
                  className={fieldClassName}
                />
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
