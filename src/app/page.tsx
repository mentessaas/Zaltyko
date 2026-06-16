import type { Metadata } from "next";
import { Schema } from "@/components/Schema";

// Componentes de la Home
import NavbarHome from "@/app/(site)/home/Navbar";
import HeroSection from "@/app/(site)/home/HeroSection";
import SocialProofSection from "@/app/(site)/home/SocialProofSection";
import WhyZaltykoSection from "@/app/(site)/home/WhyZaltykoSection";
import ModulesSection from "@/app/(site)/home/ModulesSection";
import ClusterDiscoverySection from "@/app/(site)/home/ClusterDiscoverySection";
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
        url: `${baseUrl}/og-image.svg`,
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

        {/* Clusters SEO - países y modalidades */}
        <ClusterDiscoverySection />

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
            "Software especializado para la dirección de academias de gimnasia artística femenina, artística masculina y rítmica. Gestiona gimnastas, grupos, horarios, cobros, competiciones y comunicación con familias.",
          url: baseUrl,
          offers: {
            "@type": "Offer",
            price: "49",
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
          geo: {
            "@type": "GeoCoordinates",
            addressCountry: "ES",
          },
          priceRange: "€€",
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
              name: "¿Para qué modalidades sirve Zaltyko?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Zaltyko está enfocado en gimnasia artística femenina, gimnasia artística masculina y gimnasia rítmica. Las academias mixtas pueden trabajar artística y rítmica desde una misma cuenta.",
              },
            },
            {
              "@type": "Question",
              name: "¿Cuánto tiempo tarda en configurarse?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "La puesta en marcha guiada permite importar gimnastas, configurar grupos, horarios y cobros, y dejar el flujo de trabajo listo para dirección y entrenadores.",
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
                text: "Sí. Zaltyko permite importar gimnastas, grupos y datos históricos desde archivos Excel o CSV.",
              },
            },
            {
              "@type": "Question",
              name: "¿Qué plan necesito para mi academia?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Depende del tamaño, número de grupos, sedes y necesidades de cobro. Por eso recomendamos una demo antes de elegir Starter, Growth o Network.",
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

      {/* HowTo Schema for SEO */}
      <Schema
        json={{
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "Cómo gestionar una academia de gimnasia",
          description:
            "Guía paso a paso para gestionar eficientemente una academia de gimnasia artística o rítmica: desde la inscripción de gimnastas hasta el seguimiento técnico.",
          step: [
            {
              "@type": "HowToStep",
              name: "Configurar tu academia",
              text: "Configura los datos de tu academia y selecciona artística femenina, artística masculina, rítmica o mixta artística/rítmica.",
            },
            {
              "@type": "HowToStep",
              name: "Importar gimnastas",
              text: "Importa tus gimnastas desde Excel o añádelas manualmente. Incluye datos personales, categoría, nivel y fecha de nacimiento.",
            },
            {
              "@type": "HowToStep",
              name: "Programar clases y horarios",
              text: "Configura tus clases con días, horarios y profesores asignados. Controla el aforo máximo y gestiona waiting lists automáticamente cuando una clase está completa.",
            },
            {
              "@type": "HowToStep",
              name: "Gestionar cobros",
              text: "Configura cuotas mensuales, trimestrales o anuales, controla pagos pendientes y gestiona descuentos, becas y morosidad desde un solo panel.",
            },
            {
              "@type": "HowToStep",
              name: "Inscribir a competiciones",
              text: "Gestiona las inscripciones de tus gimnastas a competiciones. Zaltyko filtra por categoría y edad, genera listas de inscripción y comunica a las familias.",
            },
            {
              "@type": "HowToStep",
              name: "Renovar licencias",
              text: "Recibe alertas cuando una licencia federativa está próxima a caducar. Genera los documentos necesarios para la renovación y lleva un registro histórico de todas las licencias.",
            },
          ],
        }}
      />
    </>
  );
}
