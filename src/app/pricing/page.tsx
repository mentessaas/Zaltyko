import type { Metadata } from "next";

import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import PricingSection from "@/app/(site)/pricing";
import { isSaasCheckoutEnabled } from "@/lib/launch/commercial-launch-profile";
import { Schema } from "@/components/Schema";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";
import { quoteSpanishVat } from "@/modules/saas-billing/domain/spanish-vat";
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
  description: "Software para gestión de academias de gimnasia. Precios finales con IVA (21 %) para España peninsular y Baleares.",
  offerCatalog: {
    "@type": "OfferCatalog",
    name: "Planes disponibles",
    itemListElement: [
      {
        "@type": "Offer",
        name: "Free",
        price: String(PRODUCT_PLAN_BY_CODE.free.priceEurCents / 100),
        priceCurrency: "EUR",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          priceCurrency: "EUR",
          valueAddedTaxIncluded: true,
        },
      },
      {
        "@type": "Offer",
        name: "Starter",
        price: String(quoteSpanishVat(PRODUCT_PLAN_BY_CODE.pro.priceEurCents).totalCents / 100),
        priceCurrency: "EUR",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          priceCurrency: "EUR",
          valueAddedTaxIncluded: true,
        },
      },
      {
        "@type": "Offer",
        name: "Growth",
        price: String(quoteSpanishVat(PRODUCT_PLAN_BY_CODE.premium.priceEurCents).totalCents / 100),
        priceCurrency: "EUR",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          priceCurrency: "EUR",
          valueAddedTaxIncluded: true,
        },
      },
      {
        "@type": "Offer",
        name: "Network",
        price: String(quoteSpanishVat(PRODUCT_PLAN_BY_CODE.network.priceEurCents).totalCents / 100),
        priceCurrency: "EUR",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          priceCurrency: "EUR",
          valueAddedTaxIncluded: true,
        },
      },
    ],
  },
};

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-16">
        <PricingSection paidCheckoutOpen={isSaasCheckoutEnabled("live")} />
      </main>
      <Footer />
      <Schema json={pricingSchema} />
    </div>
  );
}
