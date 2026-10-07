import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { Schema } from "@/components/Schema";
import Reveal from "@/components/motion/Reveal";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "La historia de Zaltyko: tecnología para que la gimnasia tenga espacio",
  description:
    "Soy Elvis. Creé Zaltyko para que la gestión diaria de una academia no le quite espacio a la gimnasia. Conoce el propósito detrás del producto.",
  alternates: { canonical: `${baseUrl}/sobre-nosotros` },
  openGraph: {
    title: "Por qué existe Zaltyko",
    description:
      "La historia de Zaltyko empieza con una convicción: la gestión diaria debe ayudar a la academia, no ocupar el lugar de la gimnasia.",
    url: `${baseUrl}/sobre-nosotros`,
    siteName: "Zaltyko",
    type: "website",
    locale: "es_ES",
    images: [
      {
        url: `${baseUrl}/branding/zaltyko/photos/academia-editorial-02.png`,
        width: 1448,
        height: 1086,
        alt: "Manos de una entrenadora organizan una hoja de clase junto a material de gimnasia",
      },
    ],
  },
};

const principles = [
  {
    number: "01",
    title: "La dirección es protagonista",
    description:
      "La herramienta debe ayudar a quien coordina grupos, cuotas, asistencia, familias y equipo a tener una visión más clara del día.",
  },
  {
    number: "02",
    title: "La gimnasia marca el contexto",
    description:
      "Niveles, aparatos, sesiones y progreso forman parte de la conversación. Zaltyko se construye para gimnasia artística y rítmica.",
  },
  {
    number: "03",
    title: "La tecnología debe dejar espacio",
    description:
      "El propósito es ordenar tareas cotidianas para que el equipo pueda atender el entrenamiento y a las personas con más atención.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zaltyko-white">
      <Navbar />

      <main>
        <section className="relative overflow-hidden pb-16 pt-32 sm:pb-20 sm:pt-36">
          <div className="absolute -right-20 top-20 h-80 w-80 rounded-full bg-zaltyko-lime/25 blur-3xl" aria-hidden="true" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <p className="mb-5 text-xs font-bold uppercase tracking-[0.15em] text-zaltyko-teal">
                Sobre Zaltyko
              </p>
              <h1 className="max-w-4xl font-display text-4xl font-bold leading-[1.03] tracking-tight text-zaltyko-navy sm:text-6xl">
                La gimnasia merece más espacio que la gestión.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-zaltyko-text-secondary sm:text-xl">
                Zaltyko existe para ayudar a quienes dirigen academias de
                gimnasia a organizar el trabajo que rodea cada entrenamiento.
              </p>
            </Reveal>

            <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
              <Reveal delay={100}>
                <blockquote className="border-l-4 border-zaltyko-lime pl-6 sm:pl-8">
                  <p className="font-display text-2xl font-semibold leading-snug text-zaltyko-navy sm:text-3xl">
                    «Soy Elvis. Creé Zaltyko para que la gestión diaria no le quite espacio a la gimnasia.»
                  </p>
                  <footer className="mt-5 text-sm font-semibold text-zaltyko-teal">
                    Elvis <span className="font-normal text-zaltyko-text-secondary">· Fundador de Zaltyko</span>
                  </footer>
                </blockquote>

                <div className="mt-8 space-y-4 text-base leading-7 text-zaltyko-text-secondary">
                  <p>
                    En una academia conviven grupos, horarios, cuotas, asistencia,
                    familias y equipo. Cuando cada cosa queda en una hoja o una
                    conversación distinta, mantenerlo todo al día puede acabar
                    ocupando el tiempo que debería ir a dirigir y entrenar.
                  </p>
                  <p>
                    Por eso estoy construyendo Zaltyko alrededor de una tarea
                    concreta: reunir la operación diaria de academias de gimnasia
                    artística y rítmica para que la dirección trabaje con más
                    contexto y menos pasos repetidos.
                  </p>
                  <p>
                    Esa es la razón del producto y también su medida: que resulte
                    útil en el día real de una academia, para su equipo y para las
                    familias.
                  </p>
                </div>

                <Link
                  href="/features"
                  className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-lg font-semibold text-zaltyko-teal transition hover:gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-teal focus-visible:ring-offset-2"
                >
                  Ver qué resuelve Zaltyko
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </Reveal>

              <Reveal delay={180}>
                <figure className="relative">
                  <div className="absolute -bottom-4 -right-4 h-2/3 w-2/3 rounded-[1.75rem] bg-zaltyko-lime" aria-hidden="true" />
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] border border-white bg-zaltyko-navy shadow-medium">
                    <Image
                      src="/branding/zaltyko/photos/academia-editorial-02.png"
                      alt="Manos de una persona adulta organizan una hoja de clase y un cronómetro junto a aparatos de gimnasia."
                      fill
                      sizes="(max-width: 1024px) 100vw, 48vw"
                      className="object-cover"
                    />
                  </div>
                  <figcaption className="mt-4 text-sm text-zaltyko-text-secondary">
                    El trabajo que rodea cada entrenamiento también merece estar en orden.
                  </figcaption>
                </figure>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="border-y border-zaltyko-mist/70 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 max-w-2xl">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-zaltyko-teal">
                El porqué, convertido en producto
              </p>
              <h2 className="font-display text-3xl font-bold leading-tight text-zaltyko-navy sm:text-4xl">
                Una idea sencilla para un trabajo que nunca es sencillo.
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {principles.map((principle) => (
                <article
                  key={principle.number}
                  className="rounded-2xl border border-zaltyko-mist/80 bg-zaltyko-white p-6 sm:p-7"
                >
                  <p className="font-display text-sm font-bold text-zaltyko-teal">
                    {principle.number}
                  </p>
                  <h3 className="mt-5 font-display text-xl font-bold text-zaltyko-navy">
                    {principle.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-zaltyko-text-secondary">
                    {principle.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-zaltyko-navy py-16 text-white sm:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 sm:px-6 md:grid-cols-[1fr_auto] lg:px-8">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-zaltyko-lime">
                Tu academia, en ritmo
              </p>
              <h2 className="max-w-3xl font-display text-3xl font-bold leading-tight sm:text-4xl">
                Empieza por ordenar lo que más te roba tiempo.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/75">
                Crea tu cuenta gratis y configura tu academia cuando estés listo.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
              <Link
                href="/auth/register?role=owner"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-zaltyko-lime px-6 py-3 font-bold text-zaltyko-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zaltyko-navy"
              >
                Crear academia gratis
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/25 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
              >
                Ver planes
              </Link>
            </div>
          </div>
          <p className="mx-auto mt-10 flex max-w-6xl items-center gap-2 px-4 text-xs text-white/60 sm:px-6 lg:px-8">
            <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-zaltyko-lime" />
            El producto se construye para el día a día de academias de gimnasia artística y rítmica.
          </p>
        </section>
      </main>

      <Schema
        json={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          mainEntity: {
            "@type": "Organization",
            name: "Zaltyko",
            url: baseUrl,
            logo: `${baseUrl}/branding/zaltyko/logo-zaltyko-dark.svg`,
            description:
              "Sistema para ayudar a la dirección de academias de gimnasia artística y rítmica a organizar la operación diaria.",
            founder: {
              "@type": "Person",
              name: "Elvis",
              jobTitle: "Fundador de Zaltyko",
            },
            contactPoint: {
              "@type": "ContactPoint",
              email: "hola@zaltyko.com",
              contactType: "customer service",
              availableLanguage: ["Spanish"],
            },
          },
        }}
      />

      <Footer />
    </div>
  );
}
