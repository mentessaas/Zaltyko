"use client";

import { Controller } from "react-hook-form";
import type {
  Control,
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EVENT_LEVELS, EVENT_STATUSES, type EventFormValues } from "./event-form-model";
import { FileUpload } from "./FileUpload";
import { LocationSelect } from "./LocationSelect";

const fieldClassName =
  "w-full rounded-[10px] border border-zaltyko-mist bg-white px-4 py-2.5 text-sm text-zaltyko-navy shadow-none focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15 disabled:bg-zaltyko-warm-white disabled:text-zaltyko-text-secondary";
const labelClassName = "mb-2 block text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy";
const sectionClassName = "sm:col-span-2 border-t border-zaltyko-mist pt-4";
const errorTextClassName = "mt-1 text-xs text-zaltyko-coral";

export interface SportConfigOption {
  id: string;
  name: string;
  disciplineName: string;
  branchName: string;
  defaultDisciplineVariant: string;
  competitionTypes: Array<{ code: string; name: string }>;
}

interface EventTypeOption {
  value: string;
  label: string;
}

interface EventFormSectionProps {
  control: Control<EventFormValues>;
  register: UseFormRegister<EventFormValues>;
  errors: FieldErrors<EventFormValues>;
}

export function EventDetailsSection({
  control,
  register,
  errors,
  watch,
  setValue,
  sportConfigs,
  sportConfigIdValue,
  selectedSportConfig,
  eventTypeValue,
  competitionTypeCodeValue,
  displayedEventTypes,
  registrationStartDateValue,
  registrationEndDateValue,
  startDateValue,
  disciplineName,
  onSportConfigChange,
}: EventFormSectionProps & {
  watch: UseFormWatch<EventFormValues>;
  setValue: UseFormSetValue<EventFormValues>;
  sportConfigs: SportConfigOption[];
  sportConfigIdValue: string;
  selectedSportConfig: SportConfigOption | null;
  eventTypeValue: string;
  competitionTypeCodeValue: string;
  displayedEventTypes: EventTypeOption[];
  registrationStartDateValue: string;
  registrationEndDateValue: string;
  startDateValue: string;
  disciplineName: string;
  onSportConfigChange: (nextId: string) => void;
}) {
  return (
    <>
      <div className="sm:col-span-2">
        <label htmlFor="title" className={labelClassName}>
          Título <span className="text-zaltyko-coral">*</span>
        </label>
        <input
          id="title"
          type="text"
          {...register("title")}
          className={fieldClassName}
          placeholder={`Nombre del evento o cita de ${disciplineName.toLowerCase()}`}
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
        <select id="level" {...register("level")} className={fieldClassName} aria-invalid={!!errors.level}>
          {EVENT_LEVELS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
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
          onChange={(event) => onSportConfigChange(event.target.value)}
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
          {displayedEventTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="registrationStartDate" className={labelClassName}>
          Fecha inicio inscripción
        </label>
        <input id="registrationStartDate" type="date" {...register("registrationStartDate")} className={fieldClassName} />
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
              <Switch id="isPublic" checked={field.value ?? false} onCheckedChange={(checked) => field.onChange(checked)} />
              <Label htmlFor="isPublic" className="cursor-pointer text-sm font-medium text-zaltyko-navy">
                Evento público (aparecerá en el directorio público)
              </Label>
            </div>
          )}
        />
      </div>
    </>
  );
}

export function EventMediaSection({
  control,
  effectiveEventId,
  isSubmitting,
}: {
  control: Control<EventFormValues>;
  effectiveEventId?: string;
  isSubmitting: boolean;
}) {
  return (
    <>
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
    </>
  );
}

export function EventNotificationSection({ control }: { control: Control<EventFormValues> }) {
  return (
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
                <Switch id={key} checked={field.value ?? false} onCheckedChange={(checked) => field.onChange(checked)} />
              </div>
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function EventContactSection({ register, errors }: Pick<EventFormSectionProps, "register" | "errors">) {
  return (
    <>
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
    </>
  );
}

export function EventRegistrationSection({ control, register }: Pick<EventFormSectionProps, "control" | "register">) {
  return (
    <div className={sectionClassName}>
      <h3 className="mb-4 font-display text-base font-semibold text-zaltyko-navy">Inscripciones</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="status" className={labelClassName}>
            Estado del evento
          </label>
          <select id="status" {...register("status")} className={fieldClassName}>
            {EVENT_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
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
                onChange={(event) => field.onChange(Math.round(parseFloat(event.target.value) * 100) || 0)}
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
  );
}

export function EventFormActions({
  effectiveEventId,
  isSubmitting,
  isValid,
  onCancel,
}: {
  effectiveEventId?: string;
  isSubmitting: boolean;
  isValid: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-4">
      <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting} className="min-h-11">
        Cancelar
      </Button>
      <Button type="submit" disabled={isSubmitting || !isValid} className="min-h-11">
        {isSubmitting ? "Guardando..." : effectiveEventId ? "Actualizar evento" : "Crear evento"}
      </Button>
    </div>
  );
}
