"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";

interface ClassOption {
  id: string;
  name: string;
  sportConfigId: string | null;
}

interface SportConfigOption {
  id: string;
  name: string;
  disciplineName: string;
  branchName: string;
  terminology?: Record<string, string>;
}

interface CoachWithAssignments {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  sportConfigIds: string[];
  classes: ClassOption[];
}

interface EditCoachDialogProps {
  coach: CoachWithAssignments;
  availableClasses: ClassOption[];
  sportConfigs: SportConfigOption[];
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
  academyId: string;
}

export function EditCoachDialog({
  coach,
  availableClasses,
  sportConfigs,
  open,
  onClose,
  onUpdated,
  onDeleted,
  academyId,
}: EditCoachDialogProps) {
  const [name, setName] = useState(coach.name);
  const [email, setEmail] = useState(coach.email ?? "");
  const [phone, setPhone] = useState(coach.phone ?? "");
  const [selectedClasses, setSelectedClasses] = useState<string[]>(
    coach.classes.map((item) => item.id)
  );
  const [selectedSportConfigs, setSelectedSportConfigs] = useState<string[]>(coach.sportConfigIds);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isAssigning, setIsAssigning] = useState(false);
  const terms = getTerminologyForSportConfig(sportConfigs, selectedSportConfigs[0]);
  const coachTermLower = terms.coach.toLowerCase();

  useEffect(() => {
    if (!open) return;
    setName(coach.name);
    setEmail(coach.email ?? "");
    setPhone(coach.phone ?? "");
    setSelectedClasses(coach.classes.map((item) => item.id));
    setSelectedSportConfigs(coach.sportConfigIds);
    setError(null);
  }, [coach, open]);

  useEffect(() => {
    if (selectedSportConfigs.length === 0) return;
    const allowedClassIds = new Set(
      availableClasses
        .filter((entry) => !entry.sportConfigId || selectedSportConfigs.includes(entry.sportConfigId))
        .map((entry) => entry.id)
    );
    setSelectedClasses((current) => current.filter((classId) => allowedClassIds.has(classId)));
  }, [availableClasses, selectedSportConfigs]);

  const hasChanges = useMemo(() => {
    return (
      name.trim() !== coach.name ||
      email.trim() !== (coach.email ?? "") ||
      phone.trim() !== (coach.phone ?? "") ||
      !arrayEquals([...selectedSportConfigs].sort(), [...coach.sportConfigIds].sort()) ||
      !arrayEquals([...selectedClasses].sort(), coach.classes.map((item) => item.id).sort())
    );
  }, [name, email, phone, selectedClasses, selectedSportConfigs, coach]);

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!hasChanges) {
      onClose();
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        const payload: Record<string, unknown> = {};
        if (name.trim() !== coach.name) payload.name = name.trim();
        if (email.trim() !== (coach.email ?? "")) payload.email = email.trim() || null;
        if (phone.trim() !== (coach.phone ?? "")) payload.phone = phone.trim() || null;
        if (!arrayEquals([...selectedSportConfigs].sort(), [...coach.sportConfigIds].sort())) {
          payload.sportConfigIds = selectedSportConfigs;
        }

        if (Object.keys(payload).length > 0) {
          const response = await fetch(`/api/coaches/${coach.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-academy-id": academyId,
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error ?? `No se pudo actualizar el ${coachTermLower}.`);
          }
        }

        if (!arrayEquals(selectedClasses.sort(), coach.classes.map((item) => item.id).sort())) {
          setIsAssigning(true);
          await updateAssignments(coach.id, selectedClasses, currentUser?.id ?? null);
          setIsAssigning(false);
        }

        onUpdated();
        onClose();
      } catch (err: any) {
        setError(err.message ?? "Error al guardar cambios.");
        setIsAssigning(false);
      }
    });
  };

  const updateAssignments = async (coachId: string, classIds: string[], userId: string | null) => {
    const response = await fetch(`/api/coaches/${coachId}/assignments`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-academy-id": academyId,
      },
      body: JSON.stringify({ classIds }),
    });

    if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudieron actualizar las asignaciones.");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`¿Eliminar este ${coachTermLower}? Se quitarán también sus asignaciones.`)) {
      return;
    }

    try {
      const supabase = createClient();
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      const response = await fetch(`/api/coaches/${coach.id}`, {
        method: "DELETE",
        headers: {
          "x-academy-id": academyId,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `No se pudo eliminar el ${coachTermLower}.`);
      }

      onDeleted();
      onClose();
    } catch (err: any) {
      setError(err.message ?? `Error al eliminar el ${coachTermLower}.`);
    } finally {
      setIsAssigning(false);
    }
  };

  const toggleClass = (classId: string) => {
    setSelectedClasses((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const toggleSportConfig = (sportConfigId: string) => {
    setSelectedSportConfigs((current) =>
      current.includes(sportConfigId)
        ? current.filter((id) => id !== sportConfigId)
        : [...current, sportConfigId]
    );
  };

  const isClassAllowed = (entry: ClassOption) =>
    selectedSportConfigs.length === 0 || !entry.sportConfigId || selectedSportConfigs.includes(entry.sportConfigId);

  const sportConfigNameById = new Map(sportConfigs.map((config) => [config.id, config.branchName]));

  const assignedCount = selectedClasses.length;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Editar ${coachTermLower}`}
      description={`Actualiza la información básica y las clases asignadas al ${coachTermLower}.`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleDelete}
            className="text-sm font-semibold text-red-600 hover:underline"
          >
            Eliminar {coachTermLower}
          </button>
          <div className="flex gap-2">
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
              form="edit-coach-form"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending || !hasChanges}
            >
              {isPending || isAssigning ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      }
    >
      <form id="edit-coach-form" onSubmit={handleSave} className="space-y-6">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Nombre</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Correo</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="coach@academia.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Teléfono</label>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="+34 600 000 000"
            />
          </div>
        </div>

        <section className="space-y-3 rounded-md border border-dashed border-border/70 p-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Ramas habilitadas</h3>
            <p className="text-xs text-muted-foreground">
              Sin selección equivale a todas las ramas. Si eliges ramas, las clases fuera de ese alcance quedan bloqueadas.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {sportConfigs.map((config) => (
              <label
                key={config.id}
                className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm hover:border-primary/60"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedSportConfigs.includes(config.id)}
                  onChange={() => toggleSportConfig(config.id)}
                />
                <span>
                  <span className="block font-medium">{config.branchName}</span>
                  <span className="block text-xs text-muted-foreground">{config.disciplineName}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-md border border-dashed border-border/70 p-4">
          <header className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Clases asignadas</h3>
              <p className="text-xs text-muted-foreground">
                Marca las clases donde el {coachTermLower} participa. Asignadas: {assignedCount}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedClasses([])}
              className="text-xs text-muted-foreground hover:underline"
            >
              Limpiar selección
            </button>
          </header>
          <div className="grid gap-2 sm:grid-cols-2">
            {availableClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay clases disponibles en esta academia. Crea clases primero.
              </p>
            ) : (
              availableClasses.map((entry) => {
                const allowed = isClassAllowed(entry);
                return (
                <label
                  key={entry.id}
                  className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm hover:border-primary/60 has-[:disabled]:opacity-60"
                >
                  <input
                    type="checkbox"
                    checked={selectedClasses.includes(entry.id)}
                    disabled={!allowed}
                    onChange={() => toggleClass(entry.id)}
                  />
                  <span>
                    <span className="block">{entry.name}</span>
                    {entry.sportConfigId && (
                      <span className="block text-xs text-muted-foreground">
                        {sportConfigNameById.get(entry.sportConfigId) ?? "Rama configurada"}
                      </span>
                    )}
                  </span>
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

function arrayEquals<T>(a: T[], b: T[]) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((item) => setB.has(item));
}
