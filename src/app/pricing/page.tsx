import type { Metadata } from "next";

import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import PricingSection from "@/app/(site)/pricing";
import { Schema } from "@/components/Schema";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Precios | Software para academias de gimnasia | Zaltyko",
  description: "Planes Free, Pro y Premium diseñados para escalar tu academia de gimnasia. Empieza gratis y crece sin límites.",
  alternates: {
    canonical: `${baseUrl}/pricing`,
  },
  openGraph: {
    title: "Precios | Zaltyko - Software para academias de gimnasia",
    description: "Compara planes Free, Pro y Premium y crece sin límites.",
    url: `${baseUrl}/pricing`,
    siteName: "Zaltyko",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Planes para academias de gimnasia | Zaltyko",
    description: "Cambia de plan cuando lo necesites. Free, Pro y Premium.",
  },
};

const pricingSchema = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Planes Zaltyko",
  description: "Software para gestión de academias de gimnasia",
  offerCatalog: {
    "@type": "OfferCatalog",
    name: "Planes disponibles",
    itemListElement: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "EUR",
      },
      {
        "@type": "Offer",
        name: "Pro",
        price: "19",
        priceCurrency: "EUR",
      },
      {
        "@type": "Offer",
        name: "Premium",
        price: "49",
        priceCurrency: "EUR",
      },
    ],
  },
};

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <PricingSection />
      </main>
      <Footer />
      <Schema json={pricingSchema} />
    </div>
  );
}
