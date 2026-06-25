"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { CoachOption, AthleteOption, GroupSummary, SportConfigOption } from "./types";
import { createClient } from "@/lib/supabase/client";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getGroupTechnicalGuidance } from "@/lib/specialization/technical-guidance";
import { getTerminology } from "@/lib/sport-config/terminology";

interface EditGroupDialogProps {
  academyId: string;
  group: GroupSummary;
  open: boolean;
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
  coaches: CoachOption[];
  athletes: AthleteOption[];
  currentAthleteIds?: string[]; // IDs de atletas actualmente en el grupo
  sportConfigs?: SportConfigOption[];
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
  sportConfigs = [],
}: EditGroupDialogProps) {
  const { pushToast } = useToast();
  const { specialization, academyType } = useAcademyContext();
  const [name, setName] = useState(group.name);
  const [discipline, setDiscipline] = useState<string>(group.discipline || academyType || "artistica");
  const [sportConfigId, setSportConfigId] = useState(group.sportConfigId ?? "");
  const [programCode, setProgramCode] = useState(group.programCode ?? "");
  const [levelCode, setLevelCode] = useState(group.levelCode ?? "");
  const [categoryCode, setCategoryCode] = useState(group.categoryCode ?? "");
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
  const selectedSportConfig = useMemo(
    () => sportConfigs.find((config) => config.id === sportConfigId) ?? null,
    [sportConfigId, sportConfigs]
  );
  const terms = getTerminology(selectedSportConfig);
  const groupTerm = terms.group;
  const groupTermLower = groupTerm.toLowerCase();
  const athleteTermPlural = terms.athletes;
  const athleteTermPluralLower = athleteTermPlural.toLowerCase();
  const availablePrograms = selectedSportConfig?.programs ?? [];
  const availableLevels =
    selectedSportConfig?.levels.filter((item) => !programCode || !item.programCode || item.programCode === programCode) ?? [];
  const availableCategories = selectedSportConfig?.categories ?? [];
  const availableApparatus = selectedSportConfig?.apparatus ?? [];
  const compatibleCoaches = useMemo(
    () =>
      selectedSportConfig
        ? coaches.filter((coach) => !coach.sportConfigIds?.length || coach.sportConfigIds.includes(selectedSportConfig.id))
        : coaches,
    [coaches, selectedSportConfig]
  );

  useEffect(() => {
    if (open) {
      setName(group.name);
      setDiscipline(group.discipline || academyType || "artistica");
      setSportConfigId(group.sportConfigId ?? "");
      setProgramCode(group.programCode ?? "");
      setLevelCode(group.levelCode ?? "");
      setCategoryCode(group.categoryCode ?? "");
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

  useEffect(() => {
    if (!selectedSportConfig) return;
    setDiscipline(selectedSportConfig.defaultAcademyType);
    setSelectedApparatus((current) => {
      const allowed = new Set(selectedSportConfig.apparatus.map((item) => item.code));
      return current.filter((item) => allowed.has(item));
    });
    setCoachId((current) => {
      if (!current) return current;
      const coach = coaches.find((item) => item.id === current);
      return !coach?.sportConfigIds?.length || coach.sportConfigIds.includes(selectedSportConfig.id) ? current : "";
    });
    setAssistantIds((current) =>
      current.filter((coachId) => {
        const coach = coaches.find((item) => item.id === coachId);
        return !coach?.sportConfigIds?.length || coach.sportConfigIds.includes(selectedSportConfig.id);
      })
    );
  }, [selectedSportConfig]);

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
      setError(`El nombre del ${groupTermLower} es obligatorio.`);
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
            sportConfigId: sportConfigId || null,
            programCode: programCode || null,
            levelCode: levelCode || null,
            categoryCode: categoryCode || null,
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
          throw new Error(data.error ?? `No se pudo actualizar el ${groupTermLower}.`);
        }

        await onUpdated();
        onClose();
        pushToast({
          title: `${groupTerm} actualizado`,
          description: "Los cambios se han guardado correctamente.",
          variant: "success",
        });
      } catch (err: unknown) {
        setError(err.message ?? `Error desconocido al actualizar el ${groupTermLower}.`);
        if (err?.message) {
          pushToast({
            title: `No se pudo actualizar el ${groupTermLower}`,
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
      title={`Editar ${groupTermLower}`}
      description={`Modifica la información del ${groupTermLower}, responsables y ${athleteTermPluralLower}.`}
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
            <label className="font-medium">Modalidad / rama</label>
            <select
              value={sportConfigId}
              onChange={(event) => {
                const nextSportConfigId = event.target.value;
                const nextConfig = sportConfigs.find((config) => config.id === nextSportConfigId) ?? null;
                setSportConfigId(nextSportConfigId);
                setDiscipline(nextConfig?.defaultAcademyType ?? academyType ?? "artistica");
                setProgramCode("");
                setLevelCode("");
                setCategoryCode("");
                setLevel("");
                setSelectedApparatus([]);
              }}
              disabled={sportConfigs.length === 0}
              className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">{specialization.labels.disciplineName}</option>
              {sportConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.disciplineName} · {config.branchName}
                </option>
              ))}
            </select>
          </div>
          {availablePrograms.length > 0 && (
            <div className="space-y-1">
              <label className="font-medium">Programa</label>
              <select
                value={programCode}
                onChange={(event) => {
                  setProgramCode(event.target.value);
                  setLevelCode("");
                  setLevel("");
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Sin programa</option>
                {availablePrograms.map((program) => (
                  <option key={program.code} value={program.code}>
                    {program.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <label className="font-medium">{terms.level}</label>
            {availableLevels.length > 0 ? (
              <select
                value={levelCode}
                onChange={(event) => {
                  const nextLevelCode = event.target.value;
                  setLevelCode(nextLevelCode);
                  setLevel(availableLevels.find((item) => item.code === nextLevelCode)?.name ?? "");
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Sin {terms.level.toLowerCase()}</option>
                {availableLevels.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                list="edit-group-level-options"
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                placeholder={specialization.categories.levelPlaceholder}
                className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
            {availableLevels.length === 0 && specialization.categories.levelOptions.length > 0 && (
              <datalist id="edit-group-level-options">
                {specialization.categories.levelOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            )}
            {availableLevels.length === 0 && specialization.categories.levelOptions.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Sugerencias: {specialization.categories.levelOptions.slice(0, 4).join(", ")}
              </p>
            )}
          </div>
          {availableCategories.length > 0 && (
            <div className="space-y-1">
              <label className="font-medium">{terms.category}</label>
              <select
                value={categoryCode}
                onChange={(event) => setCategoryCode(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Sin {terms.category.toLowerCase()}</option>
                {availableCategories.map((category) => (
                  <option key={category.code} value={category.code}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
              Cuota mensual por defecto para los {athleteTermPluralLower} de este {groupTermLower}
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
              Ajusta esta referencia técnica para que refleje cómo trabaja realmente el {groupTermLower}.
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
            <label className="font-medium">{terms.apparatus} / material</label>
            <div className="flex flex-wrap gap-2">
              {(availableApparatus.length > 0
                ? availableApparatus.map((item) => ({ value: item.code, label: item.name }))
                : technicalGuidance.apparatus.map((item) => ({ value: item, label: item }))
              ).map((item) => {
                const selected = selectedApparatus.includes(item.value);
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => toggleApparatus(item.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {item.label}
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
            <label className="font-medium">{terms.coach} principal</label>
            <select
              value={coachId}
              onChange={(event) => setCoachId(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
            <label className="font-medium">Asistentes</label>
            <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border border-border p-3">
              {compatibleCoaches.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay {terms.coach.toLowerCase()}s registrados.
                </p>
              ) : (
                compatibleCoaches.map((coach) => (
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
              Puedes añadir asistentes en cualquier momento desde la vista del {groupTermLower}.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{athleteTermPlural}</h3>
              <p className="text-xs text-muted-foreground">
                Selecciona los {athleteTermPluralLower} que formarán parte del {groupTermLower}.
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
                No hay {athleteTermPluralLower} registrados en la academia todavía.
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
