import type { Metadata } from "next";
import { Schema } from "@/components/Schema";

// Componentes de la Home
import NavbarHome from "@/app/(site)/home/Navbar";
import HeroSection from "@/app/(site)/home/HeroSection";
import SocialProofSection from "@/app/(site)/home/SocialProofSection";
import WhyZaltykoSection from "@/app/(site)/home/WhyZaltykoSection";
import ModulesSection from "@/app/(site)/home/ModulesSection";
import ComparisonSection from "@/app/(site)/home/ComparisonSection";
import SeoExtendedSection from "@/app/(site)/home/SeoExtendedSection";
import TestimonialsSection from "@/app/(site)/home/TestimonialsSection";
import DemoSection from "@/app/(site)/home/DemoSection";
import FaqSection from "@/app/(site)/home/FaqSection";
import IntegrationsSection from "@/app/(site)/home/IntegrationsSection";
import FinalCtaSection from "@/app/(site)/home/FinalCtaSection";
import FooterSection from "@/app/(site)/home/FooterSection";
import StickyCtaBar from "@/app/(site)/home/StickyCtaBar";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://zaltyko.com";

export const metadata: Metadata = {
  title: "Zaltyko – Gestión Automática para Academias de Gimnasia | 15h menos/semana",
  description:
    "Gestiona atletas, cobros y horarios en 1 plataforma. 15h menos de admin. Prueba gratis 14 días. Sin tarjeta de crédito.",
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
    title: "Zaltyko – Gestión Automática para Academias de Gimnasia",
    description:
      "Recupera 15 horas semanales. Gestiona atletas, cobros y horarios en 1 plataforma. Prueba gratis 14 días sin compromiso.",
    url: baseUrl,
    siteName: "Zaltyko",
    type: "website",
    locale: "es_ES",
    images: [
      {
        url: `${baseUrl}/og-image.svg`,
        width: 1200,
        height: 630,
        alt: "Zaltyko - Software para academias de gimnasia",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Zaltyko – Gestión Automática para Academias de Gimnasia",
    description:
      "Recupera 15 horas semanales. Gestiona atletas, cobros y horarios en 1 plataforma. Prueba gratis 14 días.",
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

        {/* Comparativa vs Excel y alternativas */}
        <ComparisonSection />

        {/* Por qué Zaltyko - texto SEO extenso */}
        <WhyZaltykoSection />

        {/* Módulos principales - cada uno con descripción SEO */}
        <ModulesSection />

        {/* Demo con video */}
        <DemoSection />

        {/* Sección SEO extendida - 300-400 palabras */}
        <SeoExtendedSection />

        {/* Testimonios */}
        <TestimonialsSection />

        {/* FAQ con preguntas de negocio */}
        <FaqSection />

        {/* Integraciones */}
        <IntegrationsSection />

        {/* CTA Final */}
        <FinalCtaSection />
      </main>

      <FooterSection />

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
            "Software especializado para la gestión de academias de gimnasia artística, rítmica y acrobática. Gestiona atletas, clases, horarios, pagos, inscripciones a competiciones y comunicación con padres.",
          url: baseUrl,
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "EUR",
            description: "Plan gratuito disponible hasta 50 atletas",
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
              name: "¿Puedo probarlo sin dar datos de pago?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sí. Puedes crear tu cuenta gratis y usar Zaltyko hasta 50 atletas sin introducir ningún dato de pago. El trial de 14 días te da acceso completo al plan Pro para que pruebes todo sin compromiso.",
              },
            },
            {
              "@type": "Question",
              name: "¿Cuánto tiempo tarda en configurarse?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "La mayoría de academias están operativas en menos de 2 horas. Importas tus atletas desde Excel o manualmente, configuras tus clases y horarios, y listo. Soporte incluido.",
              },
            },
            {
              "@type": "Question",
              name: "¿Mis datos están aislados de otras academias?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sí. Cada academia tiene sus datos completamente aislados. Usamos Row Level Security a nivel de base de datos. Cumplimos con el RGPD.",
              },
            },
            {
              "@type": "Question",
              name: "¿Puedo migrar mis datos desde Excel o Google Sheets?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sí. Zaltyko permite importar atletas, grupos y datos históricos desde archivos Excel o CSV. Si tienes un archivo con tus atletas, en minutos los tendrás dentro de la plataforma.",
              },
            },
            {
              "@type": "Question",
              name: "¿Qué pasa si tengo más de 50 atletas?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "El plan Free cubre hasta 50 atletas. Cuando llegues al límite, el plan Pro (19€/mes) soporta hasta 200 atletas. Haz el upgrade desde tu panel en cualquier momento.",
              },
            },
            {
              "@type": "Question",
              name: "¿Puedo cancelar en cualquier momento?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sí. No hay permanencia ni penalizaciones. Cancela cuando quieras desde tu panel de cuenta. Si cancelas el plan de pago, vuelves automáticamente al plan gratuito.",
              },
            },
            {
              "@type": "Question",
              name: "¿Qué pasa con mis datos si cancelo?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Tus datos se mantienen disponibles durante 30 días después de cancelar. Puedes exportar toda tu información en cualquier momento. Pasados los 30 días se eliminan según nuestra política de retención.",
              },
            },
            {
              "@type": "Question",
              name: "¿Funciona en móvil para los coaches?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sí. Zaltyko es una aplicación web responsive que funciona en móvil, tablet y escritorio. Los coaches pueden marcar asistencia desde su teléfono sin instalar nada.",
              },
            },
          ],
        }}
      />
    </>
  );
}
