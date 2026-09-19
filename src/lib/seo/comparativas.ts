import type { Locale } from "@/i18n";

export interface ComparisonTableRow {
  feature: string;
  zaltyko: string;
  competitor: string;
}

export interface ComparisonContent {
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
  competitor: {
    name: string;
    tagline: string;
  };
  table: ComparisonTableRow[];
  zaltykoPros: string[];
  zaltykoContras: string[];
  competitorPros: string[];
  competitorContras: string[];
  idealForZaltyko: string[];
  idealForCompetitor: string[];
  faq: Array<{ q: string; a: string }>;
  verdict: string;
}

export interface ComparisonSummary {
  slug: string;
  title: string;
  description: string;
  competitorName: string;
  tagline: string;
}

// Solo español por ahora. Cuando se traduzcan las comparativas, extender el
// registro paralelo por locale siguiendo el patrón de availability/clusters.
const COMPARISON_SLUGS = [
  "zaltyko-vs-excel",
  "zaltyko-vs-sportmember",
  "zaltyko-vs-glofox",
] as const;

export type ComparisonSlug = (typeof COMPARISON_SLUGS)[number];

export function isComparisonSlug(value: string): value is ComparisonSlug {
  return (COMPARISON_SLUGS as readonly string[]).includes(value);
}

export function getComparisonSlugs(): string[] {
  return [...COMPARISON_SLUGS];
}

export async function loadComparison(
  locale: Locale,
  slug: string,
): Promise<ComparisonContent | null> {
  if (locale !== "es") return null;
  if (!isComparisonSlug(slug)) return null;
  try {
    const mod = await import(
      `@/content/comparativas/${locale}/${slug}.json`
    );
    return mod.default as ComparisonContent;
  } catch {
    return null;
  }
}

export async function listComparisons(
  locale: Locale,
): Promise<ComparisonSummary[]> {
  const out: ComparisonSummary[] = [];
  for (const slug of COMPARISON_SLUGS) {
    const content = await loadComparison(locale, slug);
    if (!content) continue;
    out.push({
      slug,
      title: content.meta.title,
      description: content.meta.description,
      competitorName: content.competitor.name,
      tagline: content.competitor.tagline,
    });
  }
  return out;
}
