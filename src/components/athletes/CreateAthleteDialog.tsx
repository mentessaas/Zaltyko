"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { athleteStatusOptions } from "@/lib/athletes/constants";

import { Modal } from "@/components/ui/modal";
import { Calendar as CalendarIcon, ChevronDown, ChevronUp } from "lucide-react";
import type { SportConfigOption } from "@/components/groups/types";
import type { GroupOption } from "@/types";
import { getTerminology } from "@/lib/sport-config/terminology";

const CATEGORY_OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;
const LEVEL_OPTIONS = [
  "Pre-nivel",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "FIG",
] as const;

const RELATIONSHIP_OPTIONS = [
  "Madre",
  "Padre",
  "Tutor",
  "Abuelo",
  "Abuela",
  "Hermano",
  "Hermana",
  "Tío",
  "Tía",
  "Otro",
] as const;

// ============================================================================
// Zod schemas
// ============================================================================

const contactSchema = z.object({
  name: z.string().trim().min(1, "Nombre obligatorio"),
  email: z
    .string()
    .trim()
    .min(1, "Correo obligatorio")
    .email("Correo invalido"),
  relationship: z.string().trim().min(1, "Relacion obligatoria"),
  phone: z.string().trim().min(1, "Telefono obligatorio"),
  notifyEmail: z.boolean(),
  notifySms: z.boolean(),
});

const athleteSchema = z.object({
  name: z.string().trim().min(1, "Nombre del atleta obligatorio"),
  dob: z.string().optional(),
  sportConfigId: z.string().optional(),
  programCode: z.string().optional(),
  category: z.string().optional(),
  level: z.string().optional(),
  status: z.enum(["active", "inactive", "archived"]),
  groupId: z.string().optional(),
  contacts: z.array(contactSchema).min(1, "Al menos un contacto familiar"),
});

type AthleteFormValues = z.infer<typeof athleteSchema>;
type ContactFormValues = z.infer<typeof contactSchema>;

const emptyContact = (): ContactFormValues => ({
  name: "",
  email: "",
  relationship: "Madre",
  phone: "",
  notifyEmail: true,
  notifySms: false,
});

const defaultValues: AthleteFormValues = {
  name: "",
  dob: "",
  sportConfigId: "",
  programCode: "",
  category: "",
  level: "",
  status: "active",
  groupId: "",
  contacts: [emptyContact()],
};

// ============================================================================
// Component
// ============================================================================

const fieldClassName =
  "w-full rounded-[10px] border border-zaltyko-mist bg-white px-3 py-2 text-sm shadow-none focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15";
const compactFieldClassName =
  "rounded-[10px] border border-zaltyko-mist bg-white px-3 py-2 text-sm shadow-none focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15";
const errorTextClassName = "text-xs text-zaltyko-coral mt-1";

interface CreateAthleteDialogProps {
  academyId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  groups?: GroupOption[];
  sportConfigs?: SportConfigOption[];
  initialSportConfigId?: string;
}

