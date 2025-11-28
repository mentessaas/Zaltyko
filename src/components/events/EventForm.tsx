"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LocationSelect } from "./LocationSelect";
import { FileUpload } from "./FileUpload";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { normalizeEventFormData, type EventFormInitialData } from "@/types/event-form";
import { validateEventForm } from "@/lib/validation/event-form-validator";

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
  { value: "trampoline", label: "Trampolín" },
  { value: "parkour", label: "Parkour" },
] as const;

const EVENT_TYPES = [
  { value: "competitions", label: "Competición" },
  { value: "courses", label: "Curso" },
  { value: "camps", label: "Campamento" },
  { value: "workshops", label: "Taller" },
  { value: "clinics", label: "Clínica" },
  { value: "evaluations", label: "Evaluación" },
  { value: "other", label: "Otro" },
] as const;

interface EventFormProps {
  academyId: string;
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

export function EventForm({
  academyId,
  eventId,
  initialData,
  onSuccess,
  open,
  onClose,
  event,
  onSaved,
}: EventFormProps) {
  const router = useRouter();
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

  // Resetear formulario cuando cambia el evento
  useEffect(() => {
    if (event || initialData) {
      setFormData(normalizeEventFormData(effectiveInitialData));
    }
  }, [event, initialData, effectiveInitialData]);

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
        eventType: formData.eventType || undefined,
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
        router.push("/dashboard/events");
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
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="title" className="mb-2 block text-sm font-medium text-foreground">
            Título <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="title"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
            placeholder="Nombre del evento"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="description" className="mb-2 block text-sm font-medium text-foreground">
            Descripción
          </label>
          <textarea
            id="description"
            rows={4}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
            placeholder="Descripción del evento..."
          />
        </div>

        <div>
          <label htmlFor="level" className="mb-2 block text-sm font-medium text-foreground">
            Nivel <span className="text-red-500">*</span>
          </label>
          <select
            id="level"
            required
            value={formData.level}
            onChange={(e) => setFormData({ ...formData, level: e.target.value as any })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          >
            {EVENT_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="discipline" className="mb-2 block text-sm font-medium text-foreground">
            Disciplina
          </label>
          <select
            id="discipline"
            value={formData.discipline}
            onChange={(e) => setFormData({ ...formData, discipline: e.target.value as any })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          >
            <option value="">Selecciona una disciplina</option>
            {EVENT_DISCIPLINES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="eventType" className="mb-2 block text-sm font-medium text-foreground">
            Tipo de evento
          </label>
          <select
            id="eventType"
            value={formData.eventType}
            onChange={(e) => setFormData({ ...formData, eventType: e.target.value as any })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          >
            <option value="">Selecciona un tipo</option>
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="registrationStartDate" className="mb-2 block text-sm font-medium text-foreground">
            Fecha inicio inscripción
          </label>
          <input
            type="date"
            id="registrationStartDate"
            value={formData.registrationStartDate}
            onChange={(e) => setFormData({ ...formData, registrationStartDate: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          />
        </div>

        <div>
          <label htmlFor="registrationEndDate" className="mb-2 block text-sm font-medium text-foreground">
            Fecha fin inscripción
          </label>
          <input
            type="date"
            id="registrationEndDate"
            min={formData.registrationStartDate || undefined}
            value={formData.registrationEndDate}
            onChange={(e) => setFormData({ ...formData, registrationEndDate: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          />
        </div>

        <div>
          <label htmlFor="startDate" className="mb-2 block text-sm font-medium text-foreground">
            Fecha inicio evento <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            id="startDate"
            required
            min={formData.registrationEndDate || undefined}
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          />
        </div>

        <div>
          <label htmlFor="endDate" className="mb-2 block text-sm font-medium text-foreground">
            Fecha fin evento
          </label>
          <input
            type="date"
            id="endDate"
            min={formData.startDate || undefined}
            value={formData.endDate}
            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
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
          <label htmlFor="category" className="mb-2 block text-sm font-medium text-foreground">
            Categorías (separadas por comas)
          </label>
          <input
            type="text"
            id="category"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
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
            <Label htmlFor="isPublic" className="text-sm font-medium text-foreground cursor-pointer">
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

        <div className="sm:col-span-2 border-t border-border pt-4">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Opciones de notificación</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="notifyInternalStaff" className="text-sm font-medium text-foreground cursor-pointer">
                Notificar personal interno
              </Label>
              <Switch
                id="notifyInternalStaff"
                checked={formData.notifyInternalStaff}
                onCheckedChange={(checked) => setFormData({ ...formData, notifyInternalStaff: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notifyCityAcademies" className="text-sm font-medium text-foreground cursor-pointer">
                Notificar academias de la misma ciudad
              </Label>
              <Switch
                id="notifyCityAcademies"
                checked={formData.notifyCityAcademies}
                onCheckedChange={(checked) => setFormData({ ...formData, notifyCityAcademies: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notifyProvinceAcademies" className="text-sm font-medium text-foreground cursor-pointer">
                Notificar academias de la misma provincia
              </Label>
              <Switch
                id="notifyProvinceAcademies"
                checked={formData.notifyProvinceAcademies}
                onCheckedChange={(checked) => setFormData({ ...formData, notifyProvinceAcademies: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notifyCountryAcademies" className="text-sm font-medium text-foreground cursor-pointer">
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
          <label htmlFor="contactEmail" className="mb-2 block text-sm font-medium text-foreground">
            Email de contacto
          </label>
          <input
            type="email"
            id="contactEmail"
            value={formData.contactEmail}
            onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
            placeholder="contacto@evento.com"
          />
        </div>

        <div>
          <label htmlFor="contactPhone" className="mb-2 block text-sm font-medium text-foreground">
            Teléfono de contacto
          </label>
          <input
            type="tel"
            id="contactPhone"
            value={formData.contactPhone}
            onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
            placeholder="+34 600 000 000"
          />
        </div>

        <div>
          <label htmlFor="contactInstagram" className="mb-2 block text-sm font-medium text-foreground">
            Instagram
          </label>
          <input
            type="text"
            id="contactInstagram"
            value={formData.contactInstagram}
            onChange={(e) => setFormData({ ...formData, contactInstagram: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
            placeholder="@evento"
          />
        </div>

        <div>
          <label htmlFor="contactWebsite" className="mb-2 block text-sm font-medium text-foreground">
            Sitio web
          </label>
          <input
            type="url"
            id="contactWebsite"
            value={formData.contactWebsite}
            onChange={(e) => setFormData({ ...formData, contactWebsite: e.target.value })}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
            placeholder="https://evento.com"
          />
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
    console.log('[EventForm] Rendering dialog with open:', open);
    return (
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          console.log('[EventForm] Dialog onOpenChange called with isOpen:', isOpen);
          if (!isOpen && onClose) {
            console.log('[EventForm] Calling onClose');
            onClose();
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {effectiveEventId ? "Editar evento" : "Crear nuevo evento"}
            </DialogTitle>
            <DialogDescription>
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
