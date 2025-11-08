import type { Metadata } from "next";

import FeaturesSection from "@/app/(site)/FeaturesSection";
import HeroSection from "@/app/(site)/Hero";
import { Schema } from "@/components/Schema";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Funciones | SaaS multi-academia de gimnasia",
  description:
    "Gestión multi-tenant, límites por plan, Stripe y PWA para academias de gimnasia modernas.",
  alternates: {
    canonical: `${baseUrl}/features`,
  },
  openGraph: {
    title: "Funciones clave de Gym SaaS",
    description: "Gestión multi-academia, facturación Stripe, dashboards y PWA.",
    url: `${baseUrl}/features`,
    siteName: "Gym SaaS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Funciones de Gym SaaS",
    description: "Todo lo que necesitas para administrar múltiples academias de gimnasia.",
  },
};

const featureSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Gym SaaS",
  applicationCategory: "BusinessApplication",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "EUR",
  },
};

export default function FeaturesPage() {
  return (
    <div className="bg-[#212121]">
      <HeroSection />
      <FeaturesSection />
      <Schema json={featureSchema} />
    </div>
  );
}
