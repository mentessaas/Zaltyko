import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { MessageCircle, Mail, ChevronRight } from "lucide-react";
import { helpCategories } from "@/lib/help/articles";
import Reveal from "@/components/motion/Reveal";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Ayuda para dirigir tu academia de gimnasia",
  description:
    "Guías de Zaltyko para organizar gimnastas, grupos, horarios, asistencia, cuotas y comunicación con familias.",
  alternates: {
    canonical: `${baseUrl}/ayuda`,
  },
  openGraph: {
    title: "Ayuda para tu academia de gimnasia",
    description:
      "Respuestas prácticas sobre fichas, clases, asistencia, cuotas y familias.",
    url: `${baseUrl}/ayuda`,
    type: "website",
  },
};

const faqs = [
  {
    question: "¿Cómo doy de alta a una gimnasta?",
    answer: "Desde el área de gimnastas de tu academia, crea una ficha y añade la información que necesitas para organizar su actividad.",
  },
  {
    question: "¿Puedo importar gimnastas desde Excel?",
    answer: "Sí. Puedes importar gimnastas desde Excel o CSV y revisar los datos antes de guardarlos.",
  },
  {
    question: "¿Cómo funciona el control de asistencia?",
    answer: "Puedes registrar la asistencia desde la clase, sesión por sesión. El flujo de entrenamiento también permite pasar lista desde el móvil.",
  },
  {
    question: "¿Cómo comparto información con las familias?",
    answer: "Zaltyko incluye comunicación interna y avisos. El portal familiar tiene alcance limitado y muestra horarios, cuotas y progreso que la academia haya publicado.",
  },
  {
    question: "¿Qué métodos de pago acepta Zaltyko?",
    answer: "Las opciones dependen de la configuración de cobros de la academia. También puedes consultar y registrar pagos desde el área de facturación.",
  },
  {
    question: "¿Cómo puedo cambiar de plan?",
    answer: "Desde el panel de Cobros de tu academia puedes cambiar de plan; Stripe gestiona el ajuste de la facturación.",
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
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-zaltyko-primary/5 to-transparent">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-4">
              Para el día a día de tu academia
            </span>
            <h1 className="font-display text-4xl font-bold tracking-tight text-zaltyko-text-main sm:text-5xl">
              Encuentra el siguiente paso para tu academia
            </h1>
            <p className="mt-6 mx-auto max-w-2xl text-lg text-zaltyko-text-secondary">
              Guías sobre gimnastas, grupos, asistencia, cuotas y comunicación con familias. Si no encuentras lo que buscas, escríbenos por email.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-zaltyko-text-main mb-8">Explorar por categoría</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {helpCategories.map((category, index) => {
              const Icon = category.icon;
              return (
                <Reveal key={index} delay={index * 80}>
                  <div className="card-hover h-full rounded-xl border border-border p-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zaltyko-primary/10 mb-4">
                      <Icon className="h-5 w-5 text-zaltyko-primary" />
                    </div>
                    <h3 className="font-semibold text-zaltyko-text-main">{category.title}</h3>
                    <p className="mt-1 text-sm text-zaltyko-text-secondary">{category.description}</p>
                    <ul className="mt-4 space-y-2">
                      {category.articles.map((article) => (
                        <li key={article.slug}>
                          <Link href={`/help/${article.slug}`} className="text-sm text-zaltyko-primary hover:underline flex items-center">
                            <ChevronRight className="h-3 w-3 mr-1" />
                            {article.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16 surface-subtle">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-zaltyko-text-main text-center mb-8">
            Preguntas frecuentes
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="rounded-lg bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-zaltyko-text-main">{faq.question}</h3>
                <p className="mt-2 text-zaltyko-text-secondary">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-zaltyko-text-main">¿No encontraste lo que buscabas?</h2>
          <p className="mt-4 text-zaltyko-text-secondary">
            Nuestro equipo de soporte está disponible para ayudarte.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center rounded-full bg-zaltyko-primary px-8 py-3 font-semibold text-white hover:bg-zaltyko-primary-dark"
            >
              <MessageCircle className="mr-2 h-5 w-5" />
              Contactar soporte
            </Link>
            <a
              href="mailto:hola@zaltyko.com"
              className="inline-flex items-center rounded-full border-2 border-zaltyko-primary px-8 py-3 font-semibold text-zaltyko-primary hover:bg-zaltyko-primary/10"
            >
              <Mail className="mr-2 h-5 w-5" />
              hola@zaltyko.com
            </a>
          </div>
        </div>
      </section>

      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </div>
  );
}
