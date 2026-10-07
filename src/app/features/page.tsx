import type { Metadata } from "next";
import Link from "next/link";

import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import FeaturesSection from "@/app/(site)/FeaturesSection";
import Reveal from "@/components/motion/Reveal";
import { Schema } from "@/components/Schema";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Funcionalidades para academias de gimnasia",
  description:
    "Ordena gimnastas, grupos, asistencia, cuotas y comunicación con familias en Zaltyko, un sistema para gimnasia artística y rítmica.",
  alternates: {
    canonical: `${baseUrl}/features`,
  },
  openGraph: {
    title: "Funcionalidades de Zaltyko | Software para gimnasia",
    description: "Gimnastas, grupos, asistencia, cuotas y comunicación con familias en un sistema para gimnasia artística y rítmica.",
    url: `${baseUrl}/features`,
    siteName: "Zaltyko",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Funcionalidades de Zaltyko",
    description: "Resuelve la gestión diaria de tu academia: gimnastas, grupos, asistencia, cuotas y familias.",
  },
};

const featureSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Zaltyko",
  applicationCategory: "BusinessApplication",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "EUR",
    description: "Plan Free para academias con hasta 30 gimnastas.",
  },
};

export default function FeaturesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <section className="bg-zaltyko-white pb-14 pt-32 sm:pb-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-zaltyko-teal">
                Para dirección de gimnasia artística y rítmica
              </p>
              <h1 className="max-w-4xl font-display text-4xl font-bold leading-[1.04] tracking-tight text-zaltyko-navy sm:text-6xl">
                Ordena lo que pasa antes y después de cada entrenamiento.
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-zaltyko-text-secondary sm:text-xl">
                Consulta qué puede resolver Zaltyko en fichas, grupos, asistencia,
                cuotas y comunicación con familias. Cada función aparece ligada
                al trabajo de dirección y a lo que obtiene tu academia.
              </p>
            </Reveal>
          </div>
        </section>
        <FeaturesSection />

        {/* CTA final */}
        <section className="py-16 bg-white">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
            <Reveal>
              <h2 className="font-display text-3xl font-bold tracking-tight text-zaltyko-text-main sm:text-4xl">
                Empieza por la parte que más te ocupa
              </h2>
              <p className="mt-4 text-lg text-zaltyko-text-secondary">
                Crea tu cuenta y configura tu academia; puedes empezar con el plan Free hasta 30 gimnastas.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
                <Link
                  href="/auth/register?role=owner"
                  className="inline-flex items-center justify-center rounded-full bg-zaltyko-primary px-8 py-3 font-semibold text-white hover:bg-zaltyko-primary-dark"
                >
                  Crear academia gratis
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center rounded-full border-2 border-zaltyko-primary px-8 py-3 font-semibold text-zaltyko-primary hover:bg-zaltyko-primary/10"
                >
                  Ver planes y precios
                </Link>
              </div>
              <p className="mt-4 text-sm text-zaltyko-text-secondary">
                Una academia · Hasta 30 gimnastas · Consulta los límites por plan
              </p>
            </Reveal>
          </div>
        </section>
      </main>
      <Footer />
      <Schema json={featureSchema} />
    </div>
  );
}
