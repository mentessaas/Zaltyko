"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { useAcademyContext } from "@/hooks/use-academy-context";

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
const labelClassName = "text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy";
const selectedChipClassName = "border-zaltyko-teal bg-zaltyko-teal/10 text-zaltyko-teal";
const unselectedChipClassName =
  "border-zaltyko-mist bg-white text-zaltyko-text-secondary hover:border-zaltyko-teal hover:text-zaltyko-teal";

interface CoachOption {
  id: string;
  name: string;
  email: string | null;
}

interface GroupOption {
  id: string;
  name: string;
  color: string | null;
}

interface ClassItem {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  technicalFocus?: string | null;
  apparatus?: string[];
  allowsFreeTrial: boolean;
  waitingListEnabled: boolean;
  cancellationHoursBefore: number | null;
  cancellationPolicy: string;
  coaches: CoachOption[];
  groups?: GroupOption[];
}

interface EditClassDialogProps {
  classItem: ClassItem;
  availableCoaches: CoachOption[];
  availableGroups?: GroupOption[];
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted?: () => void;
  academyId: string;
}

export function EditClassDialog({
  classItem,
  availableCoaches,
  availableGroups = [],
  open,
  onClose,
  onUpdated,
  onDeleted,
  academyId,
}: EditClassDialogProps) {
  const { specialization } = useAcademyContext();
  const [name, setName] = useState(classItem.name);
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>(
    classItem.weekdays.map((day) => String(day))
  );
  const [startTime, setStartTime] = useState(classItem.startTime ?? "");
  const [endTime, setEndTime] = useState(classItem.endTime ?? "");
  const [capacity, setCapacity] = useState(classItem.capacity ? String(classItem.capacity) : "");
  const [technicalFocus, setTechnicalFocus] = useState(classItem.technicalFocus ?? "");
  const [selectedApparatus, setSelectedApparatus] = useState<string[]>(classItem.apparatus ?? []);
  const [selectedCoaches, setSelectedCoaches] = useState<string[]>(
    classItem.coaches.map((coach) => coach.id)
  );
  const [selectedGroups, setSelectedGroups] = useState<string[]>(
    classItem.groups?.map((group) => group.id) ?? []
  );
  const [allowsFreeTrial, setAllowsFreeTrial] = useState(classItem.allowsFreeTrial ?? false);
  const [waitingListEnabled, setWaitingListEnabled] = useState(classItem.waitingListEnabled ?? false);
  const [cancellationHoursBefore, setCancellationHoursBefore] = useState(
    classItem.cancellationHoursBefore ?? 24
  );
  const [cancellationPolicy, setCancellationPolicy] = useState(
    classItem.cancellationPolicy ?? "standard"
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(classItem.name);
    setSelectedWeekdays(classItem.weekdays.map((day) => String(day)));
    setStartTime(classItem.startTime ?? "");
    setEndTime(classItem.endTime ?? "");
    setCapacity(classItem.capacity ? String(classItem.capacity) : "");
    setTechnicalFocus(classItem.technicalFocus ?? "");
    setSelectedApparatus(classItem.apparatus ?? []);
    setSelectedCoaches(classItem.coaches.map((coach) => coach.id));
    setSelectedGroups(classItem.groups?.map((group) => group.id) ?? []);
    setAllowsFreeTrial(classItem.allowsFreeTrial ?? false);
    setWaitingListEnabled(classItem.waitingListEnabled ?? false);
    setCancellationHoursBefore(classItem.cancellationHoursBefore ?? 24);
    setCancellationPolicy(classItem.cancellationPolicy ?? "standard");
    setError(null);
  }, [classItem, open]);

  const toggleApparatus = (value: string) => {
    setSelectedApparatus((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const hasChanges = useMemo(() => {
    const originalCoachIds = classItem.coaches.map((coach) => coach.id).sort();
    const newCoachIds = [...selectedCoaches].sort();

    const sameCoaches =
      originalCoachIds.length === newCoachIds.length &&
      originalCoachIds.every((value, index) => value === newCoachIds[index]);

    // Comparar weekdays: convertir ambos a números y ordenar para comparación
    const originalWeekdays = [...classItem.weekdays].sort((a, b) => a - b);
    const newWeekdays = selectedWeekdays
      .map(Number)
      .filter((day) => !isNaN(day) && day >= 0 && day <= 6)
      .sort((a, b) => a - b);
    
    const sameWeekdays =
      originalWeekdays.length === newWeekdays.length &&
      originalWeekdays.every((value, index) => value === newWeekdays[index]);

    // Comparar nombre
    const nameChanged = name.trim() !== classItem.name.trim();
    
    // Comparar weekdays
    const weekdaysChanged = !sameWeekdays;
    
    // Comparar tiempos: normalizar valores vacíos a null
    const originalStartTime = classItem.startTime ?? "";
    const originalEndTime = classItem.endTime ?? "";
    const startTimeChanged = startTime !== originalStartTime;
    const endTimeChanged = endTime !== originalEndTime;
    
    // Comparar capacidad: manejar null y valores vacíos
    const originalCapacity = classItem.capacity !== null && classItem.capacity !== undefined 
      ? String(classItem.capacity) 
      : "";
    const capacityChanged = capacity !== originalCapacity;
    
    const coachesChanged = !sameCoaches;
    
    // Comparar grupos
    const originalGroupIds = (classItem.groups?.map((group) => group.id) ?? []).sort();
    const newGroupIds = [...selectedGroups].sort();
    const sameGroups =
      originalGroupIds.length === newGroupIds.length &&
      originalGroupIds.every((value, index) => value === newGroupIds[index]);
    const groupsChanged = !sameGroups;

    const hasAnyChanges = nameChanged || weekdaysChanged || startTimeChanged || endTimeChanged || capacityChanged || coachesChanged || groupsChanged;

    return hasAnyChanges;
  }, [name, selectedWeekdays, startTime, endTime, capacity, selectedCoaches, classItem]);

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    // Verificar cambios antes de enviar
    startTransition(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        // Normalizar weekdays: convertir a números y ordenar
        const normalizedWeekdays = selectedWeekdays
          .map((day) => Number(day))
          .filter((day) => !isNaN(day) && day >= 0 && day <= 6)
          .sort((a, b) => a - b);

        const payload: Record<string, unknown> = {
          name: name.trim(),
          weekdays: normalizedWeekdays,
          startTime: startTime || null,
          endTime: endTime || null,
          capacity: capacity ? Number(capacity) : null,
          technicalFocus: technicalFocus.trim() || null,
          apparatus: selectedApparatus,
          coachIds: selectedCoaches,
          groupIds: selectedGroups,
          allowsFreeTrial,
          waitingListEnabled,
          cancellationHoursBefore: cancellationHoursBefore ? Number(cancellationHoursBefore) : 24,
          cancellationPolicy,
        };

        const response = await fetch(`/api/classes/${classItem.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          console.error("EditClassDialog: Error en la respuesta", data);
          
          // Manejar conflictos de horario de forma especial
          if (data.error === "SCHEDULE_CONFLICT" && data.message) {
            throw new Error(data.message);
          }
          
          // Construir mensaje de error más detallado
          let errorMessage = data.error || data.message || `Error ${response.status}: ${response.statusText}`;
          
          // En desarrollo, incluir más detalles
          if (process.env.NODE_ENV === "development") {
            const details: string[] = [];
            if (data.message && data.message !== errorMessage) {
              details.push(data.message);
            }
            if (data.detail) {
              details.push(`Detalle: ${data.detail}`);
            }
            if (data.code) {
              details.push(`Código: ${data.code}`);
            }
            if (data.stack) {
              console.error("EditClassDialog: Stack trace del error", data.stack);
            }
            if (details.length > 0) {
              errorMessage = `${errorMessage}\n\n${details.join("\n")}`;
            }
          }
          
          throw new Error(errorMessage);
        }

        const result = await response.json().catch(() => ({ ok: true }));

        // Llamar a onUpdated antes de cerrar para refrescar los datos
        onUpdated();
        onClose();
      } catch (err: any) {
        console.error("EditClassDialog: Error al guardar", err);
        const errorMessage = err.message ?? "Error al guardar cambios. Por favor, intenta de nuevo.";
        setError(errorMessage);
      }
    });
  };

  const handleDelete = async () => {
    if (isPending || isDeleting) return;
    const confirmed = typeof window !== "undefined"
      ? window.confirm("¿Seguro que quieres eliminar esta clase? Esta acción no se puede deshacer.")
      : true;

    if (!confirmed) {
      return;
    }

    setError(null);
    setIsDeleting(true);

    try {
      const supabase = createClient();
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      const response = await fetch(`/api/classes/${classItem.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-academy-id": academyId,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const errorMessage =
          data.error ||
          data.message ||
          data.detail ||
          `No se pudo eliminar la clase (código ${response.status}).`;
        throw new Error(errorMessage);
      }

      if (onDeleted) {
        onDeleted();
      } else {
        onUpdated();
      }
      onClose();
    } catch (error: any) {
      console.error("EditClassDialog: Error al eliminar la clase", error);
      setError(error?.message ?? "No se pudo eliminar la clase. Intenta nuevamente.");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleCoach = (coachId: string) => {
    setSelectedCoaches((prev) =>
      prev.includes(coachId) ? prev.filter((id) => id !== coachId) : [...prev, coachId]
    );
  };

  const toggleWeekday = (value: string) => {
    setSelectedWeekdays((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Editar clase"
      description="Actualiza el horario, capacidad y entrenadores asignados."
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zaltyko-coral/35 px-4 py-2 text-sm font-semibold text-zaltyko-coral transition hover:bg-zaltyko-coral/10 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || isDeleting}
          >
            {isDeleting ? "Eliminando…" : "Eliminar clase"}
          </button>
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
              form="edit-class-form"
              className="min-h-11 rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
              title={!hasChanges ? "No hay cambios detectados. Haz clic para guardar de todas formas." : undefined}
            >
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      }
    >
      <form id="edit-class-form" onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-xl border border-zaltyko-coral/35 bg-zaltyko-coral/10 px-4 py-3 text-sm font-medium text-zaltyko-coral">
            <p className="font-semibold">Error al guardar cambios</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        <div className="space-y-2">
          <label className={labelClassName}>
            Nombre de la clase
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={fieldClassName}
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <label className={labelClassName}>
              Días de la semana
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => setSelectedWeekdays([])}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  selectedWeekdays.length === 0
                    ? selectedChipClassName
                    : unselectedChipClassName
                }`}
              >
                Sin día fijo
              </button>
              {WEEKDAY_OPTIONS.map((option) => {
                const selected = selectedWeekdays.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleWeekday(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
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
            <p className="text-xs text-zaltyko-text-secondary">
              Selecciona uno o varios días. Déjalo vacío para clases flexibles.
            </p>
          </div>
          <div className="space-y-2">
            <label className={labelClassName}>
              Capacidad (número de plazas)
            </label>
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              className={fieldClassName}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className={labelClassName}>
              Hora de inicio
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={fieldClassName}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClassName}>
              Hora de fin
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={fieldClassName}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className={labelClassName}>
            Foco técnico del bloque
          </label>
          <textarea
            value={technicalFocus}
            onChange={(event) => setTechnicalFocus(event.target.value)}
            className={`${fieldClassName} min-h-24`}
            placeholder="Describe el objetivo técnico principal de este entrenamiento."
          />
        </div>

        <div className="space-y-2">
          <label className={labelClassName}>
            Aparatos / material principal
          </label>
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

        <div className="grid gap-4 md:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-dashed border-zaltyko-mist p-4">
            <header>
              <h3 className="text-sm font-semibold text-zaltyko-navy">Entrenadores asignados</h3>
              <p className="text-xs text-zaltyko-text-secondary">
                Selecciona quiénes tienen acceso directo a esta clase.
              </p>
            </header>

            <div className="grid gap-2">
              {availableCoaches.length === 0 ? (
                <p className="text-sm text-zaltyko-text-secondary">
                  No hay entrenadores registrados en la academia.
                </p>
              ) : (
                availableCoaches.map((coach) => {
                  const checked = selectedCoaches.includes(coach.id);
                  return (
                    <label
                      key={coach.id}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                        checked ? "border-zaltyko-teal/60 bg-zaltyko-teal/10" : "border-zaltyko-mist bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCoach(coach.id)}
                        className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
                      />
                      <div>
                        <p className="font-medium text-zaltyko-navy">{coach.name}</p>
                        <p className="text-xs text-zaltyko-text-secondary">
                          {coach.email ?? "Sin correo"}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-dashed border-zaltyko-mist p-4">
            <header>
              <h3 className="text-sm font-semibold text-zaltyko-navy">Grupos asignados</h3>
              <p className="text-xs text-zaltyko-text-secondary">
                Selecciona los grupos que participan en esta clase.
              </p>
            </header>

            <div className="grid gap-2">
              {availableGroups.length === 0 ? (
                <p className="text-sm text-zaltyko-text-secondary">
                  No hay grupos registrados en la academia.
                </p>
              ) : (
                availableGroups.map((group) => {
                  const checked = selectedGroups.includes(group.id);
                  return (
                    <label
                      key={group.id}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                        checked ? "border-zaltyko-teal/60 bg-zaltyko-teal/10" : "border-zaltyko-mist bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGroup(group.id)}
                        className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
                      />
                      <div className="flex items-center gap-2">
                        {group.color && (
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: group.color }}
                          />
                        )}
                        <p className="font-medium text-zaltyko-navy">{group.name}</p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* Opciones avanzadas */}
        <div className="space-y-4 rounded-2xl border border-zaltyko-mist bg-zaltyko-warm-white p-4">
          <h3 className="text-sm font-semibold text-zaltyko-navy">Opciones avanzadas</h3>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-zaltyko-navy">
              <input
                type="checkbox"
                checked={allowsFreeTrial}
                onChange={(event) => setAllowsFreeTrial(event.target.checked)}
                className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
              />
              Permite clase de prueba gratuita
            </label>

            <label className="flex items-center gap-2 text-sm text-zaltyko-navy">
              <input
                type="checkbox"
                checked={waitingListEnabled}
                onChange={(event) => setWaitingListEnabled(event.target.checked)}
                className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
              />
              Habilitar lista de espera cuando esté llena
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className={labelClassName}>Política de cancelación</label>
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
              <label className={labelClassName}>Horas mínimas para cancelar</label>
              <input
                type="number"
                min={0}
                max={168}
                value={cancellationHoursBefore}
                onChange={(event) => setCancellationHoursBefore(Number(event.target.value))}
                className={fieldClassName}
              />
              <p className="text-xs text-zaltyko-text-secondary">Horas antes de la clase</p>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
