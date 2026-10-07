import type { Metadata } from "next";

import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import PricingSection from "@/app/(site)/pricing";
import { Schema } from "@/components/Schema";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Planes para ordenar tu academia de gimnasia",
  description:
    "Compara precios, límites y funciones de Zaltyko para academias de gimnasia artística o rítmica. Empieza con Free hasta 30 gimnastas.",
  alternates: {
    canonical: `${baseUrl}/pricing`,
  },
  openGraph: {
    title: "Planes de Zaltyko para tu academia",
    description:
      "Compara precios, límites y funciones para ordenar grupos, asistencia, cuotas y comunicación con familias.",
    url: `${baseUrl}/pricing`,
    siteName: "Zaltyko",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Planes para academias de gimnasia",
    description:
      "Precios y funciones de Zaltyko para gimnasia artística y rítmica.",
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
      <main className="flex-1 pt-20">
        <PricingSection />
      </main>
      <Footer />
      <Schema json={pricingSchema} />
    </div>
  );
}
