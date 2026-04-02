import { Locale } from '@/i18n';

// Modality slugs
export const MODALITIES = {
  artistic: {
    es: 'gimnasia-artistica',
    en: 'artistic-gymnastics',
    label: { es: 'Gimnasia Artística', en: 'Artistic Gymnastics' },
  },
  rhythmic: {
    es: 'gimnasia-ritmica',
    en: 'rhythmic-gymnastics',
    label: { es: 'Gimnasia Rítmica', en: 'Rhythmic Gymnastics' },
  },
  acrobatic: {
    es: 'gimnasia-acrobatica',
    en: 'acrobatic-gymnastics',
    label: { es: 'Gimnasia Acrobática', en: 'Acrobatic Gymnastics' },
  },
  trampoline: {
    es: 'trampolin',
    en: 'trampoline',
    label: { es: 'Trampolín', en: 'Trampoline' },
  },
} as const;

export type ModalitySlug = keyof typeof MODALITIES;

// Country slugs
export const COUNTRIES = {
  espana: {
    es: 'espana',
    en: 'spain',
    label: { es: 'España', en: 'Spain' },
    code: 'ES',
  },
  mexico: {
    es: 'mexico',
    en: 'mexico',
    label: { es: 'México', en: 'Mexico' },
    code: 'MX',
  },
  argentina: {
    es: 'argentina',
    en: 'argentina',
    label: { es: 'Argentina', en: 'Argentina' },
    code: 'AR',
  },
  colombia: {
    es: 'colombia',
    en: 'colombia',
    label: { es: 'Colombia', en: 'Colombia' },
    code: 'CO',
  },
  chile: {
    es: 'chile',
    en: 'chile',
    label: { es: 'Chile', en: 'Chile' },
    code: 'CL',
  },
  peru: {
    es: 'peru',
    en: 'peru',
    label: { es: 'Perú', en: 'Peru' },
    code: 'PE',
  },
  'united-states': {
    es: undefined as string | undefined,
    en: 'united-states',
    label: { es: 'Estados Unidos', en: 'United States' },
    code: 'US',
  },
} as const;

export type CountrySlug = keyof typeof COUNTRIES;

// Full cluster key: "modality-country" e.g., "artistic-espana"
export type ClusterKey = `${ModalitySlug}-${CountrySlug}`;

// Public academy type for cluster pages
export interface PublicAcademy {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  academyType: string | null;
  publicDescription: string | null;
  logoUrl: string | null;
  website: string | null;
  socialInstagram: string | null;
}

// Public coach type for cluster pages
export interface PublicCoach {
  id: string;
  name: string;
  photoUrl: string | null;
  academyName?: string;
  academySlug?: string;
  publicBio?: string | null;
  specialties?: string[];
  yearsExperience?: number;
}

// Public event type for cluster pages
export interface PublicEvent {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  cityName?: string | null;
  provinceName?: string | null;
  countryName?: string | null;
  level?: string;
  academyName?: string;
  description?: string | null;
  maxCapacity?: number | null;
  registrationFee?: number | null;
}

// Cluster content interface
export interface ClusterContent {
  meta: {
    title: string;
    description: string;
    keywords: string[];
  };
  hero: {
    badge: string;
    headline: string;
    subheadline: string;
  };
  federation: {
    name: string;
    competitions: string[];
  };
  categories: {
    [key: string]: string[];
  };
  socialProof: {
    academies: string[];
    stats: {
      athletes: string;
      academies: string;
    };
  };
  painPoints: {
    generic: string;
    specific: string;
  };
  interlinking: {
    relatedCountries: CountrySlug[];
    relatedModalities: ModalitySlug[];
  };
}

// Get all clusters for a locale
export function getAllClusters(locale: Locale): Array<{
  modality: ModalitySlug;
  country: CountrySlug;
  url: string;
  label: string;
}> {
  const clusters: Array<{
    modality: ModalitySlug;
    country: CountrySlug;
    url: string;
    label: string;
  }> = [];

  for (const modality of Object.keys(MODALITIES) as ModalitySlug[]) {
    for (const country of Object.keys(COUNTRIES) as CountrySlug[]) {
      const modalitySlug = MODALITIES[modality][locale];
      const countrySlug = COUNTRIES[country][locale];
      clusters.push({
        modality,
        country,
        url: `/${locale}/${modalitySlug}/${countrySlug}`,
        label: `${MODALITIES[modality].label[locale]} - ${COUNTRIES[country].label[locale]}`,
      });
    }
  }

  return clusters;
}

