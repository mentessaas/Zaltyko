import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Check, X, ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { Schema } from "@/components/Schema";
import RelatedContent from "@/components/seo/RelatedContent";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import {
  getComparisonSlugs,
  isComparisonSlug,
  loadComparison,
} from "@/lib/seo/comparativas";
import { loadComparisonCrossLinks } from "@/lib/seo/related";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getComparisonSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isComparisonSlug(slug)) {
    return { title: "Comparativa no encontrada" };
  }
  const content = await loadComparison("es", slug);
  if (!content) return { title: "Comparativa no encontrada" };

  const baseUrl = getPublicSiteUrl();
  const canonicalUrl = `${baseUrl}/comparativas/${slug}`;

  return {
    title: content.meta.title,
    description: content.meta.description,
    keywords: content.meta.keywords,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: content.meta.title,
      description: content.meta.description,
      url: canonicalUrl,
      siteName: "Zaltyko",
      locale: "es_ES",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: content.meta.title,
      description: content.meta.description,
    },
  };
}

export default async function ComparisonDetailPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isComparisonSlug(slug)) notFound();

  const content = await loadComparison("es", slug);
  if (!content) notFound();

  const baseUrl = getPublicSiteUrl();
  const crossLinks = await loadComparisonCrossLinks(content);
  const pageUrl = `${baseUrl}/comparativas/${slug}`;

  // Schema: Article + BreadcrumbList + FAQPage inline (Google acepta los 3
  // como nodos independientes en una página de comparativa).
  const articleSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${pageUrl}#article`,
        headline: content.meta.title,
        description: content.meta.description,
        datePublished: "2026-09-18",
        dateModified: "2026-09-18",
        inLanguage: "es",
        author: { "@id": `${baseUrl}/#organization` },
        publisher: { "@id": `${baseUrl}/#organization` },
        mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: baseUrl },
          { "@type": "ListItem", position: 2, name: "Comparativas", item: `${baseUrl}/comparativas` },
          { "@type": "ListItem", position: 3, name: content.competitor.name, item: pageUrl },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: content.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 pt-20">
        {/* Hero */}
        <section className="py-16 bg-gradient-to-b from-zaltyko-primary/5 to-transparent">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <Link
              href="/comparativas"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-zaltyko-teal mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Todas las comparativas
            </Link>
            <span className="inline-block px-4 py-1.5 bg-zaltyko-teal/10 text-zaltyko-indigo text-sm font-semibold rounded-full mb-4">
              {content.hero.badge}
            </span>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
              {content.hero.headline}
            </h1>
            <p className="text-lg text-muted-foreground">
              {content.hero.subheadline}
            </p>
          </div>
        </section>

        {/* Tabla comparativa */}
        <section className="py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-6">
              Funcionalidades clave
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full bg-card">
                <thead>
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-bold text-foreground border-b border-border">
                      Funcionalidad
                    </th>
                    <th className="px-4 py-4 text-center text-sm font-bold bg-zaltyko-teal text-white">
                      <span className="block">Zaltyko</span>
                      <span className="text-[11px] font-medium">Especializado</span>
                    </th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-muted-foreground border-b border-border">
                      {content.competitor.name}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {content.table.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={
                        i % 2 === 0 ? "bg-card" : "bg-muted/30"
                      }
                    >
                      <td className="px-6 py-3 text-sm font-medium text-foreground border-b border-border/40">
                        {row.feature}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground border-x border-zaltyko-teal/15 bg-zaltyko-teal/[0.04]">
                        <div className="flex items-start gap-2">
                          <Check aria-hidden="true" className="h-4 w-4 mt-0.5 text-zaltyko-teal shrink-0" />
                          <span>{row.zaltyko}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground border-b border-border/40">
                        {row.competitor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Pros y contras */}
        <section className="py-16 bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-8 text-center">
              Pros y contras honestos
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <article className="bg-card rounded-2xl border border-border p-6">
                <h3 className="font-display text-xl font-semibold text-zaltyko-teal mb-4">
                  Zaltyko
                </h3>
                <div className="space-y-3 mb-5">
                  <h4 className="text-sm font-semibold text-foreground">Puntos fuertes</h4>
                  <ul className="space-y-2">
                    {content.zaltykoPros.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm">
                        <Check aria-hidden="true" className="h-4 w-4 mt-0.5 text-zaltyko-teal shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-3 border-t border-border pt-4">
                  <h4 className="text-sm font-semibold text-foreground">Limitaciones</h4>
                  <ul className="space-y-2">
                    {content.zaltykoContras.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <X aria-hidden="true" className="h-4 w-4 mt-0.5 text-muted-foreground/60 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
              <article className="bg-card rounded-2xl border border-border p-6">
                <h3 className="font-display text-xl font-semibold text-foreground mb-4">
                  {content.competitor.name}
                </h3>
                <div className="space-y-3 mb-5">
                  <h4 className="text-sm font-semibold text-foreground">Puntos fuertes</h4>
                  <ul className="space-y-2">
                    {content.competitorPros.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm">
                        <Check aria-hidden="true" className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-3 border-t border-border pt-4">
                  <h4 className="text-sm font-semibold text-foreground">Limitaciones</h4>
                  <ul className="space-y-2">
                    {content.competitorContras.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <X aria-hidden="true" className="h-4 w-4 mt-0.5 text-muted-foreground/60 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Para quién */}
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-8 text-center">
              ¿Para quién encaja cada opción?
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card rounded-2xl border border-border p-6">
                <h3 className="font-display text-lg font-semibold text-zaltyko-teal mb-3 flex items-center gap-2">
                  <Sparkles aria-hidden="true" className="h-5 w-5" />
                  Zaltyko encaja si…
                </h3>
                <ul className="space-y-2 text-sm">
                  {content.idealForZaltyko.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check aria-hidden="true" className="h-4 w-4 mt-0.5 text-zaltyko-teal shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-card rounded-2xl border border-border p-6">
                <h3 className="font-display text-lg font-semibold text-foreground mb-3">
                  {content.competitor.name} encaja si…
                </h3>
                <ul className="space-y-2 text-sm">
                  {content.idealForCompetitor.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-muted-foreground">
                      <Check aria-hidden="true" className="h-4 w-4 mt-0.5 text-muted-foreground/60 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Veredicto */}
        <section className="py-12 bg-muted/30">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">
              Veredicto
            </h2>
            <p className="text-base leading-relaxed text-foreground">
              {content.verdict}
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 className="font-display text-2xl font-semibold text-foreground mb-6">
              Preguntas frecuentes
            </h2>
            <div className="space-y-4">
              {content.faq.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-2xl border border-border bg-card overflow-hidden"
                >
                  <summary className="cursor-pointer list-none px-5 py-4 text-base font-semibold text-foreground flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <span>{item.q}</span>
                    <span aria-hidden="true" className="text-zaltyko-teal text-2xl leading-none transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 bg-zaltyko-teal/5">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-foreground mb-3">
              ¿Quieres probar Zaltyko con tu academia?
            </h2>
            <p className="text-base text-muted-foreground mb-6">
              7 días de Starter sin tarjeta. Una activación por academia cada 12 meses.
              Al terminar vuelve a Free automáticamente.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/auth/register?role=owner"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-zaltyko-teal px-6 py-3 text-sm font-semibold text-white hover:bg-zaltyko-primary-dark"
              >
                Crear academia gratis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted"
              >
                Ver planes y precios
              </Link>
            </div>
          </div>
        </section>

        {/* Cross-links: blog posts + otras comparativas */}
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pb-16">
          <RelatedContent
            posts={crossLinks.posts.map((p) => ({
              slug: p.slug,
              title: p.title,
              category: p.category,
            }))}
            comparisons={crossLinks.comparisons.map((c) => {
              // Slug canonico derivado del nombre del competidor. Si Zaltyko
              // anade mas comparativas, ajustar el mapping.
              const slug = c.competitor.name.toLowerCase().includes("excel")
                ? "zaltyko-vs-excel"
                : c.competitor.name.toLowerCase().includes("sportmember")
                  ? "zaltyko-vs-sportmember"
                  : c.competitor.name.toLowerCase().includes("glofox")
                    ? "zaltyko-vs-glofox"
                    : "zaltyko-vs-excel";
              return {
                slug,
                competitorName: c.competitor.name,
              };
            })}
          />
        </div>
      </main>

      <Footer />
      <Schema json={articleSchema} />
    </div>
  );
}

export const dynamicParams = false;
