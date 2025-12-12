import type { Metadata } from "next";

import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import FeaturesSection from "@/app/(site)/FeaturesSection";
import { Schema } from "@/components/Schema";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Funcionalidades | Software para academias de gimnasia | Zaltyko",
  description:
    "Gestión de atletas, clases, pagos, eventos y comunicación. Todo lo que necesitas para administrar tu academia de gimnasia.",
  alternates: {
    canonical: `${baseUrl}/features`,
  },
  openGraph: {
    title: "Funcionalidades de Zaltyko | Software para gimnasia",
    description: "Gestión de atletas, clases, pagos, eventos y comunicación para academias de gimnasia.",
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
              Todo lo que tu academia necesita
            </h1>
            <p className="mt-6 mx-auto max-w-2xl text-lg text-zaltyko-text-secondary">
              Módulos diseñados específicamente para la gestión de academias de gimnasia artística, rítmica y acrobática.
            </p>
          </div>
        </section>
        <FeaturesSection />
      </main>
      <Footer />
      <Schema json={featureSchema} />
    </div>
  );
}
