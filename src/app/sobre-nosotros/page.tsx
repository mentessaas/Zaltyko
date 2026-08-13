import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { Target, Heart, TrendingUp, Shield, MapPin, ArrowRight, Sparkles } from "lucide-react";
import { Schema } from "@/components/Schema";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Sobre Nosotros | Zaltyko - Software para academias de gimnasia",
  description:
    "Zaltyko nace de la experiencia real de un entrenador de gimnasia artística. Conoce la historia detrás de la plataforma y hacia dónde va.",
  alternates: {
    canonical: `${baseUrl}/sobre-nosotros`,
  },
  openGraph: {
    title: "Sobre Nosotros | Zaltyko",
    description: "Zaltyko nace desde dentro de la gimnasia. Conoce la historia real detrás de la plataforma.",
    url: `${baseUrl}/sobre-nosotros`,
    siteName: "Zaltyko",
    type: "website",
    locale: "es_ES",
  },
};

const values = [
  {
    icon: Target,
    title: "Misión",
    description:
      "democratizar el acceso a tecnología de gestión profesional para academias de gimnasia de todos los tamaños, desde pequeños clubes hasta federaciones.",
  },
  {
    icon: Heart,
    title: "Pasión",
    description:
      "Entendemos la gimnasia porque vivimos de ella. Cada decisión de producto parte de lo que se necesita de verdad en el día a día de una academia.",
  },
  {
    icon: TrendingUp,
    title: "Innovación",
    description:
      "Construimos junto a entrenadores y propietarios de academias, no en su lugar. Cada funcionalidad nace de un problema real, no de una suposición.",
  },
  {
    icon: Shield,
    title: "Confianza",
    description:
      "Tus datos están seguros con nosotros. Cumplimos con RGPD y usamos estándares sólidos de seguridad.",
  },
];

