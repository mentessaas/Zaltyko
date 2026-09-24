import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import Reveal from "@/components/motion/Reveal";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { ArrowRight, BookOpen, CheckCircle2 } from "lucide-react";
import { helpArticles } from "@/lib/help/articles";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Recursos para academias de gimnasia",
  description:
    "Guías prácticas para organizar atletas, clases, cobros y comunicación en una academia de gimnasia.",
  alternates: { canonical: `${baseUrl}/blog` },
};

export default function BlogPage() {
  const featuredArticles = helpArticles.slice(0, 6);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-20">
        <section className="relative overflow-hidden bg-zaltyko-navy py-20 text-white sm:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(31,199,182,0.18),transparent_45%)]" />
          <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-zaltyko-accent">
                <BookOpen className="h-4 w-4" />
                Recursos
              </div>
              <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                Decisiones más claras para el día a día de tu academia
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/75">
                Guías breves y accionables para pasar de la hoja de cálculo a una operación que tu equipo y las familias puedan entender.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/help"
                  className="inline-flex items-center justify-center rounded-full bg-zaltyko-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-zaltyko-primary-dark"
                >
                  Ver centro de ayuda
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="/contact?type=other"
                  className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Hablar con el equipo
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zaltyko-primary">Para empezar</p>
                <h2 className="mt-3 font-display text-3xl font-semibold text-foreground sm:text-4xl">
                  Lo que necesitas resolver primero
                </h2>
                <p className="mt-4 text-base leading-7 text-muted-foreground">
                  Una base ordenada evita perseguir información durante el entrenamiento, el cobro o la comunicación con las familias.
                </p>
              </div>
            </Reveal>

            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {featuredArticles.map((article, index) => (
                <Reveal key={article.slug} delay={index * 60}>
                  <Link
                    href={`/help/${article.slug}`}
                    className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-soft transition hover:-translate-y-1 hover:border-zaltyko-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-primary/50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="rounded-full bg-zaltyko-primary/10 px-3 py-1 text-xs font-semibold text-zaltyko-primary">
                        {article.category}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-zaltyko-primary" />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-foreground">{article.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{article.summary}</p>
                    <span className="mt-5 inline-flex items-center text-sm font-semibold text-zaltyko-primary">
                      Leer guía
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="surface-subtle py-16 sm:py-20">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zaltyko-primary">Pensado para gimnasia</p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-foreground">Menos administración improvisada. Más tiempo en pista.</h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Zaltyko conecta atletas, grupos, asistencia, evaluaciones y cobros en el mismo contexto de academia.
              </p>
            </div>
            <ul className="grid gap-3 text-sm text-foreground sm:grid-cols-2 lg:min-w-[360px] lg:grid-cols-1">
              {["Datos de atletas en un solo lugar", "Cobros con contexto y trazabilidad", "Comunicación ligada al grupo correcto"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-zaltyko-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
