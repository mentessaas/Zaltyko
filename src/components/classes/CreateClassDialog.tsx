"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getSpecializedClassNameSuggestions } from "@/lib/specialization/technical-guidance";
import type { SportConfigOption } from "@/components/groups/types";
import { getTerminology } from "@/lib/sport-config/terminology";
import { logger } from "@/lib/logger";
import { WEEKDAY_OPTIONS } from "@/lib/classes/constants";

// Esquema Zod: campos basicos requeridos + arrays para selections multiples.
const classFormSchema = z.object({
  name: z.string().trim().min(1, "Nombre obligatorio"),
  weekdays: z.array(z.string()).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  capacity: z.string().optional(),
  technicalFocus: z.string().optional(),
  sportConfigId: z.string().optional(),
  groupId: z.string().optional(),
  apparatus: z.array(z.string()).optional(),
  allowsFreeTrial: z.boolean().optional(),
  waitingListEnabled: z.boolean().optional(),
  cancellationHoursBefore: z.number().optional(),
  cancellationPolicy: z.enum(["flexible", "standard", "strict"]).optional(),
});

type ClassFormValues = z.input<typeof classFormSchema>;

const defaultValues: ClassFormValues = {
  name: "",
  weekdays: [],
  startTime: "",
  endTime: "",
  capacity: "",
  technicalFocus: "",
  sportConfigId: "",
  groupId: "",
  apparatus: [],
  allowsFreeTrial: false,
  waitingListEnabled: false,
  cancellationHoursBefore: 24,
  cancellationPolicy: "standard",
};

const fieldClassName =
  "w-full rounded-card border border-zaltyko-mist bg-white px-3 py-2 text-sm shadow-none focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15";
const errorTextClassName = "text-xs text-zaltyko-coral mt-1";
const selectedChipClassName =
  "border-zaltyko-teal bg-zaltyko-teal/10 text-zaltyko-teal";
const unselectedChipClassName =
  "border-zaltyko-mist bg-white text-zaltyko-text-secondary hover:border-zaltyko-teal hover:text-zaltyko-teal";

interface CreateClassDialogProps {
  academyId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  groupOptions?: Array<{ id: string; name: string; color: string | null; sportConfigId?: string | null }>;
  coachOptions?: Array<{ id: string; name: string; email: string | null; sportConfigIds?: string[] }>;
  sportConfigs?: SportConfigOption[];
  initialSportConfigId?: string;
}

