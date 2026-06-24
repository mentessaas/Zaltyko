import type { Metadata } from "next";

import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import PricingSection from "@/app/(site)/pricing";
import { Schema } from "@/components/Schema";
import { NETWORK_PLAN, PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Planes y Precios para Academias de Gimnasia",
  description: "Planes Starter, Growth y Network para academias de gimnasia artística y rítmica.",
  alternates: {
    canonical: `${baseUrl}/pricing`,
  },
  openGraph: {
    title: "Precios",
    description: "Compara planes Starter, Growth y Network para academias de artística y rítmica.",
    url: `${baseUrl}/pricing`,
    siteName: "Zaltyko",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Planes para Academias de Gimnasia",
    description: "Planes por etapa y tamaño de academia.",
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
        name: "Starter",
        price: String(PRODUCT_PLAN_BY_CODE.free.priceEurCents / 100),
        priceCurrency: "EUR",
      },
      {
        "@type": "Offer",
        name: "Starter",
        price: String(PRODUCT_PLAN_BY_CODE.pro.priceEurCents / 100),
        priceCurrency: "EUR",
      },
      {
        "@type": "Offer",
        name: "Growth",
        price: String(PRODUCT_PLAN_BY_CODE.premium.priceEurCents / 100),
        priceCurrency: "EUR",
      },
      {
        "@type": "Offer",
        name: "Network",
        price: String(NETWORK_PLAN.priceEurCents / 100),
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
