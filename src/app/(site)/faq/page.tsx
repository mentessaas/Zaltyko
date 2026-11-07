import { Metadata } from "next";
import Link from "next/link";
import { HelpCircle, CreditCard, ArrowRight } from "lucide-react";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { ESSENTIAL_FAQS } from "@/lib/launch/essential-public-catalog";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

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
  icon: CreditCard,
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
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 pt-20">
        {/* Hero */}
        <section className="py-20 bg-gradient-to-b from-blue-50 to-white">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
            <span className="font-display text-xs uppercase tracking-[0.35em] text-zaltyko-accent">
              FAQ
            </span>
            <h1 className="mt-4 font-display text-4xl sm:text-5xl font-semibold text-foreground">
              Preguntas Frecuentes
            </h1>
            <p className="mt-4 text-xl text-muted-foreground">
              Resolvemos las dudas más comunes. ¿No encuentras tu respuesta?{" "}
              <Link href="/contact" className="text-zaltyko-accent hover:underline">
                Contacta con nosotros
              </Link>
            </p>
          </div>
        </section>

        {/* Categories */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="space-y-16">
              {categories.map((category) => {
                const Icon = category.icon;
                return (
                  <article key={category.title}>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-zaltyko-accent/10 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-zaltyko-accent" />
                      </div>
                      <h2 className="font-display text-2xl font-semibold text-foreground">
                        {category.title}
                      </h2>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {category.questions.map((item) => (
                        <div
                          key={item.q}
                          className="p-5 rounded-xl border border-border bg-card"
                        >
                          <h3 className="font-semibold text-foreground flex items-start gap-2">
                            <HelpCircle className="w-4 h-4 text-zaltyko-accent flex-shrink-0 mt-1" />
                            {item.q}
                          </h3>
                          <p className="mt-2 text-sm text-muted-foreground pl-6">
                            {item.a}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 bg-muted/30">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-display text-2xl font-semibold text-foreground">
              ¿No encontraste lo que buscabas?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Estamos aquí para resolver cualquier duda que tengas sobre Zaltyko.
            </p>
            <Link
              href="/contact"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-zaltyko-primary px-8 py-3 font-semibold text-white hover:bg-zaltyko-primary-dark"
            >
              Contactar
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </div>
  );
}