const journey = ["Cuba", "México", "España"];

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-zaltyko-primary/5 to-transparent">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-4">
            Sobre Nosotros
          </span>
          <h1 className="font-display text-4xl font-bold tracking-tight text-zaltyko-text-main sm:text-5xl">
            Zaltyko empezó mucho antes de escribir la primera línea de código
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-lg text-zaltyko-text-secondary">
            La historia de un entrenador de gimnasia que decidió construir la herramienta
            que su academia necesitaba.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="prose prose-lg text-zaltyko-text-secondary">
            <p>
              Soy Elvis, entrenador de gimnasia artística y fundador de Zaltyko.
            </p>
            <p>
              He pasado años trabajando directamente con gimnastas, entrenadores y familias.
              Y cuanto más conocía el funcionamiento diario de una academia, más evidente se
              hacía un problema.
            </p>
            <p>
              Mientras el entrenamiento evoluciona constantemente, gran parte de la gestión
              sigue dependiendo de hojas de cálculo, mensajes de WhatsApp, procesos manuales
              y herramientas que no fueron diseñadas pensando en la gimnasia.
            </p>
            <p>
              Horarios por un lado. Asistencia por otro. Pagos. Grupos. Comunicaciones con
              las familias. Seguimiento de los gimnastas. Eventos y competiciones.
            </p>
            <p>Demasiadas piezas desconectadas para algo que debería funcionar como un solo sistema.</p>
            <p>Y trabajando dentro de este mundo empecé a preguntarme:</p>
            <p className="font-semibold text-zaltyko-text-main">
              ¿Cómo sería una plataforma si se construyera desde cero específicamente para
              gimnasia?
            </p>
            <p>De esa pregunta nació Zaltyko.</p>
          </div>

          {/* Journey */}
          <div className="my-10 flex flex-wrap items-center justify-center gap-3">
            {journey.map((place, index) => (
              <div key={place} className="flex items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-zaltyko-primary/20 bg-zaltyko-primary/5 px-4 py-2 text-sm font-medium text-zaltyko-text-main">
                  <MapPin className="h-4 w-4 text-zaltyko-primary" />
                  {place}
                </div>
                {index < journey.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-zaltyko-text-secondary/50" />
                )}
              </div>
            ))}
          </div>

          <div className="prose prose-lg text-zaltyko-text-secondary">
            <p>
              Mi historia también ha pasado por distintos países. Nací en Cuba, viví varios
              años en México y actualmente trabajo como entrenador en España.
            </p>
            <p>
              Eso me ha permitido ver algo importante: cambian los países, las academias y
              algunas formas de trabajar, pero muchos de los problemas se repiten.
            </p>
            <p>Por eso no quiero construir simplemente otro software de gestión.</p>
            <p>
              Quiero construir Zaltyko junto a entrenadores y propietarios de academias hasta
              convertirlo en una plataforma que entienda realmente cómo funciona este deporte.
            </p>
            <p>
              Estamos empezando por la gestión diaria: gimnastas, grupos, entrenadores,
              horarios, asistencia, pagos y comunicación.
            </p>
            <p>Pero la visión es mayor.</p>
            <p>
              Con el tiempo queremos conectar gestión, desarrollo deportivo, eventos y
              competiciones, servicios y otras herramientas específicas de la gimnasia dentro
              de un mismo ecosistema.
            </p>
          </div>

          <blockquote className="mt-10 border-l-4 border-zaltyko-primary pl-6">
            <p className="text-xl font-semibold text-zaltyko-text-main">
              Zaltyko nace desde dentro de la gimnasia y queremos que crezca junto a ella.
            </p>
            <footer className="mt-4 text-sm text-zaltyko-text-secondary">
              — Elvis, Fundador de Zaltyko · Entrenador de gimnasia artística
            </footer>
          </blockquote>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 surface-subtle">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-zaltyko-text-main text-center mb-12">
            Nuestros valores
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {values.map((value, index) => {
              const Icon = value.icon;
              return (
                <div key={index} className="text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zaltyko-primary/10">
                    <Icon className="h-8 w-8 text-zaltyko-primary" />
                  </div>
                  <h3 className="mt-4 font-semibold text-zaltyko-text-main">{value.title}</h3>
                  <p className="mt-2 text-sm text-zaltyko-text-secondary">{value.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Founder */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-md px-4 sm:px-6 lg:px-8 text-center">
          <div className="mx-auto h-24 w-24 rounded-full bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark flex items-center justify-center text-white text-3xl font-bold">
            E
          </div>
          <h3 className="mt-4 font-semibold text-zaltyko-text-main text-lg">Elvis</h3>
          <p className="text-sm text-zaltyko-primary font-medium">Fundador de Zaltyko</p>
          <p className="mt-2 text-sm text-zaltyko-text-secondary">
            Entrenador de gimnasia artística. Nacido en Cuba, con años en México y hoy
            entrenando en España.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-zaltyko-navy py-20">
        <div className="absolute inset-0 zaltyko-motion-lines opacity-60" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            ¿Quieres formar parte de esta historia?
          </h2>
          <p className="mt-4 text-lg text-white/80">
            Únete a las academias que ya confían en Zaltyko.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/auth/register?role=owner"
              className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-zaltyko-teal px-8 py-4 text-base font-bold text-white shadow-brand transition-all duration-200 hover:bg-primary-dark hover:shadow-lift hover:-translate-y-0.5"
            >
              <Sparkles className="h-5 w-5" />
              Crea tu academia gratis
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-8 py-4 text-base font-bold text-white backdrop-blur-sm transition-all duration-300 hover:bg-white/20"
            >
              Contactar
            </Link>
          </div>
        </div>
      </section>

      {/* Organization Schema */}
      <Schema
        json={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          mainEntity: {
            "@type": "Organization",
            name: "Zaltyko",
            url: baseUrl,
            logo: `${baseUrl}/branding/zaltyko/logo-zaltyko-dark.svg`,
            description: "Software especializado para la gestión de academias de gimnasia, creado por un entrenador de gimnasia artística.",
            founder: {
              "@type": "Person",
              name: "Elvis",
              jobTitle: "Fundador",
              description: "Entrenador de gimnasia artística.",
            },
            contactPoint: {
              "@type": "ContactPoint",
              email: "hola@zaltyko.com",
              contactType: "customer service",
              availableLanguage: ["Spanish", "English"],
            },
            sameAs: [
              "https://twitter.com/zaltyko",
              "https://linkedin.com/company/zaltyko",
              "https://instagram.com/zaltyko"
            ],
          },
        }}
      />

      <Footer />
    </div>
  );
}
