import type { Metadata } from "next";
import { Schema } from "@/components/Schema";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";

// Componentes de la Home (marketing landing)
import Navbar from "@/app/(site)/Navbar";
import HeroSection from "@/app/(site)/home/HeroSection";
import SocialProofSection from "@/app/(site)/home/SocialProofSection";
import ModulesSection from "@/app/(site)/home/ModulesSection";
import ClusterDiscoverySection from "@/app/(site)/home/ClusterDiscoverySection";
import ComparisonSection from "@/app/(site)/home/ComparisonSection";
import LatestArticlesSection from "@/app/(site)/home/LatestArticlesSection";
import SeoExtendedSection from "@/app/(site)/home/SeoExtendedSection";
import FaqSection from "@/app/(site)/home/FaqSection";
import FinalCtaSection from "@/app/(site)/home/FinalCtaSection";
import Footer from "@/app/(site)/Footer";
import StickyCtaBar from "@/app/(site)/home/StickyCtaBar";
import { SkipLink } from "@/components/ui/skip-link";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Zaltyko — Tu academia de gimnasia, en ritmo",
  description:
    "Ordena cuotas, grupos, asistencia y comunicación con familias en un sistema pensado para academias de gimnasia artística y rítmica.",
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
    title: "Zaltyko — Tu academia de gimnasia, en ritmo",
    description:
      "Cuotas, grupos, asistencia y comunicación con familias en un sistema pensado para gimnasia artística y rítmica.",
    url: baseUrl,
    siteName: "Zaltyko",
    type: "website",
    locale: "es_ES",
    images: [
      {
        url: `${baseUrl}/branding/zaltyko/photos/academia-editorial-01.png`,
        width: 1536,
        height: 1024,
        alt: "Entrenadora adulta en una sala de gimnasia, imagen editorial de Zaltyko",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Zaltyko — Tu academia de gimnasia, en ritmo",
    description:
      "Cuotas, grupos, asistencia y comunicación con familias en un sistema pensado para gimnasia artística y rítmica.",
    images: [`${baseUrl}/branding/zaltyko/photos/academia-editorial-01.png`],
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
        {/* Hero con H1 principal */}
        <HeroSection />

        {/* Dolor, solución y resultado para la dirección */}
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

        {/* Últimos artículos del blog */}
        <LatestArticlesSection />

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
            "Sistema para ayudar a la dirección de academias de gimnasia artística y rítmica a organizar gimnastas, grupos, horarios, cobros, asistencia y comunicación con familias.",
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
            "Zaltyko ayuda a la dirección de academias de gimnasia artística y rítmica a organizar la operación diaria.",
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
            "Cobros recurrentes",
            "Gestión de academias",
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
                text: "Zaltyko está enfocado en gimnasia artística femenina, gimnasia artística masculina y gimnasia rítmica. Si tu academia trabaja artística y rítmica, puedes configurarla como mixta.",
              },
            },
            {
              "@type": "Question",
              name: "¿Cuánto cuesta Zaltyko?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Free es gratis hasta 30 gimnastas y 1 academia. Starter cuesta 19€/mes (hasta 75 gimnastas), Growth 49€/mes (hasta 200 gimnastas) y Network parte de 99€/mes para academias multi-sede, con onboarding acompañado y propuesta final según sedes y necesidades. Puedes ver el detalle completo en la página de planes.",
              },
            },
            {
              "@type": "Question",
              name: "¿Cuánto tiempo tarda en configurarse?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Puedes crear tu cuenta y configurar la academia paso a paso. El tiempo depende de los datos y de cómo estén organizados; las migraciones amplias se revisan aparte.",
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
                text: "Zaltyko aísla los datos por academia y aplica controles de acceso por rol y relación autorizada. La gestión de consentimientos y las obligaciones legales de tu academia deben revisarse conforme a la política de privacidad y al asesoramiento aplicable.",
              },
            },
            {
              "@type": "Question",
              name: "¿Qué plan necesito para mi academia?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Compara los límites de gimnastas y funciones de Free, Starter y Growth en la página de precios y empieza creando tu cuenta. Para varias sedes o migraciones amplias, puedes hablar con el equipo.",
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
