import type { EventType, EventLevel, EventDiscipline } from "./events";

/**
 * Datos del formulario de eventos
 */
export interface EventFormData {
  title: string;
  description: string;
  category: string[];
  isPublic: boolean;
  level: EventLevel;
  discipline: EventDiscipline | "";
  eventType: EventType | "";
  startDate: string;
  endDate: string;
  registrationStartDate: string;
  registrationEndDate: string;
  countryCode: string;
  countryName: string;
  provinceName: string;
  cityName: string;
  // Mantener campos antiguos para compatibilidad
  country: string;
  province: string;
  city: string;
  contactEmail: string;
  contactPhone: string;
  contactInstagram: string;
  contactWebsite: string;
  images: string[];
  attachments: Array<{ name: string; url: string; type?: string }>;
  notifyInternalStaff: boolean;
  notifyCityAcademies: boolean;
  notifyProvinceAcademies: boolean;
  notifyCountryAcademies: boolean;
}

/**
 * Datos iniciales para el formulario (pueden venir de la API)
 */
export interface EventFormInitialData {
  title?: string;
  description?: string;
  category?: string[];
  isPublic?: boolean;
  level?: string;
  discipline?: string;
  eventType?: EventType | null;
  startDate?: string;
  endDate?: string;
  registrationStartDate?: string | null;
  registrationEndDate?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  provinceName?: string | null;
  cityName?: string | null;
  country?: string | null;
  province?: string | null;
  city?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactInstagram?: string | null;
  contactWebsite?: string | null;
  images?: string[] | null;
  attachments?: Array<{ name: string; url: string; type?: string }> | null;
  notifyInternalStaff?: boolean;
  notifyCityAcademies?: boolean;
  notifyProvinceAcademies?: boolean;
  notifyCountryAcademies?: boolean;
}

/**
 * Convierte datos iniciales a formato del formulario
 */
export function normalizeEventFormData(
  initialData?: EventFormInitialData
): EventFormData {
  return {
    title: initialData?.title || "",
    description: initialData?.description || "",
    category: Array.isArray(initialData?.category) ? initialData.category : (initialData?.category ? [initialData.category] : []),
    isPublic: initialData?.isPublic ?? false,
    level: (initialData?.level as EventLevel) || "internal",
    discipline: (initialData?.discipline as EventDiscipline) || "",
    eventType: initialData?.eventType || "",
    startDate: initialData?.startDate || "",
    endDate: initialData?.endDate || "",
    registrationStartDate: initialData?.registrationStartDate || "",
    registrationEndDate: initialData?.registrationEndDate || "",
    countryCode: initialData?.countryCode || "",
    countryName: initialData?.countryName || "",
    provinceName: initialData?.provinceName || "",
    cityName: initialData?.cityName || "",
    country: initialData?.country || "",
    province: initialData?.province || "",
    city: initialData?.city || "",
    contactEmail: initialData?.contactEmail || "",
    contactPhone: initialData?.contactPhone || "",
    contactInstagram: initialData?.contactInstagram || "",
    contactWebsite: initialData?.contactWebsite || "",
    images: initialData?.images || [],
    attachments: initialData?.attachments || [],
    notifyInternalStaff: initialData?.notifyInternalStaff ?? false,
    notifyCityAcademies: initialData?.notifyCityAcademies ?? false,
    notifyProvinceAcademies: initialData?.notifyProvinceAcademies ?? false,
    notifyCountryAcademies: initialData?.notifyCountryAcademies ?? false,
  };
}

