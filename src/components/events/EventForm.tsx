"use client";

import { memo, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LocationSelect } from "./LocationSelect";
import { FileUpload } from "./FileUpload";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { normalizeEventFormData, type EventFormInitialData } from "@/types/event-form";
import type { EventDiscipline, EventLevel, EventType } from "@/types/events";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getSpecializedEventTypes } from "@/lib/specialization/registry";

const EVENT_LEVELS = [
  { value: "internal", label: "Interno" },
  { value: "local", label: "Local" },
  { value: "national", label: "Nacional" },
  { value: "international", label: "Internacional" },
] as const;

const EVENT_DISCIPLINES = [
  { value: "artistic_female", label: "Gimnasia Artística Femenina" },
  { value: "artistic_male", label: "Gimnasia Artística Masculina" },
  { value: "rhythmic", label: "Gimnasia Rítmica" },
] as const;

const EVENT_DISCIPLINE_VALUES = new Set(EVENT_DISCIPLINES.map((item) => item.value));

const EVENT_STATUSES = [
  { value: "draft", label: "Borrador" },
  { value: "published", label: "Publicado" },
  { value: "cancelled", label: "Cancelado" },
  { value: "completed", label: "Completado" },
] as const;

const fieldClassName =
  "w-full rounded-[10px] border border-zaltyko-mist bg-white px-4 py-2.5 text-sm text-zaltyko-navy shadow-none focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15 disabled:bg-zaltyko-warm-white disabled:text-zaltyko-text-secondary";
const labelClassName = "mb-2 block text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy";
const sectionClassName = "sm:col-span-2 border-t border-zaltyko-mist pt-4";
const errorTextClassName = "mt-1 text-xs text-zaltyko-coral";

// Esquema Zod. Campos complejos (level, status, discipline) se mantienen como string
// para preservar compatibilidad con la API existente; usamos z.string no-empty.
const eventFormSchema = z.object({
  title: z.string().trim().min(1, "Título obligatorio"),
  description: z.string().optional(),
  category: z.string().optional(),
  isPublic: z.boolean().optional(),
  level: z.string().min(1, "Nivel obligatorio"),
  discipline: z.string().optional(),
  sportConfigId: z.string().optional(),
  eventType: z.string().optional(),
  competitionTypeCode: z.string().optional(),
  startDate: z.string().min(1, "Fecha de inicio obligatoria"),
  endDate: z.string().optional(),
  registrationStartDate: z.string().optional(),
  registrationEndDate: z.string().optional(),
  countryCode: z.string().optional(),
  countryName: z.string().optional(),
  provinceName: z.string().optional(),
  cityName: z.string().optional(),
  country: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  contactEmail: z.string().email("Email no válido").or(z.literal("")).optional(),
  contactPhone: z.string().optional(),
  contactInstagram: z.string().optional(),
  contactWebsite: z.string().url("URL no válida").or(z.literal("")).optional(),
  images: z.array(z.string()).optional(),
  attachments: z.array(z.object({ name: z.string(), url: z.string(), type: z.string().optional() })).optional(),
  notifyInternalStaff: z.boolean().optional(),
  notifyCityAcademies: z.boolean().optional(),
  notifyProvinceAcademies: z.boolean().optional(),
  notifyCountryAcademies: z.boolean().optional(),
  status: z.string().min(1),
  maxCapacity: z.number().optional(),
  registrationFee: z.number().optional(),
  allowWaitlist: z.boolean().optional(),
  waitlistMaxSize: z.number().optional(),
});

type EventFormValues = z.input<typeof eventFormSchema>;

interface SportConfigOption {
  id: string;
  name: string;
  disciplineName: string;
  branchName: string;
  defaultDisciplineVariant: string;
  competitionTypes: Array<{ code: string; name: string }>;
}

function getDefaultEventDiscipline(value: string): EventDiscipline | "" {
  return EVENT_DISCIPLINE_VALUES.has(value as EventDiscipline) ? (value as EventDiscipline) : "";
}

