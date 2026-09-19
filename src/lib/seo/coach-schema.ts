// Genera JSON-LD Person para coaches públicos. Sustituye el schema inline
// que tenía `src/app/(site)/coaches/[slug]/page.tsx`. Centraliza la forma
// para que el resto de superficies de coach (directorio, academy card)
// pueda reutilizar el helper sin duplicar lógica.

export interface CoachSchemaInput {
  baseUrl: string;
  pagePath: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  jobTitle?: string;
  worksFor?: {
    name: string;
    url?: string | null;
  } | null;
  knowsAbout?: string[];
  sameAs?: string[];
}

/**
 * Devuelve un nodo `Person` listo para incrustar como JSON-LD. `knowsAbout`
 * acepta una lista de especialidades/técnicas declaradas por el coach
 * (de la columna `coaches.specialties`). Devuelve null si falta el nombre.
 */
export function coachJsonLd(input: CoachSchemaInput): Record<string, unknown> | null {
  if (!input.name) return null;

  const pageUrl = `${input.baseUrl}${input.pagePath}`;
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${pageUrl}#person`,
    name: input.name,
    jobTitle: input.jobTitle ?? "Entrenador de gimnasia",
    url: pageUrl,
  };

  if (input.description) node.description = input.description;
  if (input.imageUrl) node.image = input.imageUrl;

  if (input.worksFor?.name) {
    node.worksFor = {
      "@type": "SportsActivityLocation",
      name: input.worksFor.name,
      ...(input.worksFor.url ? { url: input.worksFor.url } : {}),
    };
  }

  if (input.knowsAbout && input.knowsAbout.length > 0) {
    node.knowsAbout = input.knowsAbout;
  }

  if (input.sameAs && input.sameAs.length > 0) {
    node.sameAs = input.sameAs;
  }

  return node;
}
