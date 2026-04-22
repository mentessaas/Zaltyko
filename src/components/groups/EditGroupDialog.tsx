"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { CoachOption, AthleteOption, GroupSummary } from "./types";
import { createClient } from "@/lib/supabase/client";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getGroupTechnicalGuidance } from "@/lib/specialization/technical-guidance";

interface EditGroupDialogProps {
  academyId: string;
  group: GroupSummary;
  open: boolean;
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
  coaches: CoachOption[];
  athletes: AthleteOption[];
  currentAthleteIds?: string[]; // IDs de atletas actualmente en el grupo
}

const DEFAULT_COLOR = "#2563eb";

export function EditGroupDialog({
  academyId,
  group,
  open,
  onClose,
  onUpdated,
  coaches,
  athletes,
  currentAthleteIds = [],
}: EditGroupDialogProps) {
  const { pushToast } = useToast();
  const { specialization, academyType } = useAcademyContext();
  const [name, setName] = useState(group.name);
  const [discipline, setDiscipline] = useState<string>(group.discipline || academyType || "artistica");
  const [level, setLevel] = useState(group.level ?? "");
  const [technicalFocus, setTechnicalFocus] = useState(group.technicalFocus ?? "");
  const [selectedApparatus, setSelectedApparatus] = useState<string[]>(group.apparatus ?? []);
  const [sessionBlocks, setSessionBlocks] = useState<string[]>(group.sessionBlocks ?? []);
  const [coachId, setCoachId] = useState(group.coachId ?? "");
  const [assistantIds, setAssistantIds] = useState<string[]>(group.assistantIds);
  const [selectedAthletes, setSelectedAthletes] = useState<string[]>(currentAthleteIds);
  const [color, setColor] = useState(group.color ?? DEFAULT_COLOR);
  const [monthlyFeeEuros, setMonthlyFeeEuros] = useState(
    group.monthlyFeeCents ? String((group.monthlyFeeCents / 100).toFixed(2)) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const assistantsLookup = useMemo(() => new Set(assistantIds), [assistantIds]);
  const athleteLookup = useMemo(() => new Set(selectedAthletes), [selectedAthletes]);
  const technicalGuidance = useMemo(
    () => getGroupTechnicalGuidance(specialization, level),
    [level, specialization]
  );

  useEffect(() => {
    if (open) {
      setName(group.name);
      setDiscipline(group.discipline || academyType || "artistica");
      setLevel(group.level ?? "");
      setTechnicalFocus(group.technicalFocus ?? "");
      setSelectedApparatus(group.apparatus ?? []);
      setSessionBlocks(group.sessionBlocks ?? []);
      setCoachId(group.coachId ?? "");
      setAssistantIds(group.assistantIds);
      setSelectedAthletes(currentAthleteIds);
      setColor(group.color ?? DEFAULT_COLOR);
      setMonthlyFeeEuros(
        group.monthlyFeeCents ? String((group.monthlyFeeCents / 100).toFixed(2)) : ""
      );
      setError(null);
    }
  }, [open, group, currentAthleteIds]);

  const toggleAssistant = (id: string) => {
    setAssistantIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const toggleAthlete = (id: string) => {
    setSelectedAthletes((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const toggleApparatus = (value: string) => {
    setSelectedApparatus((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const toggleSessionBlock = (value: string) => {
    setSessionBlocks((prev) =>
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
      setError("El nombre del grupo es obligatorio.");
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const response = await fetch(`/api/groups/${group.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
          },
          body: JSON.stringify({
            name: name.trim(),
            discipline,
            level: level.trim() || null,
            technicalFocus: technicalFocus.trim() || null,
            apparatus: selectedApparatus,
            sessionBlocks,
            coachId: coachId || null,
            assistantIds,
            athleteIds: selectedAthletes,
            color,
            monthlyFeeCents: monthlyFeeEuros.trim()
              ? (() => {
                  const parsed = parseFloat(monthlyFeeEuros.replace(",", "."));
                  if (isNaN(parsed) || parsed < 0) {
                    return null;
                  }
                  return Math.round(parsed * 100);
                })()
              : null,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo actualizar el grupo.");
        }

        await onUpdated();
        onClose();
        pushToast({
          title: "Grupo actualizado",
          description: "Los cambios se han guardado correctamente.",
          variant: "success",
        });
      } catch (err: any) {
        setError(err.message ?? "Error desconocido al actualizar el grupo.");
        if (err?.message) {
          pushToast({
            title: "No se pudo actualizar el grupo",
            description: err.message,
            variant: "error",
          });
        }
      }
    });
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Editar grupo"
      description="Modifica la información del grupo, responsables y atletas."
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
            form="edit-group-form"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      }
    >
      <form id="edit-group-form" onSubmit={handleSubmit} className="space-y-6 text-sm">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-600">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="font-medium">Nombre</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="font-medium">Disciplina</label>
            <select
              value={discipline}
              onChange={(event) => setDiscipline(event.target.value)}
              disabled
              className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value={discipline}>{specialization.labels.disciplineName}</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-medium">{specialization.labels.levelLabel}</label>
            <input
              list="edit-group-level-options"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              placeholder={specialization.categories.levelPlaceholder}
              className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {specialization.categories.levelOptions.length > 0 && (
              <datalist id="edit-group-level-options">
                {specialization.categories.levelOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            )}
            {specialization.categories.levelOptions.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Sugerencias: {specialization.categories.levelOptions.slice(0, 4).join(", ")}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="font-medium">Cuota mensual (€)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={monthlyFeeEuros}
              onChange={(event) => setMonthlyFeeEuros(event.target.value)}
              placeholder="Ej: 50.00"
              className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground">
              Cuota mensual por defecto para los atletas de este grupo
            </p>
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="font-medium">Color</label>
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-2 py-1 md:w-32"
            />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">{technicalGuidance.headline}</h3>
            <p className="text-xs text-muted-foreground">
              Ajusta esta referencia técnica para que refleje cómo trabaja realmente el grupo.
            </p>
          </div>

          <div className="space-y-1">
            <label className="font-medium">Foco técnico</label>
            <textarea
              value={technicalFocus}
              onChange={(event) => setTechnicalFocus(event.target.value)}
              className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={technicalGuidance.focusAreas.join(". ")}
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium">Aparatos / material</label>
            <div className="flex flex-wrap gap-2">
              {technicalGuidance.apparatus.map((item) => {
                const selected = selectedApparatus.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleApparatus(item)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-medium">Bloques recomendados</label>
            <div className="flex flex-wrap gap-2">
              {technicalGuidance.suggestedSessionBlocks.map((item) => {
                const selected = sessionBlocks.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleSessionBlock(item)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="font-medium">Entrenador principal</label>
            <select
              value={coachId}
              onChange={(event) => setCoachId(event.target.value)}
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
          <div className="space-y-1">
            <label className="font-medium">Asistentes</label>
            <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border border-border p-3">
              {coaches.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay entrenadores registrados.</p>
              ) : (
                coaches.map((coach) => (
                  <label key={coach.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={assistantsLookup.has(coach.id)}
                      onChange={() => toggleAssistant(coach.id)}
                      disabled={coach.id === coachId}
                    />
                    <span className="truncate">{coach.name}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Puedes añadir asistentes en cualquier momento desde la vista del grupo.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Atletas</h3>
              <p className="text-xs text-muted-foreground">
                Selecciona los atletas que formarán parte del grupo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAthletes([])}
              className="text-xs text-muted-foreground hover:underline"
            >
              Limpiar selección
            </button>
          </div>
          <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border border-border p-3">
            {athletes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay atletas registrados en la academia todavía.
              </p>
            ) : (
              athletes.map((athlete) => (
                <label key={athlete.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={athleteLookup.has(athlete.id)}
                    onChange={() => toggleAthlete(athlete.id)}
                  />
                  <span className="flex-1 truncate">
                    {athlete.name}
                    {athlete.level ? ` · ${athlete.level}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">{athlete.status}</span>
                </label>
              ))
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
