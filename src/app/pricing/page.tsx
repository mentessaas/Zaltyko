import type { Metadata } from "next";

import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import PricingSection from "@/app/(site)/pricing";
import { Schema } from "@/components/Schema";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Planes y Precios para Academias de Gimnasia",
  description:
    "Compara los planes Free, Starter, Growth y Network para tu academia de gimnasia artística o rítmica. Prueba 7 días Starter sin tarjeta y sin compromiso.",
  alternates: {
    canonical: `${baseUrl}/pricing`,
  },
  openGraph: {
    title: "Precios",
    description:
      "Compara planes Free, Starter, Growth y Network para academias de gimnasia artística y rítmica. 7 días Starter sin tarjeta.",
    url: `${baseUrl}/pricing`,
    siteName: "Zaltyko",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Planes para Academias de Gimnasia",
    description:
      "Planes Zaltyko por etapa y tamaño de academia. Free, Starter, Growth y Network.",
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
        price: String(PRODUCT_PLAN_BY_CODE.network.priceEurCents / 100),
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
