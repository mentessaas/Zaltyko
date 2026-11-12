import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Mail, ChevronRight } from "lucide-react";

import {
  PublicFaqList,
  PublicPageClose,
  PublicPageHeader,
  PublicPageShell,
  publicContainerClass,
  tapeButtonClass,
  tapeOutlineButtonClass,
} from "@/app/(site)/mat/PublicPage";
import { helpCategories } from "@/lib/help/articles";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { cn } from "@/lib/utils";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Centro de Ayuda para Academias de Gimnasia",
  description:
    "Encuentra respuestas a tus preguntas sobre Zaltyko. Guías, tutoriales y documentación para administrar tu academia de gimnasia.",
  alternates: {
    canonical: `${baseUrl}/ayuda`,
  },
  openGraph: {
    title: "Centro de Ayuda para Academias de Gimnasia",
    description:
      "Encuentra respuestas sobre gimnastas, cobros, clases y gestión de tu academia.",
    url: `${baseUrl}/ayuda`,
    type: "website",
  },
};

const faqs = [
  {
    question: "¿Cómo doy de alta a una gimnasta?",
    answer: "Desde Gimnastas, completa «Alta de gimnasta» con sus datos. Después puedes vincular a su familia y a las personas responsables desde su ficha.",
  },
  {
    question: "¿Cómo se pasa lista?",
    answer: "Desde Hoy en el club o desde Asistencia eliges la sesión y marcas la asistencia de cada gimnasta.",
  },
  {
    question: "¿Puedo cobrar automáticamente las cuotas a las familias?",
    answer: "No en este lanzamiento. Puedes registrar manualmente los pagos que reciba la academia y consultar qué importes siguen pendientes.",
  },
  {
    question: "¿Cómo puedo cambiar de plan?",
    answer: "Desde Plan puedes consultar los planes disponibles para tu academia y abrir el Portal de Stripe. Las cuotas familiares se gestionan aparte.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export default function HelpPage() {
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
        titleId="help-title"
        title="Centro de ayuda de Zaltyko para tu academia"
        lede="Guías rápidas sobre gimnastas, cuotas manuales, clases y asistencia. Si no encuentras tu respuesta, puedes contactar por email."
      />

      {/* Categorías: una lista reglada, como los módulos de la portada; cada
          fila nombra la categoría y lista sus guías. */}
      <section aria-labelledby="help-categories-title" className="bg-white">
        <div className={cn(publicContainerClass, "grid gap-12 py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-24")}>
          <h2
            id="help-categories-title"
            className="font-display text-[clamp(2rem,4.5vw,3.5rem)] font-black uppercase leading-[0.95] text-mat-night lg:sticky lg:top-28 lg:self-start"
          >
            Explorar por categoría
          </h2>
          <ul className="border-t-[3px] border-mat-night">
            {helpCategories.map((category) => (
              <li
                key={category.title}
                className="grid gap-3 border-b border-chalk-line py-6 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-8"
              >
                <div>
                  <h3 className="font-display text-xl font-extrabold uppercase leading-tight text-mat">{category.title}</h3>
                  <p className="mt-1 text-sm text-ramp-600">{category.description}</p>
                </div>
                <ul>
                  {category.articles.map((article) => (
                    <li key={article.slug}>
                      <Link
                        href={`/help/${article.slug}`}
                        className="group flex min-h-11 items-center justify-between gap-3 py-1 font-semibold text-mat-night transition-colors hover:text-mat"
                      >
                        {article.title}
                        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-ramp-400 transition-colors group-hover:text-mat" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Preguntas: <details> nativo, como en la portada. */}
      <section aria-labelledby="help-faq-title" className="chalk-field border-y border-chalk-line">
        <div className={cn(publicContainerClass, "grid gap-10 py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-24")}>
          <h2
            id="help-faq-title"
            className="font-display text-[clamp(2rem,4.5vw,3.5rem)] font-black uppercase leading-[0.95] text-mat-night"
          >
            Preguntas frecuentes
          </h2>
          <PublicFaqList idPrefix="help-faq" items={faqs} />
        </div>
      </section>

      <PublicPageClose
        titleId="help-close-title"
        title="¿No encontraste lo que buscabas?"
        text="Describe tu consulta sin incluir contraseñas ni datos sensibles de menores."
        actions={
          <>
            <Link href="/contact" className={tapeButtonClass}>
              <MessageCircle aria-hidden />
              Contactar soporte
            </Link>
            <a href="mailto:hola@zaltyko.com" className={tapeOutlineButtonClass}>
              <Mail aria-hidden />
              hola@zaltyko.com
            </a>
          </>
        }
      />
    </PublicPageShell>
  );
}