// Get cluster content from JSON
export async function getClusterContent(
  locale: Locale,
  modality: ModalitySlug,
  country: CountrySlug
): Promise<ClusterContent | null> {
  try {
    const modalitySlug = MODALITIES[modality][locale];
    const countrySlug = COUNTRIES[country][locale];

    const content = await import(`@/content/clusters/${locale}/${countrySlug}/${modalitySlug}.json`).then(
      (m) => m.default as ClusterContent
    );

    return content;
  } catch {
    return null;
  }
}

// Get all modality pages (parent pages listing countries)
export function getAllModalityPages(locale: Locale): Array<{
  modality: ModalitySlug;
  url: string;
  label: string;
}> {
  return Object.keys(MODALITIES).map((modality) => {
    const modalitySlug = MODALITIES[modality as ModalitySlug][locale];
    return {
      modality: modality as ModalitySlug,
      url: `/${locale}/${modalitySlug}`,
      label: MODALITIES[modality as ModalitySlug].label[locale],
    };
  });
}

// Get countries for a modality in a locale
export function getCountriesForModality(
  locale: Locale,
  modality: ModalitySlug
): Array<{ slug: CountrySlug; label: string; url: string }> {
  return Object.keys(COUNTRIES).map((country) => {
    const countrySlug = COUNTRIES[country as CountrySlug][locale];
    const modalitySlug = MODALITIES[modality][locale];
    return {
      slug: country as CountrySlug,
      label: COUNTRIES[country as CountrySlug].label[locale],
      url: `/${locale}/${modalitySlug}/${countrySlug}`,
    };
  });
}

// Get modalities for a country in a locale
export function getModalitiesForCountry(
  locale: Locale,
  country: CountrySlug
): Array<{ slug: ModalitySlug; label: string; url: string }> {
  return Object.keys(MODALITIES).map((modality) => {
    const modalitySlug = MODALITIES[modality as ModalitySlug][locale];
    const countrySlug = COUNTRIES[country][locale];
    return {
      slug: modality as ModalitySlug,
      label: MODALITIES[modality as ModalitySlug].label[locale],
      url: `/${locale}/${modalitySlug}/${countrySlug}`,
    };
  });
}

// Get related clusters (same modality, different countries)
export function getRelatedByModality(
  locale: Locale,
  modality: ModalitySlug,
  excludeCountry: CountrySlug,
  limit = 4
): Array<{ slug: CountrySlug; label: string; url: string }> {
  const related: Array<{ slug: CountrySlug; label: string; url: string }> = [];

  for (const country of Object.keys(COUNTRIES) as CountrySlug[]) {
    if (country !== excludeCountry) {
      const countrySlug = COUNTRIES[country][locale];
      const modalitySlug = MODALITIES[modality][locale];
      related.push({
        slug: country,
        label: COUNTRIES[country].label[locale],
        url: `/${locale}/${modalitySlug}/${countrySlug}`,
      });

      if (related.length >= limit) break;
    }
  }

  return related;
}

// Get related clusters (same country, different modalities)
export function getRelatedByCountry(
  locale: Locale,
  country: CountrySlug,
  excludeModality: ModalitySlug,
  limit = 4
): Array<{ slug: ModalitySlug; label: string; url: string }> {
  const related: Array<{ slug: ModalitySlug; label: string; url: string }> = [];

  for (const modality of Object.keys(MODALITIES) as ModalitySlug[]) {
    if (modality !== excludeModality) {
      const countrySlug = COUNTRIES[country][locale];
      const modalitySlug = MODALITIES[modality][locale];
      related.push({
        slug: modality,
        label: MODALITIES[modality].label[locale],
        url: `/${locale}/${modalitySlug}/${countrySlug}`,
      });

      if (related.length >= limit) break;
    }
  }

  return related;
}

