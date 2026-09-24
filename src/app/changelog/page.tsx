import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Changelog",
  description: "Historial de cambios y mejoras de Zaltyko.",
  robots: { index: true, follow: true },
  alternates: { canonical: `${baseUrl}/changelog` },
};

const releases = [
  {
    date: "13 sep 2026",
    iso: "2026-09-13",
    title: "Empleo más seguro y cómodo desde el móvil",
    summary:
      "Las ofertas públicas solo muestran puestos activos, los formularios validan mejor los datos y la bolsa de empleo se adapta a pantallas pequeñas.",
    highlights: [
      "Filtros con categorías y jornadas coherentes con la plataforma.",
      "Salarios con rango válido y moneda visible.",
      "Acciones claras cuando hace falta iniciar sesión para publicar.",
    ],
  },
  {
    date: "12 sep 2026",
    iso: "2026-09-12",
    title: "Datos y alertas que inspiran confianza",
    summary:
      "El dashboard y los reportes comparten métricas consistentes, excluyen registros retirados y distinguen una consulta sin resultados de un error.",
    highlights: [
      "Reintento visible cuando una fuente no está disponible.",
      "Exportaciones y analítica respetan el alcance de cada academia.",
      "El centro de recursos enlaza guías reales en lugar de pantallas vacías.",
    ],
  },
  {
    date: "11 sep 2026",
    iso: "2026-09-11",
    title: "Más control para la operación diaria",
    summary:
      "Afinamos invitaciones, cobros, comunicaciones y acciones rápidas para que cada rol vea solo lo que necesita y cada cambio quede trazable.",
    highlights: [
      "Protecciones de tenant y academia en rutas operativas.",
      "Preferencias y envíos transaccionales con deduplicación.",
      "Importación de atletas con previsualización y detección de duplicados.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-20">
        <section className="bg-gradient-to-b from-zaltyko-primary/5 to-transparent py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <span className="font-display text-xs uppercase tracking-[0.35em] text-zaltyko-accent">
              Changelog
            </span>
            <h1 className="mt-4 max-w-2xl font-display text-3xl font-semibold text-foreground sm:text-5xl">
              Lo que estamos mejorando en Zaltyko
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Cambios pequeños y grandes que hacen más sencilla la vida de academias, entrenadores,
              familias y atletas. Solo publicamos mejoras que ya están disponibles.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <ol className="space-y-8" aria-label="Historial de cambios">
              {releases.map((release) => (
                <li
                  key={release.date}
                  className="relative rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:gap-8">
                    <time
                      dateTime={release.iso}
                      className="shrink-0 text-sm font-semibold uppercase tracking-wide text-zaltyko-primary sm:w-28"
                    >
                      {release.date}
                    </time>
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold text-foreground sm:text-2xl">{release.title}</h2>
                      <p className="mt-3 leading-7 text-muted-foreground">{release.summary}</p>
                      <ul className="mt-5 space-y-2 text-sm text-foreground">
                        {release.highlights.map((highlight) => (
                          <li key={highlight} className="flex items-start gap-2">
                            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zaltyko-teal" />
                            <span>{highlight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-12 rounded-2xl border border-border bg-muted/40 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                ¿Quieres saber si una función concreta está disponible para tu academia?
              </p>
              <div className="mt-4">
              <Link
                href="/contact?type=other"
                className="inline-flex items-center justify-center rounded-full bg-zaltyko-primary px-6 py-3 text-sm font-semibold text-white hover:bg-zaltyko-primary-dark"
              >
                Contactar
              </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
