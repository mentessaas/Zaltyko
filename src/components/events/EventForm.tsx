"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LocationSelect } from "./LocationSelect";
import { FileUpload } from "./FileUpload";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { normalizeEventFormData, type EventFormInitialData, type EventFormData } from "@/types/event-form";
import type { EventDiscipline } from "@/types/events";
import { validateEventForm } from "@/lib/validation/event-form-validator";
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

const fieldClassName =
  "w-full rounded-[10px] border border-zaltyko-mist bg-white px-4 py-2.5 text-sm text-zaltyko-navy shadow-none focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15 disabled:bg-zaltyko-warm-white disabled:text-zaltyko-text-secondary";
const labelClassName = "mb-2 block text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy";
const sectionClassName = "sm:col-span-2 border-t border-zaltyko-mist pt-4";

function getDefaultEventDiscipline(value: string): EventDiscipline | "" {
  return EVENT_DISCIPLINE_VALUES.has(value as EventDiscipline) ? (value as EventDiscipline) : "";
}

interface EventFormProps {
  academyId: string;
  sportConfigs?: SportConfigOption[];
  eventId?: string;
  initialData?: EventFormInitialData;
  onSuccess?: () => void;
  // Props para compatibilidad con EventsList
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

interface SportConfigOption {
  id: string;
  name: string;
  disciplineName: string;
  branchName: string;
  defaultDisciplineVariant: string;
  competitionTypes: Array<{ code: string; name: string }>;
}

export function EventForm({
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determinar eventId y datos iniciales
  const effectiveEventId = eventId || event?.id;
  const effectiveInitialData: EventFormInitialData | undefined = initialData || (event ? {
    title: event.title,
    startDate: event.date || undefined,
    // Parsear location si viene en formato "ciudad, provincia, país"
    ...(event.location ? (() => {
      const parts = event.location.split(",").map(p => p.trim());
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

  const [formData, setFormData] = useState(normalizeEventFormData(effectiveInitialData));
  const selectedSportConfig = sportConfigs.find((config) => config.id === formData.sportConfigId);
  const displayedEventTypes =
    selectedSportConfig && selectedSportConfig.competitionTypes.length > 0
      ? selectedSportConfig.competitionTypes.map((item) => ({ value: item.code, label: item.name }))
      : eventTypes;

  // Resetear formulario cuando cambia el evento
  useEffect(() => {
    if (event || initialData) {
      setFormData(normalizeEventFormData(effectiveInitialData));
    }
  }, [event, initialData, effectiveInitialData]);

  useEffect(() => {
    const defaultDiscipline = getDefaultEventDiscipline(specialization.disciplineVariant);

    setFormData((current): EventFormData => {
      if (current.discipline || !defaultDiscipline) {
        return current;
      }

      return {
        ...current,
        discipline: defaultDiscipline,
      };
    });
  }, [specialization.disciplineVariant]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validar formulario
      const validation = validateEventForm(formData);
      if (!validation.valid) {
        const firstError = validation.errors[0];
        throw new Error(firstError?.message || "Error de validación");
      }

      const categoryVal = formData.category as any;
      const categoryArray = Array.isArray(categoryVal)
        ? categoryVal.filter(Boolean)
        : categoryVal
          ? (categoryVal as string).split(",").map((c: string) => c.trim()).filter(Boolean)
          : undefined;

      const payload = {
        academyId,
        title: formData.title,
        description: formData.description || undefined,
        category: categoryArray,
        isPublic: formData.isPublic,
        level: formData.level,
        discipline: formData.discipline || undefined,
        sportConfigId: formData.sportConfigId || undefined,
        eventType: formData.eventType || undefined,
        competitionTypeCode: formData.competitionTypeCode || undefined,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        registrationStartDate: formData.registrationStartDate || undefined,
        registrationEndDate: formData.registrationEndDate || undefined,
        countryCode: formData.countryCode || undefined,
        countryName: formData.countryName || undefined,
        provinceName: formData.provinceName || undefined,
        cityName: formData.cityName || undefined,
        // Mantener campos antiguos para compatibilidad
        country: formData.countryName || formData.country || undefined,
        province: formData.provinceName || formData.province || undefined,
        city: formData.cityName || formData.city || undefined,
        contactEmail: formData.contactEmail || undefined,
        contactPhone: formData.contactPhone || undefined,
        contactInstagram: formData.contactInstagram || undefined,
        contactWebsite: formData.contactWebsite || undefined,
        images: formData.images.length > 0 ? formData.images : undefined,
        attachments: formData.attachments.length > 0 ? formData.attachments.map((att: any, index: number) => ({
          name: att.name || `Archivo ${index + 1}`,
          url: typeof att === 'string' ? att : att.url,
        })) : undefined,
        notifyInternalStaff: formData.notifyInternalStaff,
        notifyCityAcademies: formData.notifyCityAcademies,
        notifyProvinceAcademies: formData.notifyProvinceAcademies,
        notifyCountryAcademies: formData.notifyCountryAcademies,
        // Nuevos campos
        status: formData.status,
        maxCapacity: formData.maxCapacity || null,
        registrationFee: formData.registrationFee || null,
        allowWaitlist: formData.allowWaitlist,
        waitlistMaxSize: formData.waitlistMaxSize || null,
      };

      const url = effectiveEventId ? `/api/events/${effectiveEventId}` : "/api/events";
      const method = effectiveEventId ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-academy-id": academyId, // Enviar academyId en header para que withTenant pueda obtenerlo
        },
        credentials: "include", // Incluir cookies para autenticación
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
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
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-xl border border-zaltyko-coral/35 bg-zaltyko-coral/10 p-3 text-sm text-zaltyko-coral">
          {error}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="title" className={labelClassName}>
            Título <span className="text-zaltyko-coral">*</span>
          </label>
          <input
            type="text"
            id="title"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className={fieldClassName}
            placeholder={`Nombre del evento o cita de ${specialization.labels.disciplineName.toLowerCase()}`}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="description" className={labelClassName}>
            Descripción
          </label>
          <textarea
            id="description"
            rows={4}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
            required
            value={formData.level}
            onChange={(e) => setFormData({ ...formData, level: e.target.value as any })}
            className={fieldClassName}
          >
            {EVENT_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="sportConfigId" className={labelClassName}>
            Rama / modalidad
          </label>
          <select
            id="sportConfigId"
            value={formData.sportConfigId}
            onChange={(e) => {
              const config = sportConfigs.find((item) => item.id === e.target.value);
              setFormData({
                ...formData,
                sportConfigId: e.target.value,
                discipline: (config?.defaultDisciplineVariant as any) || formData.discipline,
                competitionTypeCode: "",
              });
            }}
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
            value={selectedSportConfig ? formData.competitionTypeCode : formData.eventType}
            onChange={(e) =>
              setFormData(
                selectedSportConfig
                  ? { ...formData, competitionTypeCode: e.target.value }
                  : { ...formData, eventType: e.target.value as any }
              )
            }
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
            type="date"
            id="registrationStartDate"
            value={formData.registrationStartDate}
            onChange={(e) => setFormData({ ...formData, registrationStartDate: e.target.value })}
            className={fieldClassName}
          />
        </div>

        <div>
          <label htmlFor="registrationEndDate" className={labelClassName}>
            Fecha fin inscripción
          </label>
          <input
            type="date"
            id="registrationEndDate"
            min={formData.registrationStartDate || undefined}
            value={formData.registrationEndDate}
            onChange={(e) => setFormData({ ...formData, registrationEndDate: e.target.value })}
            className={fieldClassName}
          />
        </div>

        <div>
          <label htmlFor="startDate" className={labelClassName}>
            Fecha inicio evento <span className="text-zaltyko-coral">*</span>
          </label>
          <input
            type="date"
            id="startDate"
            required
            min={formData.registrationEndDate || undefined}
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            className={fieldClassName}
          />
        </div>

        <div>
          <label htmlFor="endDate" className={labelClassName}>
            Fecha fin evento
          </label>
          <input
            type="date"
            id="endDate"
            min={formData.startDate || undefined}
            value={formData.endDate}
            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            className={fieldClassName}
          />
        </div>

        <div className="sm:col-span-2">
          <LocationSelect
            countryCode={formData.countryCode}
            countryName={formData.countryName}
            provinceName={formData.provinceName}
            cityName={formData.cityName}
            onLocationChange={(location) => {
              setFormData({
                ...formData,
                countryCode: location.countryCode,
                countryName: location.countryName,
                provinceName: location.provinceName,
                cityName: location.cityName,
              });
            }}
          />
        </div>

        <div>
          <label htmlFor="category" className={labelClassName}>
            Categorías (separadas por comas)
          </label>
          <input
            type="text"
            id="category"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
            className={fieldClassName}
            placeholder="FIG Level 1, Edad 8-10"
          />
        </div>

        <div className="sm:col-span-2">
          <div className="flex items-center gap-2">
            <Switch
              id="isPublic"
              checked={formData.isPublic}
              onCheckedChange={(checked) => setFormData({ ...formData, isPublic: checked })}
            />
            <Label htmlFor="isPublic" className="cursor-pointer text-sm font-medium text-zaltyko-navy">
              Evento público (aparecerá en el directorio público)
            </Label>
          </div>
        </div>

        <div className="sm:col-span-2">
          <FileUpload
            type="image"
            label="Imágenes del evento"
            accept="image/*"
            maxSizeMB={10}
            files={formData.images}
            onFilesChange={(files) => setFormData({ ...formData, images: files })}
            eventId={effectiveEventId}
            disabled={isSubmitting}
          />
        </div>

        <div className="sm:col-span-2">
          <FileUpload
            type="file"
            label="Archivos adjuntos (PDFs, documentos)"
            accept=".pdf,.doc,.docx"
            maxSizeMB={10}
            files={formData.attachments as any}
            onFilesChange={(files) => setFormData({ ...formData, attachments: files as any })}
            eventId={effectiveEventId}
            disabled={isSubmitting}
          />
        </div>

        <div className={sectionClassName}>
          <h3 className="mb-4 font-display text-base font-semibold text-zaltyko-navy">Opciones de notificación</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="notifyInternalStaff" className="cursor-pointer text-sm font-medium text-zaltyko-navy">
                Notificar personal interno
              </Label>
              <Switch
                id="notifyInternalStaff"
                checked={formData.notifyInternalStaff}
                onCheckedChange={(checked) => setFormData({ ...formData, notifyInternalStaff: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notifyCityAcademies" className="cursor-pointer text-sm font-medium text-zaltyko-navy">
                Notificar academias de la misma ciudad
              </Label>
              <Switch
                id="notifyCityAcademies"
                checked={formData.notifyCityAcademies}
                onCheckedChange={(checked) => setFormData({ ...formData, notifyCityAcademies: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notifyProvinceAcademies" className="cursor-pointer text-sm font-medium text-zaltyko-navy">
                Notificar academias de la misma provincia
              </Label>
              <Switch
                id="notifyProvinceAcademies"
                checked={formData.notifyProvinceAcademies}
                onCheckedChange={(checked) => setFormData({ ...formData, notifyProvinceAcademies: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notifyCountryAcademies" className="cursor-pointer text-sm font-medium text-zaltyko-navy">
                Notificar academias del mismo país
              </Label>
              <Switch
                id="notifyCountryAcademies"
                checked={formData.notifyCountryAcademies}
                onCheckedChange={(checked) => setFormData({ ...formData, notifyCountryAcademies: checked })}
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="contactEmail" className={labelClassName}>
            Email de contacto
          </label>
          <input
            type="email"
            id="contactEmail"
            value={formData.contactEmail}
            onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
            className={fieldClassName}
            placeholder="contacto@evento.com"
          />
        </div>

        <div>
          <label htmlFor="contactPhone" className={labelClassName}>
            Teléfono de contacto
          </label>
          <input
            type="tel"
            id="contactPhone"
            value={formData.contactPhone}
            onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
            className={fieldClassName}
            placeholder="+34 600 000 000"
          />
        </div>

        <div>
          <label htmlFor="contactInstagram" className={labelClassName}>
            Instagram
          </label>
          <input
            type="text"
            id="contactInstagram"
            value={formData.contactInstagram}
            onChange={(e) => setFormData({ ...formData, contactInstagram: e.target.value })}
            className={fieldClassName}
            placeholder="@evento"
          />
        </div>

        <div>
          <label htmlFor="contactWebsite" className={labelClassName}>
            Sitio web
          </label>
          <input
            type="url"
            id="contactWebsite"
            value={formData.contactWebsite}
            onChange={(e) => setFormData({ ...formData, contactWebsite: e.target.value })}
            className={fieldClassName}
            placeholder="https://evento.com"
          />
        </div>

        {/* Inscripciones */}
        <div className={sectionClassName}>
          <h3 className="mb-4 font-display text-base font-semibold text-zaltyko-navy">Inscripciones</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="status" className={labelClassName}>
                Estado del evento
              </label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className={fieldClassName}
              >
                <option value="draft">Borrador</option>
                <option value="published">Publicado</option>
                <option value="cancelled">Cancelado</option>
                <option value="completed">Completado</option>
              </select>
            </div>

            <div>
              <label htmlFor="maxCapacity" className={labelClassName}>
                Capacidad máxima
              </label>
              <input
                type="number"
                id="maxCapacity"
                min="0"
                value={formData.maxCapacity || ""}
                onChange={(e) => setFormData({ ...formData, maxCapacity: parseInt(e.target.value) || 0 })}
                className={fieldClassName}
                placeholder="Sin límite"
              />
            </div>

            <div>
              <label htmlFor="registrationFee" className={labelClassName}>
                Precio de inscripción (€)
              </label>
              <input
                type="number"
                id="registrationFee"
                min="0"
                step="0.01"
                value={formData.registrationFee ? formData.registrationFee / 100 : ""}
                onChange={(e) => setFormData({ ...formData, registrationFee: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                className={fieldClassName}
                placeholder="0.00"
              />
            </div>

            <div>
              <label htmlFor="waitlistMaxSize" className={labelClassName}>
                Tamaño máximo de lista de espera
              </label>
              <input
                type="number"
                id="waitlistMaxSize"
                min="0"
                value={formData.waitlistMaxSize || ""}
                onChange={(e) => setFormData({ ...formData, waitlistMaxSize: parseInt(e.target.value) || 0 })}
                className={fieldClassName}
                placeholder="Sin límite"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="allowWaitlist"
                  checked={formData.allowWaitlist}
                  onCheckedChange={(checked) => setFormData({ ...formData, allowWaitlist: checked })}
                />
                <Label htmlFor="allowWaitlist" className="cursor-pointer text-sm font-medium text-zaltyko-navy">
                  Permitir lista de espera cuando el evento esté lleno
                </Label>
              </div>
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
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : effectiveEventId ? "Actualizar evento" : "Crear evento"}
        </Button>
      </div>
    </form>
  );

  // Si se usa como modal (con open/onClose)
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

  // Si se usa como formulario inline
  return formContent;
}
