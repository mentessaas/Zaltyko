import { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
  PublicFaqList,
  PublicPageClose,
  PublicPageHeader,
  PublicPageShell,
  publicContainerClass,
  tapeButtonClass,
} from "@/app/(site)/mat/PublicPage";
import { ESSENTIAL_FAQS } from "@/lib/launch/essential-public-catalog";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { cn } from "@/lib/utils";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Preguntas frecuentes sobre software para academias de gimnasia",
  description:
    "Resolvemos las dudas más comunes sobre Zaltyko: precios, planes, acceso, cancelación y operativa diaria para tu academia de gimnasia.",
  alternates: {
    canonical: `${baseUrl}/faq`,
  },
  openGraph: {
    title: "Preguntas frecuentes sobre Zaltyko",
    description:
      "Precios, planes, acceso, cancelación y operativa diaria para tu academia de gimnasia.",
    url: `${baseUrl}/faq`,
    type: "website",
  },
};

const categories = [{
  title: "Uso y contratación",
  questions: ESSENTIAL_FAQS.map(({ question, answer }) => ({ q: question, a: answer })),
}];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: categories.flatMap((category) =>
    category.questions.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    }))
  ),
};

export default function FaqPage() {
  return (
    <PublicPageShell
      structuredData={
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      }
    >
      <PublicPageHeader
        titleId="faq-page-title"
        title="Preguntas Frecuentes"
        lede={
          <>
            Resolvemos las dudas más comunes. ¿No encuentras tu respuesta?{" "}
            <Link href="/contact" className="font-semibold text-white underline decoration-2 underline-offset-4 hover:decoration-[3px]">
              Contacta con nosotros
            </Link>
          </>
        }
      />

      {/* Categorías: titular a la izquierda y preguntas en lista reglada, como
          las preguntas de la portada. */}
      {categories.map((category, index) => (
        <section
          key={category.title}
          aria-labelledby={`faq-category-${index}`}
          className="chalk-field border-b border-chalk-line"
        >
          <div className={cn(publicContainerClass, "grid gap-10 py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-24")}>
            <h2
              id={`faq-category-${index}`}
              className="font-display text-[clamp(2rem,4.5vw,3.5rem)] font-black uppercase leading-[0.95] text-mat-night lg:sticky lg:top-28 lg:self-start"
            >
              {category.title}
            </h2>
            <PublicFaqList
              idPrefix={`faq-${index}`}
              items={category.questions.map((item) => ({ question: item.q, answer: item.a }))}
            />
          </div>
        </section>
      ))}

      <PublicPageClose
        titleId="faq-close-title"
        title="¿No encontraste lo que buscabas?"
        text="Estamos aquí para resolver cualquier duda que tengas sobre Zaltyko."
        actions={
          <Link href="/contact" className={tapeButtonClass}>
            Contactar
            <ArrowRight aria-hidden />
          </Link>
        }
      />
    </PublicPageShell>
  );
}