export function CreateAthleteDialog({
  academyId,
  open,
  onClose,
  onCreated,
  groups = [],
  sportConfigs = [],
  initialSportConfigId,
}: CreateAthleteDialogProps) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
    reset,
    watch,
    setValue,
  } = useForm<AthleteFormValues>({
    resolver: zodResolver(athleteSchema),
    defaultValues,
    mode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "contacts",
  });

  const [showAdvanced, setShowAdvanced] = useState(false); // local UI state
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sportConfigIdValue = watch("sportConfigId");
  const groupIdValue = watch("groupId");
  const programCodeValue = watch("programCode");
  const levelValue = watch("level");
  const categoryValue = watch("category");
  const dobValue = watch("dob");
  const statusValue = watch("status");
  const nameValue = watch("name");

  const resolvedInitialSportConfigId = useMemo(
    () =>
      initialSportConfigId && sportConfigs.some((config) => config.id === initialSportConfigId)
        ? initialSportConfigId
        : "",
    [initialSportConfigId, sportConfigs]
  );

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === groupIdValue) ?? null,
    [groupIdValue, groups]
  );

  const effectiveSportConfigId = selectedGroup?.sportConfigId ?? sportConfigIdValue;
  const selectedSportConfig = useMemo(
    () => sportConfigs.find((config) => config.id === effectiveSportConfigId) ?? null,
    [effectiveSportConfigId, sportConfigs]
  );
  const terms = getTerminology(selectedSportConfig);
  const athleteTerm = terms.athlete;
  const athleteTermLower = athleteTerm.toLowerCase();
  const groupTerm = terms.group;

  const programOptions = selectedSportConfig?.programs ?? [];
  const levelOptions = selectedSportConfig
    ? selectedSportConfig.levels.filter(
        (option) => !programCodeValue || !option.programCode || option.programCode === programCodeValue
      )
    : LEVEL_OPTIONS.map((option) => ({
        code: option,
        name: option === "Pre-nivel" ? "Pre-nivel" : option === "FIG" ? "FIG" : `Nivel ${option}`,
      }));
  const categoryOptions = selectedSportConfig
    ? selectedSportConfig.categories
    : CATEGORY_OPTIONS.map((option) => ({ code: option, name: option }));

  const selectedProgramName = programOptions.find((option) => option.code === programCodeValue)?.name ?? null;
  const selectedCategoryName = categoryOptions.find((option) => option.code === categoryValue)?.name ?? null;
  const selectedLevelName = levelOptions.find((option) => option.code === levelValue)?.name ?? null;

  const levelDisplay = [
    selectedProgramName,
    selectedCategoryName ? `${terms.category} ${selectedCategoryName}` : null,
    selectedLevelName,
  ]
    .filter(Boolean)
    .join(" · ");

  const computedAgeYears = useMemo(() => {
    if (!dobValue) return null;
    const birthDate = new Date(dobValue);
    if (Number.isNaN(birthDate.getTime())) return null;
    const now = new Date();
    let ageYears = now.getFullYear() - birthDate.getFullYear();
    const hasHadBirthdayThisYear =
      now.getMonth() > birthDate.getMonth() ||
      (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
    if (!hasHadBirthdayThisYear) {
      ageYears -= 1;
    }
    return ageYears >= 0 ? ageYears : null;
  }, [dobValue]);

  const computedAgeLabel = useMemo(() => {
    return computedAgeYears != null ? `${computedAgeYears} años` : "";
  }, [computedAgeYears]);

  const birthdateInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || groupIdValue || !resolvedInitialSportConfigId) {
      return;
    }
    setValue("sportConfigId", resolvedInitialSportConfigId);
  }, [groupIdValue, open, resolvedInitialSportConfigId, setValue]);

  const handleGroupChange = (nextGroupId: string) => {
    setValue("groupId", nextGroupId);
    const nextGroup = groups.find((group) => group.id === nextGroupId);
    if (nextGroup?.sportConfigId) setValue("sportConfigId", nextGroup.sportConfigId);
    if (nextGroup?.programCode) setValue("programCode", nextGroup.programCode);
    if (nextGroup?.levelCode) setValue("level", nextGroup.levelCode);
    if (nextGroup?.categoryCode) setValue("category", nextGroup.categoryCode);
  };

  const handleSportConfigChange = (configId: string) => {
    setValue("sportConfigId", configId);
    setValue("programCode", "");
    setValue("level", "");
    setValue("category", "");
  };

  const handleProgramChange = (code: string) => {
    setValue("programCode", code);
    setValue("level", "");
  };

  const onValid = (values: AthleteFormValues) => {
    setSubmitError(null);

    startTransition(async () => {
      try {
        const payload = {
          academyId,
          name: values.name,
          dob: values.dob ? values.dob : undefined,
          level: levelDisplay || undefined,
          status: values.status,
          groupId: values.groupId || undefined,
          primarySportConfigId: effectiveSportConfigId || undefined,
          programCode: values.programCode || selectedGroup?.programCode || undefined,
          levelCode: values.level || selectedGroup?.levelCode || undefined,
          categoryCode: values.category || selectedGroup?.categoryCode || undefined,
          contacts: values.contacts
            .map((contact) => ({
              name: contact.name,
              relationship: contact.relationship || undefined,
              email: contact.email || undefined,
              phone: contact.phone || undefined,
              notifyEmail: contact.notifyEmail,
              notifySms: contact.notifySms,
            }))
            .filter((contact) => contact.name.length > 0),
          ...(computedAgeYears != null ? { age: computedAgeYears } : {}),
        };

        const response = await fetch("/api/athletes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? `No se pudo crear el ${athleteTermLower}.`);
        }

        reset(defaultValues);
        setShowAdvanced(false);
        onCreated();
        onClose();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : `Error desconocido al crear el ${athleteTermLower}.`;
        setSubmitError(message);
      }
    });
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setSubmitError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Registrar nuevo ${athleteTermLower}`}
      description={`Anade un ${athleteTermLower} a tu academia.`}
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
            form="create-athlete-form"
            className="min-h-11 rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || !isValid}
          >
            {isSubmitting ? "Guardando..." : `Guardar ${athleteTermLower}`}
          </button>
        </div>
      }
    >
      <form id="create-athlete-form" onSubmit={handleSubmit(onValid)} className="space-y-5" noValidate>
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
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
              Nombre completo *
            </label>
            <input
              {...register("name")}
              className={fieldClassName}
              placeholder="Ej: Maria Garcia Lopez"
              aria-invalid={!!errors.name}
              autoComplete="off"
            />
            {errors.name && (
              <p className={errorTextClassName} role="alert">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                Fecha de nacimiento
              </label>
              <div className="flex items-center gap-2">
                <Controller
                  control={control}
                  name="dob"
                  render={({ field }) => (
                    <input
                      type="date"
                      value={field.value ?? ""}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      ref={(el) => {
                        field.ref(el);
                        if (el) birthdateInputRef.current = el;
                      }}
                      max={new Date().toISOString().slice(0, 10)}
                      className={fieldClassName}
                    />
                  )}
                />
                <button
                  type="button"
                  onClick={() => birthdateInputRef.current?.showPicker?.()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zaltyko-mist bg-white text-zaltyko-text-secondary transition hover:border-zaltyko-teal hover:text-zaltyko-teal"
                  aria-label="Seleccionar fecha"
                >
                  <CalendarIcon className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
              {computedAgeLabel && (
                <p className="text-xs text-zaltyko-text-secondary">Edad: {computedAgeLabel}</p>
              )}
            </div>

            {groups.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                  {groupTerm}
                </label>
                <select
                  value={groupIdValue}
                  onChange={(event) => handleGroupChange(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">Sin {groupTerm.toLowerCase()}</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {sportConfigs.length > 0 && (
              <div className="space-y-2">
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
        </div>

        {/* Opcion avanzada */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white px-3 py-2 text-sm font-medium text-zaltyko-text-secondary transition hover:border-zaltyko-teal hover:text-zaltyko-teal"
        >
          <span>Configuracion avanzada</span>
          {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showAdvanced && (
          <div className="space-y-4">
            {/* Nivel y categoria */}
            <div className="grid gap-4 sm:grid-cols-4">
              {programOptions.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                    Programa
                  </label>
                  <select
                    value={programCodeValue}
                    onChange={(event) => handleProgramChange(event.target.value)}
                    className={fieldClassName}
                  >
                    <option value="">Sin programa</option>
                    {programOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                  {terms.category}
                </label>
                <select
                  value={categoryValue}
                  onChange={(event) => setValue("category", event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">Sin {terms.category.toLowerCase()}</option>
                  {categoryOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                  {terms.level}
                </label>
                <select
                  value={levelValue}
                  onChange={(event) => setValue("level", event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">Selecciona {terms.level.toLowerCase()}</option>
                  {levelOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy">
                  Estado
                </label>
                <select
                  value={statusValue}
                  onChange={(event) =>
                    setValue("status", event.target.value as AthleteFormValues["status"])
                  }
                  className={fieldClassName}
                >
                  {athleteStatusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Contactos familiares */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zaltyko-navy">
                  Contactos familiares {fields.length > 1 ? `(${fields.length})` : ""}
                </h3>
                <button
                  type="button"
                  onClick={() => append(emptyContact())}
                  className="rounded-full border border-zaltyko-indigo px-3 py-1.5 text-xs font-medium text-zaltyko-indigo transition hover:bg-zaltyko-indigo/5"
                >
                  + Anadir
                </button>
              </div>

              {fields.map((contactField, index) => (
                <div
                  key={contactField.id}
                  className="space-y-3 rounded-xl border border-zaltyko-mist/70 bg-white p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.05em] text-zaltyko-text-secondary">
                      Contacto #{index + 1}
                    </p>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="text-xs font-medium text-zaltyko-coral hover:underline"
                      >
                        Quitar
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Controller
                      control={control}
                      name={`contacts.${index}.name` as const}
                      render={({ field, fieldState }) => (
                        <div className="space-y-1">
                          <input
                            {...field}
                            placeholder="Nombre *"
                            className={compactFieldClassName}
                            aria-invalid={!!fieldState.error}
                            autoComplete="off"
                          />
                          {fieldState.error && (
                            <p className={errorTextClassName} role="alert">
                              {fieldState.error.message}
                            </p>
                          )}
                        </div>
                      )}
                    />
                    <Controller
                      control={control}
                      name={`contacts.${index}.email` as const}
                      render={({ field, fieldState }) => (
                        <div className="space-y-1">
                          <input
                            {...field}
                            type="email"
                            placeholder="Correo *"
                            className={compactFieldClassName}
                            aria-invalid={!!fieldState.error}
                            autoComplete="off"
                          />
                          {fieldState.error && (
                            <p className={errorTextClassName} role="alert">
                              {fieldState.error.message}
                            </p>
                          )}
                        </div>
                      )}
                    />
                    <Controller
                      control={control}
                      name={`contacts.${index}.phone` as const}
                      render={({ field, fieldState }) => (
                        <div className="space-y-1">
                          <input
                            {...field}
                            placeholder="Telefono *"
                            className={compactFieldClassName}
                            aria-invalid={!!fieldState.error}
                            autoComplete="off"
                          />
                          {fieldState.error && (
                            <p className={errorTextClassName} role="alert">
                              {fieldState.error.message}
                            </p>
                          )}
                        </div>
                      )}
                    />
                    <Controller
                      control={control}
                      name={`contacts.${index}.relationship` as const}
                      render={({ field, fieldState }) => (
                        <div className="space-y-1">
                          <select
                            value={RELATIONSHIP_OPTIONS.includes(field.value as any) ? field.value : "Otro"}
                            onChange={(event) => {
                              const value = event.target.value;
                              field.onChange(value === "Otro" ? "" : value);
                            }}
                            className={compactFieldClassName}
                            aria-invalid={!!fieldState.error}
                          >
                            {RELATIONSHIP_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          {fieldState.error && (
                            <p className={errorTextClassName} role="alert">
                              {fieldState.error.message}
                            </p>
                          )}
                        </div>
                      )}
                    />
                  </div>

                  <div className="flex gap-4 text-xs text-zaltyko-text-secondary">
                    <Controller
                      control={control}
                      name={`contacts.${index}.notifyEmail` as const}
                      render={({ field }) => (
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={(event) => field.onChange(event.target.checked)}
                            className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
                          />
                          Recibir correos
                        </label>
                      )}
                    />
                    <Controller
                      control={control}
                      name={`contacts.${index}.notifySms` as const}
                      render={({ field }) => (
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={(event) => field.onChange(event.target.checked)}
                            className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
                          />
                          Recibir SMS
                        </label>
                      )}
                    />
                  </div>
                </div>
              ))}
              {errors.contacts && (
                <p className={errorTextClassName} role="alert">
                  {errors.contacts.message ?? "Al menos un contacto familiar es obligatorio"}
                </p>
              )}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}