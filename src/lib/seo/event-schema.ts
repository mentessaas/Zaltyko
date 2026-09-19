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
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  // Acepta "YYYY-MM-DD" (date-only) o ISO 8601.
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
  const location: Record<string, unknown> = { "@type": "Place" };
  if (input.cityName) location.addressLocality = input.cityName;
  if (input.provinceName) location.addressRegion = input.provinceName;
  if (input.countryName) location.addressCountry = input.countryName;
  if (location.addressLocality || location.addressCountry) {
    location.name = [input.cityName, input.countryName].filter(Boolean).join(", ");
  } else {
    delete location.name;
  }
  if (Object.keys(location).length <= 1) return null;

  const event: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `${pageUrl}#event`,
    name: input.title,
    startDate: start,
    location,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
  };

  if (input.description) event.description = input.description;
  if (input.imageUrl) event.image = [input.imageUrl];

  const end = toIso(input.endDate);
  if (end) event.endDate = end;

  const regEnd = toIso(input.registrationEndDate);
  if (regEnd) {
    event.offers = {
      "@type": "Offer",
      url: pageUrl,
      availability: regEnd < new Date().toISOString()
        ? "https://schema.org/SoldOut"
        : "https://schema.org/InStock",
      validThrough: regEnd,
      ...(input.registrationFeeCents != null &&
        input.registrationFeeCents > 0 && {
          price: (input.registrationFeeCents / 100).toFixed(2),
          priceCurrency: input.currency || "EUR",
        }),
    };
  }

  if (input.organizerName) {
    event.organizer = {
      "@type": "Organization",
      name: input.organizerName,
      ...(input.organizerUrl ? { url: input.organizerUrl } : {}),
    };
  }

  return event;
}
