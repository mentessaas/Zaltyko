import Link from "next/link";
import { ArrowRight, BookOpen, GitCompare } from "lucide-react";

interface BlogItem {
  slug: string;
  title: string;
  category: string;
}

interface ComparisonItem {
  slug: string;
  competitorName: string;
}

interface RelatedContentProps {
  posts: BlogItem[];
  comparisons: ComparisonItem[];
  /** Etiqueta del bloque; default "Sigue explorando". */
  title?: string;
}

/**
 * Renderiza una seccion con enlaces cruzados a otros posts del blog y a
 * comparativas. Usado al final de blog/[slug] y comparativas/[slug] para
 * distribuir profundidad de crawl y reforzar autoridad topical entre
 * contenidos relacionados (anchor text descriptivo, no generico).
 *
 * Fail-closed: si no hay nada que mostrar, retorna null. Los slugs
 * invalidos se filtran antes (en el loader), no aqui.
 */
export default function RelatedContent({
  posts,
  comparisons,
  title = "Sigue explorando",
}: RelatedContentProps) {
  if (posts.length === 0 && comparisons.length === 0) return null;

  return (
    <section className="mt-12 pt-8 border-t border-border">
      <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
        {title}
      </h2>

      {posts.length > 0 && (
        <div className="mb-6">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-3">
            <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
            Articulos relacionados
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {posts.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/blog/${p.slug}`}
                  className="group flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-zaltyko-teal/40 hover:bg-zaltyko-teal/5 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {p.category}
                    </span>
                    <p className="text-sm font-medium text-foreground group-hover:text-zaltyko-teal leading-snug line-clamp-2">
                      {p.title}
                    </p>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="h-4 w-4 mt-1 shrink-0 text-muted-foreground group-hover:text-zaltyko-teal group-hover:translate-x-0.5 transition-all"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {comparisons.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-3">
            <GitCompare aria-hidden="true" className="h-3.5 w-3.5" />
            Comparativas relacionadas
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {comparisons.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/comparativas/${c.slug}`}
                  className="group flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-zaltyko-teal/40 hover:bg-zaltyko-teal/5 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Comparativa
                    </span>
                    <p className="text-sm font-medium text-foreground group-hover:text-zaltyko-teal leading-snug line-clamp-2">
                      Zaltyko vs {c.competitorName}
                    </p>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="h-4 w-4 mt-1 shrink-0 text-muted-foreground group-hover:text-zaltyko-teal group-hover:translate-x-0.5 transition-all"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
