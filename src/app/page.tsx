import type { Metadata } from "next";
import { Schema } from "@/components/Schema";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";

// Home «Magnesio sobre tapiz»
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import MatHero from "@/app/(site)/mat/MatHero";
import {
  AfternoonBoard,
  BeforeAfter,
  CountryMatrix,
  MatClose,
  MatFaq,
  ModuleRegister,
  PlansLine,
} from "@/app/(site)/mat/HomeSections";
import { HOME_FAQS } from "@/app/(site)/mat/faq-data";
import LatestGuides from "@/app/(site)/mat/LatestGuides";
import { SkipLink } from "@/components/ui/skip-link";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Zaltyko – Software de Gestión para Academias de Gimnasia",
  description:
    "Dirige tu academia de gimnasia artística o rítmica con grupos, cobros, horarios, familias y progreso técnico en orden.",
  keywords: [
    "software para academias de gimnasia",
    "gestión de gimnasios de gimnasia",
    "software de gimnasia artística",
    "gestión de gimnastas",
    "gestión de clases y horarios",
    "inscripciones a competiciones",
    "software gimnasia rítmica",
    "gimnasia artística femenina",
    "gimnasia artística masculina",
    "academias de gimnasia rítmica",
  ],
  alternates: {
    canonical: baseUrl,
  },
  openGraph: {
    title: "Zaltyko – Software de Gestión para Academias de Gimnasia",
    description:
      "Dirige tu academia de gimnasia artística o rítmica con grupos, cobros, horarios, familias y progreso técnico en orden.",
    url: baseUrl,
    siteName: "Zaltyko",
    type: "website",
    locale: "es_ES",
    images: [
      {
        url: `${baseUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Zaltyko - Software para academias de gimnasia",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Zaltyko – Software de Gestión para Academias de Gimnasia",
    description:
      "Dirige tu academia de gimnasia artística o rítmica con grupos, cobros, horarios, familias y progreso técnico en orden.",
    images: [`${baseUrl}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  authors: [{ name: "Zaltyko" }],
  creator: "Zaltyko",
  publisher: "Zaltyko",
};

export default function HomePage() {
  return (
    <>
      <SkipLink href="#main-content">Saltar al contenido principal</SkipLink>
      <Navbar />

      <main id="main-content">
        <MatHero />
        <AfternoonBoard />
        <ModuleRegister />
        <BeforeAfter />
        <PlansLine />
        <MatFaq />
        {/* SEO: guías por país y modalidad, y las últimas del blog. */}
        <CountryMatrix />
        <LatestGuides />
        <MatClose />
      </main>

      <Footer />

      {/* Schema.org structured data */}
      <Schema
        json={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Zaltyko",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description:
            "Software especializado para la dirección de academias de gimnasia artística femenina, artística masculina y rítmica. Gestiona gimnastas, grupos, horarios, cobros, competiciones y comunicación con familias.",
          url: baseUrl,
          offers: {
            "@type": "Offer",
            price: String(PRODUCT_PLAN_BY_CODE.pro.priceEurCents / 100),
            priceCurrency: "EUR",
            description: "Plan Starter para academias pequeñas de gimnasia artística o rítmica",
          },
          author: {
            "@type": "Organization",
            name: "Zaltyko",
            url: baseUrl,
          },
        }}
      />
      
      {/* Organization Schema — @id estable para que las cluster pages y
          breadcrumbs puedan referenciarlo sin duplicar el nodo. areaServed y
          knowsAbout refuerzan E-E-A-T sin inventar claims verificables. */}
      <Schema
        json={{
          "@context": "https://schema.org",
          "@type": "Organization",
          "@id": `${baseUrl}/#organization`,
          name: "Zaltyko",
          url: baseUrl,
          logo: {
            "@type": "ImageObject",
            url: `${baseUrl}/branding/zaltyko/logo-zaltyko-dark.svg`,
          },
          description:
            "Zaltyko es el sistema de dirección para academias de gimnasia artística femenina, artística masculina y rítmica.",
          contactPoint: {
            "@type": "ContactPoint",
            email: "hola@zaltyko.com",
            contactType: "customer service",
            availableLanguage: ["Spanish", "English"],
          },
          address: {
            "@type": "PostalAddress",
            addressCountry: "ES",
          },
          areaServed: [
            { "@type": "Country", name: "España" },
            { "@type": "Country", name: "México" },
            { "@type": "Country", name: "Argentina" },
            { "@type": "Country", name: "Colombia" },
            { "@type": "Country", name: "Chile" },
            { "@type": "Country", name: "Perú" },
          ],
          knowsAbout: [
            "Gimnasia artística femenina",
            "Gimnasia artística masculina",
            "Gimnasia rítmica",
            "Gestión deportiva",
            "Gestión de cuotas y pagos",
            "Gestión de academias",
          ],
        }}
      />
      
      {/* FAQ Schema for SEO */}
      <Schema
        json={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: HOME_FAQS.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
          })),
        }}
      />
    </>
  );
}
