import type { Metadata } from "next";
import Link from "next/link";

import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import FeaturesSection from "@/app/(site)/FeaturesSection";
import { Schema } from "@/components/Schema";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Funcionalidades | Software para academias de gimnasia",
  description:
    "Gestión de gimnastas, grupos, cobros, eventos y familias para academias de gimnasia artística y rítmica.",
  alternates: {
    canonical: `${baseUrl}/features`,
  },
  openGraph: {
    title: "Funcionalidades de Zaltyko | Software para gimnasia",
    description: "Gestión de gimnastas, grupos, cobros, eventos y familias para academias de gimnasia artística y rítmica.",
    url: `${baseUrl}/features`,
    siteName: "Zaltyko",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Funcionalidades de Zaltyko",
    description: "Todo lo que necesitas para administrar tu academia de gimnasia.",
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
    description: "Plan Free: 7 días de Starter sin tarjeta para probar todas las funcionalidades",
  },
};

export default function FeaturesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        {/* Hero simple para features */}
        <section className="pt-32 pb-16 bg-gradient-to-b from-zaltyko-primary/5 to-transparent">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-4">
              Funcionalidades
            </span>
            <h1 className="font-display text-4xl font-bold tracking-tight text-zaltyko-text-main sm:text-5xl">
              Funcionalidades para tu academia de gimnasia
            </h1>
            <p className="mt-6 mx-auto max-w-2xl text-lg text-zaltyko-text-secondary">
              Gimnastas, coaches, cobros, evaluaciones y eventos en una sola plataforma pensada para gimnasia artística y rítmica.
            </p>
          </div>
        </section>
        <FeaturesSection />

        {/* CTA final */}
        <section className="py-16 bg-white">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-zaltyko-text-main sm:text-4xl">
              Prueba Zaltyko con tu academia
            </h2>
            <p className="mt-4 text-lg text-zaltyko-text-secondary">
              Crea tu academia gratis, importa a tus gimnastas y explora cada funcionalidad en un clic.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/auth/register?role=owner"
                className="inline-flex items-center justify-center rounded-full bg-zaltyko-primary px-8 py-3 font-semibold text-white hover:bg-primary-dark"
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
              7 días de Starter sin tarjeta · Sin permanencia
            </p>
          </div>
        </section>
      </main>
      <Footer />
      <Schema json={featureSchema} />
    </div>
  );
}
