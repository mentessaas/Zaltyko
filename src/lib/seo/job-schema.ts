// Genera JSON-LD JobPosting (Google for Jobs) para ofertas de empleo en
// Zaltyko. Solo emite los campos mínimos que Google requiere para que la
// oferta sea elegible como rich result: title, description, datePosted,
// hiringOrganization, jobLocation, employmentType (si lo tenemos) y
// validThrough (si hay deadline).

export interface JobPostingSchemaInput {
  baseUrl: string;
  pagePath: string;
  id: string;
  title: string;
  description: string;
  datePosted: string | Date;
  validThrough?: string | Date | null;
  employmentType?: string | null;
  jobLocation?: {
    city?: string | null;
    province?: string | null;
    country?: string | null;
  } | null;
  hiringOrganization?: {
    name: string;
    sameAs?: string | null;
  } | null;
  salary?: {
    min?: number | null;
    max?: number | null;
    currency?: string | null;
    unitText?: string | null;
  } | null;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Devuelve JSON-LD JobPosting o null si faltan los campos obligatorios
 * (title, description, datePosted, hiringOrganization.name, jobLocation.address).
 */
export function jobPostingJsonLd(input: JobPostingSchemaInput): Record<string, unknown> | null {
  if (!input.title || !input.description || !input.hiringOrganization?.name) return null;
  if (!input.jobLocation?.country && !input.jobLocation?.city) return null;

  const datePosted = toIso(input.datePosted);
  if (!datePosted) return null;

  const pageUrl = `${input.baseUrl}${input.pagePath}`;
  const address: Record<string, unknown> = { "@type": "PostalAddress" };
  if (input.jobLocation.city) address.addressLocality = input.jobLocation.city;
  if (input.jobLocation.province) address.addressRegion = input.jobLocation.province;
  if (input.jobLocation.country) address.addressCountry = input.jobLocation.country;

  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "@id": `${pageUrl}#job`,
    title: input.title,
    description: input.description,
    datePosted,
    hiringOrganization: {
      "@type": "Organization",
      name: input.hiringOrganization.name,
      sameAs: input.hiringOrganization.sameAs ?? pageUrl,
    },
    jobLocation: {
      "@type": "Place",
      address,
    },
    url: pageUrl,
  };

  const validThrough = toIso(input.validThrough);
  if (validThrough) node.validThrough = validThrough;

  if (input.employmentType) {
    const map: Record<string, string> = {
      full_time: "FULL_TIME",
      part_time: "PART_TIME",
      internship: "INTERN",
    };
    const normalized = map[input.employmentType] ?? input.employmentType.toUpperCase();
    node.employmentType = normalized;
  }

  if (input.salary?.min || input.salary?.max) {
    node.baseSalary = {
      "@type": "MonetaryAmount",
      currency: input.salary.currency || "EUR",
      value: {
        "@type": "QuantitativeValue",
        minValue: input.salary.min ?? undefined,
        maxValue: input.salary.max ?? undefined,
        unitText: input.salary.unitText || "MONTH",
      },
    };
  }

  return node;
}
