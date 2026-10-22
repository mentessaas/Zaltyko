// Genera JSON-LD LocalBusiness / SportsActivityLocation para academias
// públicas. Fail-closed: si no hay datos suficientes para validar contra
// Schema.org, devuelve null y la página no emite el nodo (preferible a un
// schema inválido que Google ignora silenciosamente).

export interface AcademySchemaInput {
  baseUrl: string;
  pagePath: string;
  id: string;
  name: string;
  description?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  address?: string | null;
  website?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  logoUrl?: string | null;
  schedule?: Record<number, Array<{ name: string; startTime: string | null; endTime: string | null }>>;
  socialInstagram?: string | null;
  socialFacebook?: string | null;
  socialTwitter?: string | null;
}

const WEEKDAY_TO_DAY: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

const WEEKDAY_TO_DAY_ES: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

function toOpeningHours(schedule: AcademySchemaInput["schedule"]): string[] | null {
  if (!schedule) return null;
  const out: string[] = [];
  for (const [weekday, slots] of Object.entries(schedule)) {
    if (!slots || slots.length === 0) continue;
    const w = Number(weekday);
    const dayKey = WEEKDAY_TO_DAY[w];
    if (!dayKey) continue;
    // Toma el primer slot del día como horario agregado. Si hay varios,
    // se podrían emitir varios `OpeningHoursSpecification` por día, pero
    // para SEO basta con el rango del primer bloque.
    const first = slots[0];
    const last = slots[slots.length - 1];
    const opens = first?.startTime?.slice(0, 5);
    const closes = last?.endTime?.slice(0, 5);
    if (!opens || !closes) continue;
    out.push(`${dayKey} ${opens}-${closes}`);
  }
  return out.length > 0 ? out : null;
}

/**
 * Genera JSON-LD para una academia pública. Devuelve null si falta nombre
 * o ubicación mínima (ciudad o país).
 */
export function academyJsonLd(input: AcademySchemaInput): Record<string, unknown> | null {
  if (!input.name) return null;
  if (!input.city && !input.country && !input.countryCode) return null;

  const pageUrl = `${input.baseUrl}${input.pagePath}`;
  const address: Record<string, unknown> = { "@type": "PostalAddress" };
  if (input.address) address.streetAddress = input.address;
  if (input.city) address.addressLocality = input.city;
  if (input.region) address.addressRegion = input.region;
  if (input.country) address.addressCountry = input.country;
  if (input.countryCode && !input.country) address.addressCountry = input.countryCode;

  const sameAs = [input.website, input.socialInstagram, input.socialFacebook, input.socialTwitter]
    .filter((v): v is string => Boolean(v));

  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    "@id": `${pageUrl}#organization`,
    name: input.name,
    url: pageUrl,
    address,
  };

  if (input.description) node.description = input.description;
  if (input.logoUrl) {
    node.image = {
      "@type": "ImageObject",
      url: input.logoUrl,
    };
    node.logo = input.logoUrl;
  }
  if (input.contactPhone) node.telephone = input.contactPhone;
  if (input.contactEmail) node.email = input.contactEmail;
  if (sameAs.length > 0) node.sameAs = sameAs;

  const openingHours = toOpeningHours(input.schedule);
  if (openingHours) node.openingHours = openingHours;

  return node;
}

/** Mapa weekday → etiqueta humana en español (para depuración/tests). */
export const weekdayLabels = WEEKDAY_TO_DAY_ES;
