import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { Schema } from "@/components/Schema";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { listComparisons } from "@/lib/seo/comparativas";

export const metadata: Metadata = {
  title: "Compara herramientas para dirigir tu academia de gimnasia",
  description:
    "Compara cómo distintas herramientas resuelven cuotas, clases, asistencia y comunicación para una academia de gimnasia.",
  alternates: {
    canonical: `${getPublicSiteUrl()}/comparativas`,
  },
  openGraph: {
    title: "Compara herramientas para dirigir tu academia",
    description:
      "Revisa alternativas para organizar cuotas, grupos, asistencia y familias en una academia de gimnasia.",
    type: "website",
  },
};

export default async function ComparisonsIndexPage() {
  const baseUrl = getPublicSiteUrl();
  const comparisons = await listComparisons("es");

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${baseUrl}/comparativas#collection`,
    name: "Compara herramientas para dirigir tu academia de gimnasia",
    description:
      "Compara alternativas según las tareas de dirección que necesitas organizar.",
    url: `${baseUrl}/comparativas`,
    inLanguage: "es",
    isPartOf: { "@id": `${baseUrl}/#website` },
    publisher: { "@id": `${baseUrl}/#organization` },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: comparisons.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.title,
        url: `${baseUrl}/comparativas/${c.slug}`,
      })),
    },
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 pt-20">
        <section className="py-16 bg-gradient-to-b from-zaltyko-primary/5 to-transparent">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
            <span className="inline-block px-4 py-1.5 bg-zaltyko-teal/10 text-zaltyko-indigo text-sm font-semibold rounded-full mb-4">
              Comparativas
            </span>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
              Compara herramientas para el día a día de tu academia
            </h1>
            <p className="text-lg text-muted-foreground">
              Revisa qué aporta cada opción para organizar cuotas, grupos,
              asistencia, familias y trabajo de equipo.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-6">
              {comparisons.map((c) => (
                <Link
                  key={c.slug}
                  href={`/comparativas/${c.slug}`}
                  className="group bg-card hover:bg-zaltyko-teal/5 rounded-2xl p-6 border border-border hover:border-zaltyko-teal/30 transition-all duration-200"
                >
                  <h2 className="font-display text-xl font-semibold text-foreground group-hover:text-zaltyko-teal mb-2">
                    {c.title}
                  </h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    {c.description}
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-zaltyko-teal">
                    Ver qué ofrece cada opción
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Link>
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
