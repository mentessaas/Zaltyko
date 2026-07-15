import type { Metadata } from "next";
import { Schema } from "@/components/Schema";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";

// Componentes de la Home
import Navbar from "@/app/(site)/Navbar";
import HeroSection from "@/app/(site)/home/HeroSection";
import SocialProofSection from "@/app/(site)/home/SocialProofSection";
import ModulesSection from "@/app/(site)/home/ModulesSection";
import ClusterDiscoverySection from "@/app/(site)/home/ClusterDiscoverySection";
import ComparisonSection from "@/app/(site)/home/ComparisonSection";
import SeoExtendedSection from "@/app/(site)/home/SeoExtendedSection";
import FaqSection from "@/app/(site)/home/FaqSection";
import FinalCtaSection from "@/app/(site)/home/FinalCtaSection";
import Footer from "@/app/(site)/Footer";
import StickyCtaBar from "@/app/(site)/home/StickyCtaBar";
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
      <Navbar />

      <main>
        {/* Hero con H1 principal */}
        <HeroSection />

        {/* Social proof - logos y estadísticas */}
        <SocialProofSection />

        {/* Comparativa vs Excel y alternativas */}
        <ComparisonSection />

        {/* Módulos principales - cada uno con descripción SEO */}
        <ModulesSection />

        {/* Clusters SEO - países y modalidades */}
        <ClusterDiscoverySection />

        {/* Sección SEO extendida - 300-400 palabras */}
        <SeoExtendedSection />

        {/* FAQ con preguntas de negocio */}
        <FaqSection />

        {/* CTA Final */}
        <FinalCtaSection />
      </main>

      <Footer />

      {/* CTA Sticky en scroll */}
      <StickyCtaBar />
      
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
      
      {/* Organization Schema */}
      <Schema
        json={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Zaltyko",
          url: baseUrl,
          logo: `${baseUrl}/branding/zaltyko/logo-zaltyko-dark.svg`,
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
        }}
      />
      
      {/* FAQ Schema for SEO */}
      <Schema
        json={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "¿Para qué modalidades sirve Zaltyko?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Zaltyko está enfocado en gimnasia artística femenina, gimnasia artística masculina y gimnasia rítmica. Si tu academia trabaja artística y rítmica, puedes configurarla como mixta.",
              },
            },
            {
              "@type": "Question",
              name: "¿Cuánto tiempo tarda en configurarse?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "La puesta en marcha es guiada y se adapta al volumen de datos y al equipo. Empezamos por academia, gimnastas, grupos, horarios y cobros sin prometer una duración cerrada antes de revisar el caso.",
              },
            },
            {
              "@type": "Question",
              name: "¿Sirve si ahora trabajo con Excel o WhatsApp?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sí. Zaltyko está pensado para pasar de hojas dispersas y mensajes sueltos a un sistema ordenado para dirección, entrenadores y familias.",
              },
            },
            {
              "@type": "Question",
              name: "¿Puedo migrar mis datos desde Excel o Google Sheets?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Zaltyko permite importar gimnastas desde Excel o CSV. Para otros datos o migraciones amplias, revisamos el formato y planteamos una puesta en marcha guiada.",
              },
            },
            {
              "@type": "Question",
              name: "¿Cumple con la normativa de protección de datos de menores?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sí. Zaltyko aísla los datos por academia, registra consentimientos firmados por las familias y aplica controles de acceso por rol según la normativa española de protección de datos de menores. Si quieres, te enviamos el resumen técnico antes de empezar.",
              },
            },
            {
              "@type": "Question",
              name: "¿Qué plan necesito para mi academia?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Depende del tamaño, número de grupos, sedes y necesidades de cobro. Por eso priorizamos una demo corta antes de recomendar Starter, Growth o Network.",
              },
            },
            {
              "@type": "Question",
              name: "¿Puedo cancelar en cualquier momento?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sí. No hay permanencia ni penalizaciones. Cancela cuando quieras desde tu panel de cuenta. Si cancelas el plan de pago, volverás automáticamente al plan gratuito.",
              },
            },
            {
              "@type": "Question",
              name: "¿Funciona en móvil?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sí. Zaltyko es una aplicación web responsive y el flujo de clase del coach está verificado en móvil. El pase de lista está optimizado para pista: se registra la asistencia en un toque desde \"Pasar lista hoy\".",
              },
            },
          ],
        }}
      />
    </>
  );
}