interface EventFormProps {
  academyId: string;
  sportConfigs?: SportConfigOption[];
  eventId?: string;
  initialData?: EventFormInitialData;
  onSuccess?: () => void;
  open?: boolean;
  onClose?: () => void;
  event?: {
    id: string;
    title: string;
    date?: string | null;
    location?: string | null;
    status?: string | null;
  } | null;
  onSaved?: () => void;
}

export const EventForm = memo(function EventForm({
  academyId,
  sportConfigs = [],
  eventId,
  initialData,
  onSuccess,
  open,
  onClose,
  event,
  onSaved,
}: EventFormProps) {
  const router = useRouter();
  const { specialization } = useAcademyContext();
  const eventTypes = getSpecializedEventTypes(specialization);

  const effectiveEventId = eventId || event?.id;
  const effectiveInitialData: EventFormInitialData | undefined = useMemo(() => {
    return initialData || (event ? {
      title: event.title,
      startDate: event.date || undefined,
      ...(event.location ? (() => {
        const parts = event.location.split(",").map((p: string) => p.trim());
        if (parts.length >= 3) {
          return { city: parts[0], province: parts[1], country: parts[2] };
        } else if (parts.length === 2) {
          return { city: parts[0], province: parts[1] };
        } else if (parts.length === 1) {
          return { city: parts[0] };
        }
        return {};
      })() : {}),
      isPublic: event.status === "published" || event.status === "public",
    } : undefined);
  }, [initialData, event]);

  const normalized = useMemo(() => normalizeEventFormData(effectiveInitialData), [effectiveInitialData]);

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: normalized.title,
      description: normalized.description,
      category: Array.isArray(normalized.category) ? normalized.category.join(", ") : "",
      isPublic: normalized.isPublic,
      level: normalized.level,
      discipline: normalized.discipline,
      sportConfigId: normalized.sportConfigId,
      eventType: normalized.eventType,
      competitionTypeCode: normalized.competitionTypeCode,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      registrationStartDate: normalized.registrationStartDate,
      registrationEndDate: normalized.registrationEndDate,
      countryCode: normalized.countryCode,
      countryName: normalized.countryName,
      provinceName: normalized.provinceName,
      cityName: normalized.cityName,
      country: normalized.country,
      province: normalized.province,
      city: normalized.city,
      contactEmail: normalized.contactEmail,
      contactPhone: normalized.contactPhone,
      contactInstagram: normalized.contactInstagram,
      contactWebsite: normalized.contactWebsite,
      images: normalized.images,
      attachments: normalized.attachments,
      notifyInternalStaff: normalized.notifyInternalStaff,
      notifyCityAcademies: normalized.notifyCityAcademies,
      notifyProvinceAcademies: normalized.notifyProvinceAcademies,
      notifyCountryAcademies: normalized.notifyCountryAcademies,
      status: normalized.status,
      maxCapacity: normalized.maxCapacity,
      registrationFee: normalized.registrationFee,
      allowWaitlist: normalized.allowWaitlist,
      waitlistMaxSize: normalized.waitlistMaxSize,
    },
    mode: "onChange",
  });

  const sportConfigIdValue = watch("sportConfigId") ?? "";
  const eventTypeValue = watch("eventType") ?? "";
  const competitionTypeCodeValue = watch("competitionTypeCode") ?? "";
  const registrationStartDateValue = watch("registrationStartDate") ?? "";
  const registrationEndDateValue = watch("registrationEndDate") ?? "";
  const startDateValue = watch("startDate") ?? "";
  const selectedSportConfig = useMemo(
    () => sportConfigs.find((config) => config.id === sportConfigIdValue) ?? null,
    [sportConfigs, sportConfigIdValue]
  );
  const displayedEventTypes = useMemo(
    () =>
      selectedSportConfig && selectedSportConfig.competitionTypes.length > 0
        ? selectedSportConfig.competitionTypes.map((item) => ({ value: item.code, label: item.name }))
        : eventTypes,
    [selectedSportConfig, eventTypes]
  );

  // Reset cuando cambia el evento externo
  useEffect(() => {
    if (event || initialData) {
      reset({
        title: normalized.title,
        description: normalized.description,
        category: Array.isArray(normalized.category) ? normalized.category.join(", ") : "",
        isPublic: normalized.isPublic,
        level: normalized.level,
        discipline: normalized.discipline,
        sportConfigId: normalized.sportConfigId,
        eventType: normalized.eventType,
        competitionTypeCode: normalized.competitionTypeCode,
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        registrationStartDate: normalized.registrationStartDate,
        registrationEndDate: normalized.registrationEndDate,
        countryCode: normalized.countryCode,
        countryName: normalized.countryName,
        provinceName: normalized.provinceName,
        cityName: normalized.cityName,
        country: normalized.country,
        province: normalized.province,
        city: normalized.city,
        contactEmail: normalized.contactEmail,
        contactPhone: normalized.contactPhone,
        contactInstagram: normalized.contactInstagram,
        contactWebsite: normalized.contactWebsite,
        images: normalized.images,
        attachments: normalized.attachments,
        notifyInternalStaff: normalized.notifyInternalStaff,
        notifyCityAcademies: normalized.notifyCityAcademies,
        notifyProvinceAcademies: normalized.notifyProvinceAcademies,
        notifyCountryAcademies: normalized.notifyCountryAcademies,
        status: normalized.status,
        maxCapacity: normalized.maxCapacity,
        registrationFee: normalized.registrationFee,
        allowWaitlist: normalized.allowWaitlist,
        waitlistMaxSize: normalized.waitlistMaxSize,
      });
    }
  }, [event, initialData, normalized, reset]);

  // Default discipline variant segun especializacion
  useEffect(() => {
    const defaultDiscipline = getDefaultEventDiscipline(specialization.disciplineVariant);
    if (!defaultDiscipline) return;
    const currentDiscipline = watch("discipline");
    if (!currentDiscipline) {
      setValue("discipline", defaultDiscipline, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialization.disciplineVariant]);

  const handleSportConfigChange = (nextId: string) => {
    const config = sportConfigs.find((item) => item.id === nextId);
    setValue("sportConfigId", nextId, { shouldValidate: true });
    if (config?.defaultDisciplineVariant) {
      setValue("discipline", config.defaultDisciplineVariant, { shouldValidate: true });
    }
    setValue("competitionTypeCode", "", { shouldValidate: true });
  };

  const onValid = async (values: EventFormValues) => {
    try {
      const categoryVal = values.category;
      const categoryArray = categoryVal
        ? categoryVal.split(",").map((c) => c.trim()).filter(Boolean)
        : undefined;

      const payload = {
        academyId,
        title: values.title,
        description: values.description || undefined,
        category: categoryArray,
        isPublic: values.isPublic ?? false,
        level: values.level as EventLevel,
        discipline: values.discipline || undefined,
        sportConfigId: values.sportConfigId || undefined,
        eventType: (values.eventType || undefined) as EventType | undefined,
        competitionTypeCode: values.competitionTypeCode || undefined,
        startDate: values.startDate || undefined,
        endDate: values.endDate || undefined,
        registrationStartDate: values.registrationStartDate || undefined,
        registrationEndDate: values.registrationEndDate || undefined,
        countryCode: values.countryCode || undefined,
        countryName: values.countryName || undefined,
        provinceName: values.provinceName || undefined,
        cityName: values.cityName || undefined,
        country: values.countryName || values.country || undefined,
        province: values.provinceName || values.province || undefined,
        city: values.cityName || values.city || undefined,
        contactEmail: values.contactEmail || undefined,
        contactPhone: values.contactPhone || undefined,
        contactInstagram: values.contactInstagram || undefined,
        contactWebsite: values.contactWebsite || undefined,
        images: (values.images ?? []).length > 0 ? values.images : undefined,
        attachments: (values.attachments ?? []).map((att, index: number) => ({
          name: att.name || `Archivo ${index + 1}`,
          url: typeof att === "string" ? att : att.url,
        })),
        notifyInternalStaff: values.notifyInternalStaff ?? false,
        notifyCityAcademies: values.notifyCityAcademies ?? false,
        notifyProvinceAcademies: values.notifyProvinceAcademies ?? false,
        notifyCountryAcademies: values.notifyCountryAcademies ?? false,
        status: values.status,
        maxCapacity: values.maxCapacity || null,
        registrationFee: values.registrationFee || null,
        allowWaitlist: values.allowWaitlist ?? false,
        waitlistMaxSize: values.waitlistMaxSize || null,
      };

      const url = effectiveEventId ? `/api/events/${effectiveEventId}` : "/api/events";
      const method = effectiveEventId ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-academy-id": academyId,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Error al guardar el evento");
      }

      if (onSaved) {
        onSaved();
      } else if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/app/${academyId}/events`);
        router.refresh();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error al guardar el evento";
      throw new Error(errorMessage);
    }
  };

  const onInvalid = (validationErrors: typeof errors) => {
    const firstError = Object.values(validationErrors)[0];
    if (firstError?.message) {
      // Mostrar via aria-live via DOM, el role=alert en inputs ya cubre screen readers
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit(onValid, onInvalid)} className="space-y-6" noValidate>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="title" className={labelClassName}>
            Título <span className="text-zaltyko-coral">*</span>
          </label>
          <input
            id="title"
            type="text"
            {...register("title")}
            className={fieldClassName}
            placeholder={`Nombre del evento o cita de ${specialization.labels.disciplineName.toLowerCase()}`}
            aria-invalid={!!errors.title}
          />
          {errors.title && (
            <p className={errorTextClassName} role="alert">
              {errors.title.message}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="description" className={labelClassName}>
            Descripción
          </label>
          <textarea
            id="description"
            rows={4}
            {...register("description")}
            className={fieldClassName}
            placeholder="Información clave, participantes, objetivos o notas importantes..."
          />
        </div>

        <div>
          <label htmlFor="level" className={labelClassName}>
            Nivel <span className="text-zaltyko-coral">*</span>
          </label>
          <select
            id="level"
            {...register("level")}
            className={fieldClassName}
            aria-invalid={!!errors.level}
          >
            {EVENT_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          {errors.level && (
            <p className={errorTextClassName} role="alert">
              {errors.level.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="sportConfigId" className={labelClassName}>
            Rama / modalidad
          </label>
          <select
            id="sportConfigId"
            value={sportConfigIdValue}
            onChange={(event) => handleSportConfigChange(event.target.value)}
            className={fieldClassName}
          >
            <option value="">Sin rama específica</option>
            {sportConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.branchName} · {config.disciplineName}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-zaltyko-text-secondary">
            Se usa para cargar tipos de competición y evitar mezclar ramas.
          </p>
        </div>

        <div>
          <label htmlFor="eventType" className={labelClassName}>
            Tipo de competición / evento
          </label>
          <select
            id="eventType"
            value={selectedSportConfig ? competitionTypeCodeValue : eventTypeValue}
            onChange={(event) => {
              if (selectedSportConfig) {
                setValue("competitionTypeCode", event.target.value, { shouldValidate: true });
              } else {
                setValue("eventType", event.target.value, { shouldValidate: true });
              }
            }}
            className={fieldClassName}
          >
            <option value="">Selecciona un tipo</option>
            {displayedEventTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="registrationStartDate" className={labelClassName}>
            Fecha inicio inscripción
          </label>
          <input
            id="registrationStartDate"
            type="date"
            {...register("registrationStartDate")}
            className={fieldClassName}
          />
        </div>

        <div>
          <label htmlFor="registrationEndDate" className={labelClassName}>
            Fecha fin inscripción
          </label>
          <input
            id="registrationEndDate"
            type="date"
            min={registrationStartDateValue || undefined}
            {...register("registrationEndDate")}
            className={fieldClassName}
          />
        </div>

        <div>
          <label htmlFor="startDate" className={labelClassName}>
            Fecha inicio evento <span className="text-zaltyko-coral">*</span>
          </label>
          <input
            id="startDate"
            type="date"
            min={registrationEndDateValue || undefined}
            {...register("startDate")}
            className={fieldClassName}
            aria-invalid={!!errors.startDate}
          />
          {errors.startDate && (
            <p className={errorTextClassName} role="alert">
              {errors.startDate.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="endDate" className={labelClassName}>
            Fecha fin evento
          </label>
          <input
            id="endDate"
            type="date"
            min={startDateValue || undefined}
            {...register("endDate")}
            className={fieldClassName}
          />
        </div>

        <div className="sm:col-span-2">
          <Controller
            control={control}
            name="countryCode"
            render={({ field }) => (
              <LocationSelect
                countryCode={field.value ?? ""}
                countryName={watch("countryName") ?? ""}
                provinceName={watch("provinceName") ?? ""}
                cityName={watch("cityName") ?? ""}
                onLocationChange={(location) => {
                  setValue("countryCode", location.countryCode, { shouldValidate: true });
                  setValue("countryName", location.countryName, { shouldValidate: true });
                  setValue("provinceName", location.provinceName, { shouldValidate: true });
                  setValue("cityName", location.cityName, { shouldValidate: true });
                }}
              />
            )}
          />
        </div>

        <div>
          <label htmlFor="category" className={labelClassName}>
            Categorías (separadas por comas)
          </label>
          <input
            id="category"
            type="text"
            {...register("category")}
            className={fieldClassName}
            placeholder="FIG Level 1, Edad 8-10"
          />
        </div>

        <div className="sm:col-span-2">
          <Controller
            control={control}
            name="isPublic"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Switch
                  id="isPublic"
                  checked={field.value ?? false}
                  onCheckedChange={(checked) => field.onChange(checked)}
                />
                <Label htmlFor="isPublic" className="cursor-pointer text-sm font-medium text-zaltyko-navy">
                  Evento público (aparecerá en el directorio público)
                </Label>
              </div>
            )}
          />
        </div>

        <div className="sm:col-span-2">
          <Controller
            control={control}
            name="images"
            render={({ field }) => (
              <FileUpload
                type="image"
                label="Imágenes del evento"
                accept="image/*"
                maxSizeMB={10}
                files={field.value ?? []}
                onFilesChange={(files) => field.onChange(files)}
                eventId={effectiveEventId}
                disabled={isSubmitting}
              />
            )}
          />
        </div>

        <div className="sm:col-span-2">
          <Controller
            control={control}
            name="attachments"
            render={({ field }) => (
              <FileUpload
                type="file"
                label="Archivos adjuntos (PDFs, documentos)"
                accept=".pdf,.doc,.docx"
                maxSizeMB={10}
                files={(field.value ?? []) as unknown as string[]}
                onFilesChange={(files) => field.onChange(files as unknown as Array<{ name: string; url: string; type?: string }>)}
                eventId={effectiveEventId}
                disabled={isSubmitting}
              />
            )}
          />
        </div>

        <div className={sectionClassName}>
          <h3 className="mb-4 font-display text-base font-semibold text-zaltyko-navy">Opciones de notificación</h3>
          <div className="space-y-3">
            {(
              [
                ["notifyInternalStaff", "Notificar personal interno"],
                ["notifyCityAcademies", "Notificar academias de la misma ciudad"],
                ["notifyProvinceAcademies", "Notificar academias de la misma provincia"],
                ["notifyCountryAcademies", "Notificar academias del mismo país"],
              ] as const
            ).map(([key, label]) => (
              <Controller
                key={key}
                control={control}
                name={key}
                render={({ field }) => (
                  <div className="flex items-center justify-between">
                    <Label htmlFor={key} className="cursor-pointer text-sm font-medium text-zaltyko-navy">
                      {label}
                    </Label>
                    <Switch
                      id={key}
                      checked={field.value ?? false}
                      onCheckedChange={(checked) => field.onChange(checked)}
                    />
                  </div>
                )}
              />
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="contactEmail" className={labelClassName}>
            Email de contacto
          </label>
          <input
            id="contactEmail"
            type="email"
            {...register("contactEmail")}
            className={fieldClassName}
            placeholder="contacto@evento.com"
            aria-invalid={!!errors.contactEmail}
          />
          {errors.contactEmail && (
            <p className={errorTextClassName} role="alert">
              {errors.contactEmail.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="contactPhone" className={labelClassName}>
            Teléfono de contacto
          </label>
          <input
            id="contactPhone"
            type="tel"
            {...register("contactPhone")}
            className={fieldClassName}
            placeholder="+34 600 000 000"
          />
        </div>

        <div>
          <label htmlFor="contactInstagram" className={labelClassName}>
            Instagram
          </label>
          <input
            id="contactInstagram"
            type="text"
            {...register("contactInstagram")}
            className={fieldClassName}
            placeholder="@evento"
          />
        </div>

        <div>
          <label htmlFor="contactWebsite" className={labelClassName}>
            Sitio web
          </label>
          <input
            id="contactWebsite"
            type="url"
            {...register("contactWebsite")}
            className={fieldClassName}
            placeholder="https://evento.com"
            aria-invalid={!!errors.contactWebsite}
          />
          {errors.contactWebsite && (
            <p className={errorTextClassName} role="alert">
              {errors.contactWebsite.message}
            </p>
          )}
        </div>

        <div className={sectionClassName}>
          <h3 className="mb-4 font-display text-base font-semibold text-zaltyko-navy">Inscripciones</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="status" className={labelClassName}>
                Estado del evento
              </label>
              <select
                id="status"
                {...register("status")}
                className={fieldClassName}
              >
                {EVENT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="maxCapacity" className={labelClassName}>
                Capacidad máxima
              </label>
              <input
                id="maxCapacity"
                type="number"
                min="0"
                {...register("maxCapacity", { valueAsNumber: true })}
                className={fieldClassName}
                placeholder="Sin límite"
              />
            </div>

            <div>
              <label htmlFor="registrationFee" className={labelClassName}>
                Precio de inscripción (€)
              </label>
              <Controller
                control={control}
                name="registrationFee"
                render={({ field }) => (
                  <input
                    id="registrationFee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={field.value ? (field.value / 100).toString() : ""}
                    onChange={(event) =>
                      field.onChange(Math.round(parseFloat(event.target.value) * 100) || 0)
                    }
                    className={fieldClassName}
                    placeholder="0.00"
                  />
                )}
              />
            </div>

            <div>
              <label htmlFor="waitlistMaxSize" className={labelClassName}>
                Tamaño máximo de lista de espera
              </label>
              <input
                id="waitlistMaxSize"
                type="number"
                min="0"
                {...register("waitlistMaxSize", { valueAsNumber: true })}
                className={fieldClassName}
                placeholder="Sin límite"
              />
            </div>

            <div className="sm:col-span-2">
              <Controller
                control={control}
                name="allowWaitlist"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="allowWaitlist"
                      checked={field.value ?? false}
                      onCheckedChange={(checked) => field.onChange(checked)}
                    />
                    <Label htmlFor="allowWaitlist" className="cursor-pointer text-sm font-medium text-zaltyko-navy">
                      Permitir lista de espera cuando el evento esté lleno
                    </Label>
                  </div>
                )}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
          disabled={isSubmitting}
          className="min-h-11"
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting || !isValid} className="min-h-11">
          {isSubmitting ? "Guardando..." : effectiveEventId ? "Actualizar evento" : "Crear evento"}
        </Button>
      </div>
    </form>
  );

  if (open !== undefined) {
    return (
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && onClose) {
            onClose();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-zaltyko-mist bg-zaltyko-warm-white">
          <DialogHeader>
            <DialogTitle className="font-display text-zaltyko-navy">
              {effectiveEventId ? "Editar evento" : "Crear nuevo evento"}
            </DialogTitle>
            <DialogDescription className="text-zaltyko-text-secondary">
              {effectiveEventId ? "Modifica los detalles del evento existente" : "Crea un nuevo evento para tu academia"}
            </DialogDescription>
          </DialogHeader>
          {formContent}
        </DialogContent>
      </Dialog>
    );
  }

  return formContent;
});