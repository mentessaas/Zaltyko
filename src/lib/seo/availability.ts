// Pure SEO catalog data. Keep this module free of server-only imports so it is
// safe to consume from client components and route metadata.
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

// Modalidades que Zaltyko soporta como producto hoy. Acrobática y trampolín
// tienen catálogo/rutas SEO ya publicados pero el producto aún no las
// atiende — se muestran como "Próximamente" en vez de como enlaces activos.
export const AVAILABLE_MODALITIES: Record<ModalitySlug, boolean> = {
  artistic: true,
  rhythmic: true,
  acrobatic: false,
  trampoline: false,
};

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

export type ClusterKey = `${ModalitySlug}-${CountrySlug}`;