// Get academies for a cluster (filtered by modality/country)
export async function getClusterAcademies(
  locale: Locale,
  modality: ModalitySlug,
  country: CountrySlug,
  limit = 12
) {
  const { db } = await import('@/db');
  const { academies } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const countryCode = COUNTRIES[country]?.code;
  if (!countryCode) return [];

  const dbType = MODALITY_DB_TYPES[modality];

  const conditions = [
    eq(academies.isPublic, true),
    eq(academies.isSuspended, false),
  ];

  // @ts-ignore - country is stored as code
  conditions.push(eq(academies.country, countryCode));

  if (dbType && dbType !== 'general') {
    conditions.push(eq(academies.academyType, dbType as any));
  }

  const result = await db
    .select({
      id: academies.id,
      name: academies.name,
      city: academies.city,
      region: academies.region,
      logoUrl: academies.logoUrl,
    })
    .from(academies)
    .where(and(...conditions))
    .limit(limit);

  return result;
}

// Get coaches for a cluster
export async function getClusterCoaches(
  locale: Locale,
  modality: ModalitySlug,
  country: CountrySlug,
  limit = 12
) {
  const { db } = await import('@/db');
  const { coaches, academies } = await import('@/db/schema');
  const { eq, and, sql } = await import('drizzle-orm');

  const countryCode = COUNTRIES[country]?.code;
  if (!countryCode) return [];

  const result = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      specialties: coaches.specialties,
      publicBio: coaches.publicBio,
      photoUrl: coaches.photoUrl,
      yearsExperience: coaches.yearsExperience,
      academyName: academies.name,
    })
    .from(coaches)
    .innerJoin(academies, eq(coaches.academyId, academies.id))
    .where(
      and(
        eq(academies.isPublic, true),
        eq(academies.isSuspended, false),
        sql`${academies.country} = ${countryCode}`
      )
    )
    .limit(limit);

  // Map to PublicCoach interface
  return result.map(c => ({
    id: c.id,
    name: c.name,
    photoUrl: c.photoUrl,
    academyName: c.academyName,
    publicBio: c.publicBio,
    specialties: c.specialties ?? [],
    yearsExperience: c.yearsExperience ? parseInt(String(c.yearsExperience), 10) : undefined,
  }));
}

// Get events for a cluster
export async function getClusterEvents(
  locale: Locale,
  modality: ModalitySlug,
  country: CountrySlug,
  limit = 12
) {
  const { db } = await import('@/db');
  const { events, academies } = await import('@/db/schema');
  const { eq, and, sql } = await import('drizzle-orm');

  const countryCode = COUNTRIES[country]?.code;
  if (!countryCode) return [];

  const dbDiscipline = MODALITY_DB_DISCIPLINES[modality];

  const conditions = [
    eq(events.isPublic, true),
    eq(events.status, 'published' as any),
    sql`${events.countryCode} = ${countryCode}`,
  ];

  if (dbDiscipline) {
    conditions.push(eq(events.discipline, dbDiscipline as any));
  }

  const result = await db
    .select({
      id: events.id,
      title: events.title,
      startDate: events.startDate,
      endDate: events.endDate,
      cityName: events.cityName,
      provinceName: events.provinceName,
      countryName: events.countryName,
      level: events.level,
      description: events.description,
      maxCapacity: events.maxCapacity,
      registrationFee: events.registrationFee,
      academyName: academies.name,
    })
    .from(events)
    .innerJoin(academies, eq(events.academyId, academies.id))
    .where(and(...conditions))
    .limit(limit);

  return result;
}

// Mapping from modality to academy type
const MODALITY_DB_TYPES: Record<ModalitySlug, string> = {
  artistic: 'artistica',
  rhythmic: 'ritmica',
  acrobatic: 'general',
  trampoline: 'trampolin',
};

// Mapping from modality to event discipline
const MODALITY_DB_DISCIPLINES: Record<ModalitySlug, string> = {
  artistic: 'artistic_female',
  rhythmic: 'rhythmic',
  acrobatic: 'artistic_female',
  trampoline: 'trampoline',
};
