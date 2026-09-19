import Link from "next/link";
import { ArrowRight, Calendar } from "lucide-react";
import { listBlogPosts } from "@/lib/seo/blog";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function LatestArticlesSection() {
  const posts = await listBlogPosts("es");
  const featured = posts.slice(0, 3);

  if (featured.length === 0) return null;

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-12 gap-4 flex-wrap">
          <div>
            <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-3">
              Blog
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
              Guías prácticas para tu academia
            </h2>
            <p className="mt-3 text-lg text-muted-foreground max-w-2xl">
              Migración desde Excel, gestión de cobros, federaciones y más.
              Contenido pensado para directoras y entrenadores.
            </p>
          </div>
          <Link
            href="/blog"
            className="inline-flex items-center gap-1 text-sm font-semibold text-zaltyko-teal hover:underline whitespace-nowrap"
          >
            Ver todos los artículos
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {featured.map((p) => (
            <article
              key={p.slug}
              className="bg-card rounded-2xl border border-border p-6 hover:border-zaltyko-teal/30 transition-colors"
            >
              <span className="inline-block px-3 py-1 text-xs font-semibold bg-zaltyko-teal/10 text-zaltyko-indigo rounded-full mb-3">
                {p.category}
              </span>
              <h3 className="font-display text-lg font-semibold text-foreground mb-2 leading-snug">
                <Link
                  href={`/blog/${p.slug}`}
                  className="hover:text-zaltyko-teal"
                >
                  {p.title}
                </Link>
              </h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                {p.excerpt}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar aria-hidden="true" className="h-3 w-3" />
                  {formatDate(p.datePublished)}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
