import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calendar, User } from "lucide-react";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { Schema } from "@/components/Schema";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { listBlogPosts } from "@/lib/seo/blog";

export const metadata: Metadata = {
  title: "Blog de Zaltyko | Guías para academias de gimnasia",
  description:
    "Guías prácticas para academias de gimnasia: migración desde Excel, cobros, federaciones, elección de software. Contenido pensado para directoras y entrenadores.",
  alternates: {
    canonical: `${getPublicSiteUrl()}/blog`,
  },
  openGraph: {
    title: "Blog de Zaltyko",
    description:
      "Guías prácticas para academias de gimnasia: migración desde Excel, cobros, federaciones, elección de software.",
    type: "website",
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogIndexPage() {
  const baseUrl = getPublicSiteUrl();
  const posts = await listBlogPosts("es");

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${baseUrl}/blog#blog`,
    name: "Blog de Zaltyko",
    description:
      "Guías prácticas para academias de gimnasia que están digitalizando su gestión.",
    url: `${baseUrl}/blog`,
    inLanguage: "es",
    isPartOf: { "@id": `${baseUrl}/#website` },
    publisher: { "@id": `${baseUrl}/#organization` },
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${baseUrl}/blog/${p.slug}`,
      datePublished: p.datePublished,
      dateModified: p.dateModified,
      author: { "@type": "Organization", name: p.author },
    })),
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 pt-20">
        <section className="py-16 bg-gradient-to-b from-zaltyko-primary/5 to-transparent">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
            <span className="inline-block px-4 py-1.5 bg-zaltyko-teal/10 text-zaltyko-indigo text-sm font-semibold rounded-full mb-4">
              Blog
            </span>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
              Guías prácticas para tu academia de gimnasia
            </h1>
            <p className="text-lg text-muted-foreground">
              Migración desde Excel, gestión de cobros, federaciones,
              elección de software. Sin humo.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-6">
              {posts.map((p) => (
                <article
                  key={p.slug}
                  className="bg-card rounded-2xl border border-border p-6 hover:border-zaltyko-teal/30 transition-colors"
                >
                  <span className="inline-block px-3 py-1 text-xs font-semibold bg-zaltyko-teal/10 text-zaltyko-indigo rounded-full mb-3">
                    {p.category}
                  </span>
                  <h2 className="font-display text-xl font-semibold text-foreground mb-2 leading-snug">
                    <Link
                      href={`/blog/${p.slug}`}
                      className="hover:text-zaltyko-teal"
                    >
                      {p.title}
                    </Link>
                  </h2>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                    {p.excerpt}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar aria-hidden="true" className="h-3 w-3" />
                      {formatDate(p.datePublished)}
                    </span>
                    <span className="flex items-center gap-1">
                      <User aria-hidden="true" className="h-3 w-3" />
                      {p.author}
                    </span>
                  </div>
                  <Link
                    href={`/blog/${p.slug}`}
                    className="inline-flex items-center gap-1 mt-4 text-sm font-medium text-zaltyko-teal hover:gap-2 transition-all"
                  >
                    Leer artículo
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <Schema json={collectionSchema} />
    </div>
  );
}
