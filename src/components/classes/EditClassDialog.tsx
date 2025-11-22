"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";

const WEEKDAY_OPTIONS = [
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
  const [name, setName] = useState(classItem.name);
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>(
    classItem.weekdays.map((day) => String(day))
  );
  const [startTime, setStartTime] = useState(classItem.startTime ?? "");
  const [endTime, setEndTime] = useState(classItem.endTime ?? "");
  const [capacity, setCapacity] = useState(classItem.capacity ? String(classItem.capacity) : "");
  const [selectedCoaches, setSelectedCoaches] = useState<string[]>(
    classItem.coaches.map((coach) => coach.id)
  );
  const [selectedGroups, setSelectedGroups] = useState<string[]>(
    classItem.groups?.map((group) => group.id) ?? []
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
    setSelectedCoaches(classItem.coaches.map((coach) => coach.id));
    setSelectedGroups(classItem.groups?.map((group) => group.id) ?? []);
    setError(null);
  }, [classItem, open]);

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

    console.log("EditClassDialog: hasChanges check", {
      nameChanged: { original: classItem.name, new: name.trim(), changed: nameChanged },
      weekdaysChanged: { original: originalWeekdays, new: newWeekdays, changed: weekdaysChanged },
      startTimeChanged: { original: originalStartTime, new: startTime, changed: startTimeChanged },
      endTimeChanged: { original: originalEndTime, new: endTime, changed: endTimeChanged },
      capacityChanged: { original: originalCapacity, new: capacity, changed: capacityChanged },
      coachesChanged: { original: originalCoachIds, new: newCoachIds, changed: coachesChanged },
      hasAnyChanges,
    });

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
    if (!hasChanges && !isPending) {
      console.warn("EditClassDialog: Intento de guardar sin cambios detectados. Guardando de todas formas...");
    }

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
          coachIds: selectedCoaches,
          groupIds: selectedGroups,
        };

        console.log("EditClassDialog: Enviando payload", payload);
        console.log("EditClassDialog: Estado actual de hasChanges", hasChanges);

        const response = await fetch(`/api/classes/${classItem.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
            ...(currentUser?.id ? { "x-user-id": currentUser.id } : {}),
          },
          body: JSON.stringify(payload),
        });

        console.log("EditClassDialog: Respuesta recibida", response.status, response.statusText);

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
        console.log("EditClassDialog: Actualización exitosa", result);

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
          ...(currentUser?.id ? { "x-user-id": currentUser.id } : {}),
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
            className="inline-flex items-center justify-center rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || isDeleting}
          >
            {isDeleting ? "Eliminando…" : "Eliminar clase"}
          </button>
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
          <div className="rounded-md border-2 border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 shadow-sm">
            <p className="font-semibold">Error al guardar cambios</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nombre de la clase
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Días de la semana
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => setSelectedWeekdays([])}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  selectedWeekdays.length === 0
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground"
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
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Selecciona uno o varios días. Déjalo vacío para clases flexibles.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Capacidad (número de plazas)
            </label>
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
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hora de inicio
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hora de fin
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="space-y-3 rounded-md border border-dashed border-border/70 p-4">
            <header>
              <h3 className="text-sm font-semibold text-foreground">Entrenadores asignados</h3>
              <p className="text-xs text-muted-foreground">
                Selecciona quiénes tienen acceso directo a esta clase.
              </p>
            </header>

            <div className="grid gap-2">
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

          <section className="space-y-3 rounded-md border border-dashed border-border/70 p-4">
            <header>
              <h3 className="text-sm font-semibold text-foreground">Grupos asignados</h3>
              <p className="text-xs text-muted-foreground">
                Selecciona los grupos que participan en esta clase.
              </p>
            </header>

            <div className="grid gap-2">
              {availableGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay grupos registrados en la academia.
                </p>
              ) : (
                availableGroups.map((group) => {
                  const checked = selectedGroups.includes(group.id);
                  return (
                    <label
                      key={group.id}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-sm transition ${
                        checked ? "border-primary/60 bg-primary/5" : "border-border bg-background"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGroup(group.id)}
                      />
                      <div className="flex items-center gap-2">
                        {group.color && (
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: group.color }}
                          />
                        )}
                        <p className="font-medium">{group.name}</p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </form>
    </Modal>
  );
}


