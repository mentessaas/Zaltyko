// JSON-LD helpers para tipos Schema.org adicionales a los que ya cubre
// `src/lib/seo/clusters.ts` (WebPage, BreadcrumbList, ItemList). Cada helper
// devuelve un objeto fail-closed: si un campo obligatorio falta, se omite el
// nodo entero para no emitir JSON-LD inválido (Google penaliza silenciosamente
// los schema que no validan contra Schema.org).

export interface EventSchemaInput {
  baseUrl: string;
  pagePath: string;
  title: string;
  description?: string | null;
  startDate: string | Date | null;
  endDate?: string | Date | null;
  cityName?: string | null;
  provinceName?: string | null;
  countryName?: string | null;
  organizerName?: string | null;
  organizerUrl?: string | null;
  imageUrl?: string | null;
  registrationEndDate?: string | Date | null;
  maxCapacity?: number | null;
  registrationFeeCents?: number | null;
  currency?: string | null;
  eventStatus?: "provisional" | "confirmed" | "postponed" | "cancelled" | "finished";
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  // Acepta "YYYY-MM-DD" (date-only) o ISO 8601.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {const d=new Date(`${value}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value?value:null;}
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Genera un nodo `Event` válido para Google Rich Results.
 * Devuelve null si falta `title` o `startDate` (campos obligatorios).
 */
export function eventJsonLd(input: EventSchemaInput): Record<string, unknown> | null {
  const start = toIso(input.startDate);
  if (!input.title || !start) return null;

  const pageUrl = `${input.baseUrl}${input.pagePath}`;
  if(!input.cityName||!input.countryName||input.eventStatus==='provisional')return null;
  const location: Record<string, unknown> = { "@type": "Place",name: input.cityName,address:{"@type":"PostalAddress",addressLocality:input.cityName,addressRegion:input.provinceName??undefined,addressCountry:input.countryName} };

  const event: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `${pageUrl}#event`,
    name: input.title,
    startDate: start,
    location,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: input.eventStatus === "cancelled" ? "https://schema.org/EventCancelled" : input.eventStatus === "postponed" ? "https://schema.org/EventPostponed" : "https://schema.org/EventScheduled",
  };

  if (input.description) event.description = input.description;
  if (input.imageUrl) event.image = [input.imageUrl];

  const end = toIso(input.endDate);
  if (end) event.endDate = end;

  if (input.organizerName) {
    event.organizer = {
      "@type": "Organization",
      name: input.organizerName,
      ...(input.organizerUrl ? { url: input.organizerUrl } : {}),
    };
  }

  return event;
}
