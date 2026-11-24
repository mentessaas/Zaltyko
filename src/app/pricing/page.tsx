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
    "Compara Gratis y Club para tu academia de gimnasia artística o rítmica. Prueba Club durante 30 días sin tarjeta.",
  alternates: {
    canonical: `${baseUrl}/pricing`,
  },
  openGraph: {
    title: "Precios",
    description:
      "Compara Gratis y Club para academias de gimnasia artística y rítmica. Prueba Club 30 días sin tarjeta.",
    url: `${baseUrl}/pricing`,
    siteName: "Zaltyko",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Planes para Academias de Gimnasia",
    description:
      "Planes Zaltyko por etapa y tamaño de academia: Gratis y Club.",
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
        name: "Gratis",
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
        name: "Club",
        price: String(quoteSpanishVat(PRODUCT_PLAN_BY_CODE.club.priceEurCents).totalCents / 100),
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
