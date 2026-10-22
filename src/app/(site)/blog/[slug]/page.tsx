import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar, User, ArrowLeft, ArrowRight } from "lucide-react";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { Schema } from "@/components/Schema";
import RelatedContent from "@/components/seo/RelatedContent";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { getBlogSlugs, isBlogSlug, loadBlogPost } from "@/lib/seo/blog";
import { loadBlogCrossLinks } from "@/lib/seo/related";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isBlogSlug(slug)) return { title: "Artículo no encontrado" };
  const post = await loadBlogPost("es", slug);
  if (!post) return { title: "Artículo no encontrado" };

  const baseUrl = getPublicSiteUrl();
  const pageUrl = `${baseUrl}/blog/${slug}`;

  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: pageUrl,
      siteName: "Zaltyko",
      locale: "es_ES",
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified,
      authors: [post.author],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderContent(blocks: string[]): React.ReactNode {
  // Render minimal: cada bloque es un párrafo o un heading "## ...".
  // Convertimos headings a h2 y párrafos con texto plano (incluye <a> básico).
  return blocks.map((block, i) => {
    if (block.startsWith("## ")) {
      return (
        <h2
          key={i}
          className="font-display text-2xl font-semibold text-foreground mt-10 mb-3"
        >
          {block.slice(3)}
        </h2>
      );
    }
    if (block.startsWith("### ")) {
      return (
        <h3
          key={i}
          className="font-display text-lg font-semibold text-foreground mt-6 mb-2"
        >
          {block.slice(4)}
        </h3>
      );
    }
    if (block.startsWith("- ")) {
      const items = blocks.filter((b) => b.startsWith("- "));
      // Solo emitimos la primera vez; el resto se descartan en keys repetidas.
      if (i === blocks.findIndex((b) => b.startsWith("- "))) {
        return (
          <ul key={i} className="my-4 ml-6 list-disc space-y-1 text-base text-foreground leading-relaxed">
            {items.map((it, j) => (
              <li key={j}>{it.slice(2)}</li>
            ))}
          </ul>
        );
      }
      return null;
    }
    return (
      <p
        key={i}
        className="my-4 text-base leading-relaxed text-foreground"
      >
        {block}
      </p>
    );
  });
}

export default async function BlogDetailPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isBlogSlug(slug)) notFound();

  const post = await loadBlogPost("es", slug);
  if (!post) notFound();

  const baseUrl = getPublicSiteUrl();
  const crossLinks = await loadBlogCrossLinks(post);
  const pageUrl = `${baseUrl}/blog/${slug}`;

  const blogPostingSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${pageUrl}#article`,
        headline: post.title,
        description: post.description,
        datePublished: post.datePublished,
        dateModified: post.dateModified,
        inLanguage: "es",
        author: { "@type": "Organization", name: post.author },
        publisher: { "@id": `${baseUrl}/#organization` },
        mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
        keywords: post.keywords.join(", "),
        articleSection: post.category,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: baseUrl },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${baseUrl}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: pageUrl },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 pt-20">
        <article className="py-12">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-zaltyko-teal mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al blog
            </Link>

            <span className="inline-block px-3 py-1 text-xs font-semibold bg-zaltyko-teal/10 text-zaltyko-indigo rounded-full mb-4">
              {post.category}
            </span>

            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-4">
              {post.title}
            </h1>

            <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
              {post.excerpt}
            </p>

            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8 pb-8 border-b border-border">
              <span className="flex items-center gap-1">
                <User aria-hidden="true" className="h-4 w-4" />
                {post.author}
              </span>
              <span className="flex items-center gap-1">
                <Calendar aria-hidden="true" className="h-4 w-4" />
                <time dateTime={post.datePublished}>{formatDate(post.datePublished)}</time>
              </span>
            </div>

            <div className="prose-content">{renderContent(post.content)}</div>

            {/* Related routes (producto / feature) */}
            {post.relatedRoutes.length > 0 && (
              <aside className="mt-12 pt-8 border-t border-border">
                <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
                  Sigue explorando
                </h2>
                <div className="flex flex-wrap gap-3">
                  {post.relatedRoutes.map((route) => (
                    <Link
                      key={route}
                      href={route}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-full border border-border bg-card hover:border-zaltyko-teal/40 hover:bg-zaltyko-teal/5 text-sm font-medium text-foreground"
                    >
                      {route === "/pricing"
                        ? "Ver planes y precios"
                        : route === "/features"
                          ? "Ver funcionalidades"
                          : route === "/comparativas"
                            ? "Ver comparativas"
                            : route}
                      <ArrowRight aria-hidden="true" className="h-3 w-3" />
                    </Link>
                  ))}
                </div>
              </aside>
            )}

            {/* Cross-links: otros posts del blog + comparativas relacionadas */}
            <RelatedContent
              posts={crossLinks.posts.map((p) => ({
                slug: p.slug,
                title: p.title,
                category: p.category,
              }))}
              comparisons={crossLinks.comparisons.map((c) => {
                // Resolver el slug canónico desde el comparator name para que el
                // link `/comparativas/${slug}` exista realmente en el registry.
                const slug = c.meta.title.toLowerCase().includes("excel")
                  ? "zaltyko-vs-excel"
                  : c.meta.title.toLowerCase().includes("sportmember")
                    ? "zaltyko-vs-sportmember"
                    : c.meta.title.toLowerCase().includes("glofox")
                      ? "zaltyko-vs-glofox"
                      : "zaltyko-vs-excel";
                return {
                  slug,
                  competitorName: c.competitor.name,
                };
              })}
            />
          </div>
        </article>

        {/* CTA */}
        <section className="py-16 bg-zaltyko-teal/5">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-foreground mb-3">
              ¿Listo para probarlo con tu academia?
            </h2>
            <p className="text-base text-muted-foreground mb-6">
              7 días de Starter sin tarjeta. Una activación por academia cada 12 meses.
            </p>
            <Link
              href="/auth/register?role=owner"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-zaltyko-teal px-6 py-3 text-sm font-semibold text-white hover:bg-zaltyko-primary-dark"
            >
              Crear academia gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
      <Schema json={blogPostingSchema} />
    </div>
  );
}

export const dynamicParams = false;
