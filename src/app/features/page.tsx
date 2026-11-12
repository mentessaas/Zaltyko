import type { Metadata } from "next";
import Link from "next/link";

import FeaturesSection from "@/app/(site)/FeaturesSection";
import {
  PublicPageClose,
  PublicPageHeader,
  PublicPageShell,
  tapeButtonClass,
  tapeOutlineButtonClass,
} from "@/app/(site)/mat/PublicPage";
import { Schema } from "@/components/Schema";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Funcionalidades para academias de gimnasia",
  description:
    "Gestión de gimnastas, grupos, cuotas manuales, asistencia y familias para academias de gimnasia artística y rítmica.",
  alternates: {
    canonical: `${baseUrl}/features`,
  },
  openGraph: {
    title: "Funcionalidades de Zaltyko | Software para gimnasia",
    description: "Gestión de gimnastas, grupos, cuotas manuales, asistencia y familias para academias de gimnasia artística y rítmica.",
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
    description: "Plan Free: hasta 30 gimnastas, 3 grupos y 10 clases activas",
  },
};

export default function FeaturesPage() {
  return (
    <PublicPageShell structuredData={<Schema json={featureSchema} />}>
      <PublicPageHeader
        titleId="features-title"
        label="Funcionalidades"
        title="Funcionalidades para tu academia de gimnasia"
        lede="Gimnastas, familias, grupos, clases, asistencia y cuotas manuales para gimnasia artística y rítmica."
      />
      <FeaturesSection />

      <PublicPageClose
        titleId="features-close-title"
        title="Prueba Zaltyko con tu academia"
        text="Crea tu cuenta gratis, configura tu academia y añade tus gimnastas, grupos y clases."
        actions={
          <>
            <Link href="/auth/register?role=owner" className={tapeButtonClass}>
              Crear academia gratis
            </Link>
            <Link href="/pricing" className={tapeOutlineButtonClass}>
              Ver planes y precios
            </Link>
          </>
        }
        note="7 días de Starter sin tarjeta · Sin permanencia"
      />
    </PublicPageShell>
  );
}
