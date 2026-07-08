import { z } from "zod";

import { normalizeEventFormData, type EventFormInitialData } from "@/types/event-form";
import type { EventDiscipline, EventLevel, EventType } from "@/types/events";

export const EVENT_LEVELS = [
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

export const EVENT_STATUSES = [
  { value: "draft", label: "Borrador" },
  { value: "published", label: "Publicado" },
  { value: "cancelled", label: "Cancelado" },
  { value: "completed", label: "Completado" },
] as const;

export const eventFormSchema = z.object({
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

export type EventFormValues = z.input<typeof eventFormSchema>;

export function getDefaultEventDiscipline(value: string): EventDiscipline | "" {
  return EVENT_DISCIPLINE_VALUES.has(value as EventDiscipline) ? (value as EventDiscipline) : "";
}

export function getEventInitialDataFromSummary(event?: {
  title: string;
  date?: string | null;
  location?: string | null;
  status?: string | null;
} | null): EventFormInitialData | undefined {
  if (!event) return undefined;

  return {
    title: event.title,
    startDate: event.date || undefined,
    ...parseLocationSummary(event.location),
    isPublic: event.status === "published" || event.status === "public",
  };
}

export function buildEventFormDefaults(initialData?: EventFormInitialData): EventFormValues {
  const normalized = normalizeEventFormData(initialData);

  return {
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
  };
}

export function buildEventPayload(academyId: string, values: EventFormValues) {
  const categoryArray = values.category
    ? values.category.split(",").map((category) => category.trim()).filter(Boolean)
    : undefined;

  return {
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
    attachments: (values.attachments ?? []).map((attachment, index) => ({
      name: attachment.name || `Archivo ${index + 1}`,
      url: attachment.url,
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
}

function parseLocationSummary(location?: string | null) {
  if (!location) return {};

  const parts = location.split(",").map((part) => part.trim());
  if (parts.length >= 3) {
    return { city: parts[0], province: parts[1], country: parts[2] };
  }
  if (parts.length === 2) {
    return { city: parts[0], province: parts[1] };
  }
  if (parts.length === 1) {
    return { city: parts[0] };
  }
  return {};
}
