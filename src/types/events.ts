/**
 * Tipos TypeScript para el módulo de eventos
 */

export type EventLevel = "internal" | "local" | "national" | "international";
export type EventDiscipline = "artistic_female" | "artistic_male" | "rhythmic" | "trampoline" | "parkour";
export type EventType = "competitions" | "courses" | "camps" | "workshops" | "clinics" | "evaluations" | "other";

export interface Event {
  id: string;
  tenantId: string;
  academyId: string;
  title: string;
  description: string | null;
  category: string[] | null;
  isPublic: boolean;
  level: EventLevel;
  discipline: EventDiscipline | null;
  eventType: EventType | null;
  startDate: string | null;
  endDate: string | null;
  registrationStartDate: string | null;
  registrationEndDate: string | null;
  countryCode: string | null;
  countryName: string | null;
  provinceName: string | null;
  cityName: string | null;
  // Mantener campos antiguos para compatibilidad
  country: string | null;
  province: string | null;
  city: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactInstagram: string | null;
  contactWebsite: string | null;
  images: string[] | null;
  attachments: Array<{ name: string; url: string; type?: string }> | null;
  notifyInternalStaff: boolean;
  notifyCityAcademies: boolean;
  notifyProvinceAcademies: boolean;
  notifyCountryAcademies: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PublicEvent extends Event {
  academyName: string;
  academyLogoUrl: string | null;
}

export interface EventFilters {
  search?: string;
  discipline?: EventDiscipline;
  level?: EventLevel;
  eventType?: EventType;
  country?: string;
  province?: string;
  city?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface CreateEventInput {
  academyId: string;
  title: string;
  description?: string;
  category?: string[];
  isPublic?: boolean;
  level?: EventLevel;
  discipline?: EventDiscipline;
  eventType?: EventType;
  startDate?: string;
  endDate?: string;
  registrationStartDate?: string;
  registrationEndDate?: string;
  countryCode?: string;
  countryName?: string;
  provinceName?: string;
  cityName?: string;
  // Mantener campos antiguos para compatibilidad
  country?: string;
  province?: string;
  city?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactInstagram?: string;
  contactWebsite?: string;
  images?: string[];
  attachments?: Array<{ name: string; url: string; type?: string }>;
  notifyInternalStaff?: boolean;
  notifyCityAcademies?: boolean;
  notifyProvinceAcademies?: boolean;
  notifyCountryAcademies?: boolean;
}

export interface UpdateEventInput extends Partial<CreateEventInput> {
  // Todos los campos son opcionales para actualización
}

export interface EventNotificationResult {
  sent: number;
  errors: number;
}

export interface EventNotificationRequest {
  type: "internal_staff" | "city" | "province" | "country";
}

export interface EventListResult {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  items: Event[] | PublicEvent[];
}

export interface PublicEventListResult {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  items: PublicEvent[];
}

