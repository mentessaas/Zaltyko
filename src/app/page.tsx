import type { Metadata } from "next";
import { Schema } from "@/components/Schema";

// Componentes de la Home
import NavbarHome from "@/app/(site)/home/Navbar";
import HeroSection from "@/app/(site)/home/HeroSection";
import SocialProofSection from "@/app/(site)/home/SocialProofSection";
import WhyZaltykoSection from "@/app/(site)/home/WhyZaltykoSection";
import ModulesSection from "@/app/(site)/home/ModulesSection";
import SeoExtendedSection from "@/app/(site)/home/SeoExtendedSection";
import TestimonialsSection from "@/app/(site)/home/TestimonialsSection";
import IntegrationsSection from "@/app/(site)/home/IntegrationsSection";
import FinalCtaSection from "@/app/(site)/home/FinalCtaSection";
import FooterSection from "@/app/(site)/home/FooterSection";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://zaltyko.com";

export const metadata: Metadata = {
  title: "Zaltyko – El software definitivo para academias de gimnasia",
  description:
    "Software especializado para la gestión de academias de gimnasia artística, rítmica y acrobática. Gestiona atletas, clases, horarios, pagos, inscripciones a competiciones y comunicación con padres desde un solo panel. Prueba gratis el mejor software para clubes deportivos.",
  keywords: [
    "software para academias de gimnasia",
    "gestión de gimnasios de gimnasia",
    "software de gimnasia artística",
    "gestión de atletas",
    "gestión de clases y horarios",
    "inscripciones a competiciones",
    "software para clubes deportivos",
    "gestión de clubes deportivos",
    "software gimnasia rítmica",
    "software gimnasia acrobática",
    "digitalización de gimnasios",
    "gestión academias deportivas",
  ],
  alternates: {
    canonical: baseUrl,
  },
  openGraph: {
    title: "Zaltyko – El software definitivo para academias de gimnasia",
    description:
      "Gestiona atletas, clases, pagos, eventos y comunicación desde un solo panel diseñado exclusivamente para gimnasia artística, rítmica y acrobática.",
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
    title: "Zaltyko – El software definitivo para academias de gimnasia",
    description:
      "Gestiona atletas, clases, pagos, eventos y comunicación desde un solo panel diseñado exclusivamente para gimnasia artística, rítmica y acrobática.",
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
      <NavbarHome />
      
      <main>
        {/* Hero con H1 principal */}
        <HeroSection />
        
        {/* Social proof - logos y estadísticas */}
        <SocialProofSection />
        
        {/* Por qué Zaltyko - texto SEO extenso */}
        <WhyZaltykoSection />
        
        {/* Módulos principales - cada uno con descripción SEO */}
        <ModulesSection />
        
        {/* Sección SEO extendida - 300-400 palabras */}
        <SeoExtendedSection />
        
        {/* Testimonios */}
        <TestimonialsSection />
        
        {/* Integraciones */}
        <IntegrationsSection />
        
        {/* CTA Final */}
        <FinalCtaSection />
      </main>
      
      <FooterSection />
      
      {/* Schema.org structured data */}
      <Schema
        json={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Zaltyko",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description:
            "Software especializado para la gestión de academias de gimnasia artística, rítmica y acrobática. Gestiona atletas, clases, horarios, pagos, inscripciones a competiciones y comunicación con padres.",
          url: baseUrl,
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "EUR",
            description: "Plan gratuito disponible",
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.9",
            reviewCount: "127",
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
            "Zaltyko es el software definitivo para academias de gimnasia. Especializado en gimnasia artística, rítmica y acrobática.",
          contactPoint: {
            "@type": "ContactPoint",
            email: "hola@zaltyko.com",
            contactType: "customer service",
            availableLanguage: ["Spanish", "English"],
          },
          sameAs: [
            "https://twitter.com/zaltyko",
            "https://linkedin.com/company/zaltyko",
            "https://instagram.com/zaltyko",
          ],
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
              name: "¿Qué es Zaltyko?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Zaltyko es un software especializado para la gestión de academias de gimnasia artística, rítmica y acrobática. Permite gestionar atletas, clases, horarios, pagos, inscripciones a competiciones y comunicación con padres desde un solo panel.",
              },
            },
            {
              "@type": "Question",
              name: "¿Zaltyko es gratuito?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sí, Zaltyko ofrece un plan gratuito que permite gestionar hasta 30 atletas. Para academias más grandes, ofrecemos planes de pago con funcionalidades avanzadas y sin límite de atletas.",
              },
            },
            {
              "@type": "Question",
              name: "¿Qué diferencia a Zaltyko de otros software de gestión deportiva?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Zaltyko está diseñado específicamente para gimnasia artística, rítmica y acrobática. Incluye funcionalidades específicas como seguimiento de nivel por aparato, gestión de inscripciones a competiciones, y comunicación especializada con familias de atletas menores de edad.",
              },
            },
            {
              "@type": "Question",
              name: "¿Puedo migrar mis datos desde Excel?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sí, Zaltyko permite importar atletas, clases y datos históricos desde archivos Excel o CSV. Nuestro equipo de soporte te ayuda durante todo el proceso de migración.",
              },
            },
          ],
        }}
      />
    </>
  );
}