export function CreateClassDialog({
  academyId,
  open,
  onClose,
  onCreated,
  groupOptions = [],
  coachOptions = [],
  sportConfigs = [],
  initialSportConfigId,
}: CreateClassDialogProps) {
  const { specialization } = useAcademyContext();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
    reset,
    watch,
    setValue,
  } = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues,
    mode: "onChange",
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sportConfigIdValue = watch("sportConfigId");
  const groupIdValue = watch("groupId");
  const weekdaysValue = watch("weekdays") ?? [];
  const apparatusValue = watch("apparatus") ?? [];

  const resolvedInitialSportConfigId = useMemo(
    () =>
      initialSportConfigId && sportConfigs.some((config) => config.id === initialSportConfigId)
        ? initialSportConfigId
        : "",
    [initialSportConfigId, sportConfigs]
  );
  const classNameSuggestions = getSpecializedClassNameSuggestions(specialization);
  const selectedGroup = useMemo(
    () => groupOptions.find((group) => group.id === groupIdValue) ?? null,
    [groupIdValue, groupOptions]
  );
  const effectiveSportConfigId = selectedGroup?.sportConfigId ?? sportConfigIdValue;
  const selectedSportConfig = useMemo(
    () => sportConfigs.find((config) => config.id === effectiveSportConfigId) ?? null,
    [effectiveSportConfigId, sportConfigs]
  );
  const terms = getTerminology(selectedSportConfig);
  const groupTermLower = terms.group.toLowerCase();
  const coachTermLower = terms.coach.toLowerCase();
  const classTerm = specialization.labels.classLabel;
  const classTermLower = classTerm.toLowerCase();
  const apparatusOptions =
    selectedSportConfig?.apparatus.map((item) => ({ code: item.code, label: item.name })) ??
    specialization.evaluation.apparatus.map((item) => ({ code: item.code, label: item.label }));
  const compatibleGroupOptions = useMemo(
    () =>
      sportConfigIdValue
        ? groupOptions.filter((group) => !group.sportConfigId || group.sportConfigId === sportConfigIdValue)
        : groupOptions,
    [groupOptions, sportConfigIdValue]
  );
  const compatibleCoachOptions = useMemo(
    () =>
      effectiveSportConfigId
        ? coachOptions.filter((coach) => !coach.sportConfigIds?.length || coach.sportConfigIds.includes(effectiveSportConfigId))
        : coachOptions,
    [coachOptions, effectiveSportConfigId]
  );

  useEffect(() => {
    if (!open || groupIdValue || !resolvedInitialSportConfigId) {
      return;
    }
    setValue("sportConfigId", resolvedInitialSportConfigId);
  }, [groupIdValue, open, resolvedInitialSportConfigId, setValue]);

  const toggleWeekday = (value: string) => {
    const next = weekdaysValue.includes(value)
      ? weekdaysValue.filter((item) => item !== value)
      : [...weekdaysValue, value];
    setValue("weekdays", next, { shouldValidate: true });
  };

  const toggleApparatus = (value: string) => {
    const next = apparatusValue.includes(value)
      ? apparatusValue.filter((item) => item !== value)
      : [...apparatusValue, value];
    setValue("apparatus", next, { shouldValidate: true });
  };

  const handleGroupChange = (nextGroupId: string) => {
    setValue("groupId", nextGroupId);
    const nextGroup = groupOptions.find((group) => group.id === nextGroupId);
    if (nextGroup?.sportConfigId) {
      setValue("sportConfigId", nextGroup.sportConfigId);
      setValue("apparatus", []);
    }
  };

  const handleSportConfigChange = (configId: string) => {
    setValue("sportConfigId", configId);
    setValue("apparatus", []);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setSubmitError(null);
    onClose();
  };

  const onValid = (values: ClassFormValues) => {
    setSubmitError(null);

    startTransition(async () => {
      try {
        const payload = {
          academyId,
          name: values.name,
          weekdays: (values.weekdays ?? []).map((day) => Number(day)),
          startTime: values.startTime || undefined,
          endTime: values.endTime || undefined,
          capacity: values.capacity ? Number(values.capacity) : undefined,
          technicalFocus: values.technicalFocus?.trim() || undefined,
          apparatus: values.apparatus,
          groupId: values.groupId || undefined,
          sportConfigId: effectiveSportConfigId || undefined,
          allowsFreeTrial: values.allowsFreeTrial,
          waitingListEnabled: values.waitingListEnabled,
          cancellationHoursBefore: values.cancellationHoursBefore
            ? Number(values.cancellationHoursBefore)
            : 24,
          cancellationPolicy: values.cancellationPolicy,
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
          throw new Error(data.error ?? `No se pudo crear la ${classTermLower}.`);
        }

        reset({ ...defaultValues, sportConfigId: resolvedInitialSportConfigId });
        setShowAdvanced(false);
        onCreated();
        onClose();
      } catch (err: unknown) {
        logger.apiError("/classes", "POST", err as Error);
        const message =
          err instanceof Error ? err.message : `Error desconocido al crear la ${classTermLower}.`;
        setSubmitError(message);
      }
    });
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Crear ${classTermLower}`}
      description={`Define los datos básicos de ${classTermLower}, ${terms.apparatus.toLowerCase()}s y ${coachTermLower}s compatibles con la rama.`}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="min-h-11 rounded-xl border border-zaltyko-indigo px-4 py-2 text-sm font-medium text-zaltyko-indigo transition hover:bg-zaltyko-indigo/5 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="create-class-form"
            className="min-h-11 rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || !isValid}
          >
            {isSubmitting ? "Guardando..." : `Guardar ${classTermLower}`}
          </button>
        </div>
      }
    >
      <form id="create-class-form" onSubmit={handleSubmit(onValid)} className="space-y-5" noValidate>
        {submitError && (
          <div
            className="rounded-xl border border-zaltyko-coral/35 bg-zaltyko-coral/10 px-3 py-2 text-sm text-zaltyko-coral"
            role="alert"
          >
            {submitError}
          </div>
        )}

        {/* Campos esenciales */}
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
              Nombre de la {classTermLower} *
            </label>
            <input
              {...register("name")}
              className={fieldClassName}
              placeholder={`Ej: ${classNameSuggestions[0]?.name ?? `${specialization.labels.classLabel} base`}`}
              aria-invalid={!!errors.name}
              autoComplete="off"
            />
            {errors.name && (
              <p className={errorTextClassName} role="alert">
                {errors.name.message}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              {classNameSuggestions.map((suggestion) => (
                <button
                  key={suggestion.name}
                  type="button"
                  onClick={() => setValue("name", suggestion.name, { shouldValidate: true })}
                  className="rounded-full border border-zaltyko-mist bg-white px-3 py-1.5 text-xs font-semibold text-zaltyko-navy transition hover:border-zaltyko-teal hover:bg-zaltyko-teal/10 hover:text-zaltyko-teal"
                  title={suggestion.description}
                >
                  {suggestion.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-zaltyko-text-secondary">
              Sugerencias tecnicas para {specialization.labels.disciplineName.toLowerCase()}.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                Dias de la semana
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setValue("weekdays", [], { shouldValidate: true })}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    weekdaysValue.length === 0 ? selectedChipClassName : unselectedChipClassName
                  }`}
                >
                  Sin dia fijo
                </button>
                {WEEKDAY_OPTIONS.map((option) => {
                  const selected = weekdaysValue.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleWeekday(option.value)}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        selected ? selectedChipClassName : unselectedChipClassName
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                Capacidad
              </label>
              <input
                {...register("capacity")}
                type="number"
                min={1}
                className={fieldClassName}
                placeholder="20"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                Hora de inicio
              </label>
              <input
                {...register("startTime")}
                type="time"
                className={fieldClassName}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                Hora de fin
              </label>
              <input
                {...register("endTime")}
                type="time"
                className={fieldClassName}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
              Foco tecnico del bloque
            </label>
            <textarea
              {...register("technicalFocus")}
              className={`${fieldClassName} min-h-24`}
              placeholder={classNameSuggestions[0]?.description ?? "Describe el objetivo tecnico principal de este entrenamiento."}
            />
          </div>

          {coachOptions.length > 0 && (
            <div className="rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white px-3 py-2 text-xs text-zaltyko-text-secondary">
              {compatibleCoachOptions.length} de {coachOptions.length} {coachTermLower}s disponibles para esta rama.
            </div>
          )}

          {(groupOptions.length > 0 || sportConfigs.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {groupOptions.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                    {terms.group} vinculado
                  </label>
                  <select
                    value={groupIdValue}
                    onChange={(event) => handleGroupChange(event.target.value)}
                    className={fieldClassName}
                  >
                    <option value="">Sin {groupTermLower}</option>
                    {compatibleGroupOptions.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {sportConfigs.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                    Modalidad / rama
                  </label>
                  <select
                    value={effectiveSportConfigId}
                    onChange={(event) => handleSportConfigChange(event.target.value)}
                    className={fieldClassName}
                    disabled={Boolean(selectedGroup?.sportConfigId)}
                  >
                    <option value="">Sin asignar</option>
                    {sportConfigs.map((config) => (
                      <option key={config.id} value={config.id}>
                        {config.disciplineName} · {config.branchName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
              {terms.apparatus}s / material principal
            </label>
            <div className="flex flex-wrap gap-2">
              {apparatusOptions.map((item) => {
                const selected = apparatusValue.includes(item.code);
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => toggleApparatus(item.code)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      selected ? selectedChipClassName : unselectedChipClassName
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
          {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showAdvanced && (
          <div className="space-y-4 rounded-2xl border border-zaltyko-mist bg-zaltyko-warm-white p-4">
            <Controller
              control={control}
              name="allowsFreeTrial"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm text-zaltyko-navy">
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                    className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
                  />
                  Permite {classTermLower} de prueba gratuita
                </label>
              )}
            />

            <Controller
              control={control}
              name="waitingListEnabled"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm text-zaltyko-navy">
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                    className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
                  />
                  Habilitar lista de espera
                </label>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                  Politica de cancelacion
                </label>
                <Controller
                  control={control}
                  name="cancellationPolicy"
                  render={({ field }) => (
                    <select {...field} className={fieldClassName}>
                      <option value="flexible">Flexible (cancelar hasta 2h antes)</option>
                      <option value="standard">Estandar (cancelar hasta 24h antes)</option>
                      <option value="strict">Estricta (cancelar hasta 48h antes)</option>
                    </select>
                  )}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                  Horas minimas para cancelar
                </label>
                <Controller
                  control={control}
                  name="cancellationHoursBefore"
                  render={({ field }) => (
                    <input
                      type="number"
                      min={0}
                      max={168}
                      value={field.value}
                      onChange={(event) => field.onChange(Number(event.target.value))}
                      className={fieldClassName}
                    />
                  )}
                />
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
