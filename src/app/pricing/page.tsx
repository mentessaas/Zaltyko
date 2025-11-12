import type { Metadata } from "next";

import PricingSection from "@/app/(site)/pricing";
import { Schema } from "@/components/Schema";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Precios | Plataforma multi-academia de gimnasia",
  description: "Planes Free, Pro y Premium diseñados para escalar tu academia de gimnasia.",
  alternates: {
    canonical: `${baseUrl}/pricing`,
  },
  openGraph: {
    title: "Precios | SaaS para academias de gimnasia",
    description: "Compara planes Free, Pro y Premium y crece sin límites.",
    url: `${baseUrl}/pricing`,
    siteName: "Zaltyko",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Planes para academias de gimnasia",
    description: "Cambia de plan cuando lo necesites. Free, Pro y Premium.",
  },
};

const pricingSchema = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Planes Zaltyko",
  description: "Software para gestión multi-academia de gimnasia",
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
    <div className="bg-[#212121]">
      <PricingSection />
      <Schema json={pricingSchema} />
    </div>
  );
}
