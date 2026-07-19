import { Metadata } from "next";
import Link from "next/link";
import { HelpCircle, CreditCard, Users, Calendar, BarChart3, Shield, ArrowRight } from "lucide-react";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Preguntas Frecuentes",
  description:
    "Resolvemos las dudas más comunes sobre Zaltyko: precios, funciones, cancelación y más.",
  alternates: {
    canonical: `${baseUrl}/faq`,
  },
  openGraph: {
    title: "Preguntas Frecuentes | Zaltyko",
    description:
      "Resolvemos las dudas más comunes sobre Zaltyko: precios, funciones, cancelación y más.",
    url: `${baseUrl}/faq`,
    type: "website",
  },
};

const categories = [
  {
    icon: CreditCard,
    title: "Precios y pagos",
    questions: [
      {
        q: "¿Cuánto cuesta Zaltyko?",
        a: "Zaltyko tiene 3 planes por etapa de academia: Starter, Growth y Network. Recomendamos una demo para elegir según gimnastas, grupos, sedes y cobros.",
      },
      {
        q: "¿Puedo ver el producto antes de contratar?",
        a: "Sí. La entrada principal es una demo guiada para revisar tu caso y validar si Zaltyko encaja con tu academia.",
      },
      {
        q: "¿Cómo funcionan los planes?",
        a: "Se renuevan automáticamente cada mes. Puedes cancelar cuando quieras desde tu panel de suscripción.",
      },
      {
        q: "¿Puedo cambiar de plan?",
        a: "Sí, puedes actualizar o reducir tu plan en cualquier momento. Los cambios se aplican inmediatamente.",
      },
    ],
  },
  {
    icon: Users,
    title: "Gestión de gimnastas",
    questions: [
      {
        q: "¿Puedo importar gimnastas desde otro sistema?",
        a: "Sí, puedes importar gimnastas y familias desde archivos CSV. Para migraciones grandes, el equipo de Zaltyko puede ayudarte con una puesta en marcha guiada.",
      },
      {
        q: "¿Cómo funciona la gestión de grupos y niveles?",
        a: "Puedes crear grupos por edad, nivel, disciplina y horario. Cada gimnasta puede pertenecer a múltiples grupos.",
      },
      {
        q: "¿Hay control de asistencia?",
        a: "Sí, tienes lista de asistencia por clase que puedes marcar con un click. También hay reportes de asistencia.",
      },
    ],
  },
  {
    icon: Calendar,
    title: "Clases y horarios",
    questions: [
      {
        q: "¿Puedo crear clases recurrentes?",
        a: "Sí, define el horario semanal y Zaltyko genera automáticamente todas las sesiones del mes.",
      },
      {
        q: "¿Qué pasa si tengo que cancelar una clase?",
        a: "Puedes cancelar sesiones individuales. Los padres reciben notificación automática y se marca en el historial.",
      },
      {
        q: "¿Hay lista de espera?",
        a: "Sí, puedes habilitar lista de espera por clase. Cuando se libera un cupo, el siguiente de la lista recibe notificación.",
      },
    ],
  },
  {
    icon: BarChart3,
    title: "Cobros y recibos",
    questions: [
      {
        q: "¿Cómo cobro a los padres?",
        a: "Zaltyko te permite controlar cuotas, pagos pendientes y recordatorios para que cada familia tenga su historial claro.",
      },
      {
        q: "¿Puedo aplicar descuentos?",
        a: "Sí, puedes crear descuentos individuales o campañas (hermanos, pronta inscripción, etc).",
      },
      {
        q: "¿Qué pasa si un padre no paga?",
        a: "Recibirás alertas de impago y podrás enviar recordatorios para resolverlo con la familia.",
      },
    ],
  },
  {
    icon: Shield,
    title: "Seguridad y datos",
    questions: [
      {
        q: "¿Mis datos están seguros?",
        a: "Zaltyko aplica controles por rol, aislamiento por academia y conexiones cifradas. Las opciones de exportación y borrado dependen del módulo y de la política de privacidad vigente.",
      },
      {
        q: "¿Puedo borrar mis datos?",
        a: "Puedes solicitar la eliminación de tu cuenta y datos asociados. Revisamos la solicitud conforme a la política de privacidad y las obligaciones de conservación aplicables.",
      },
      {
        q: "¿Hay soporte técnico?",
        a: "El soporte depende del plan. Growth y Network priorizan puesta en marcha, migración y acompañamiento operativo.",
      },
    ],
  },
];

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

      <main className="flex-1">
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
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-zaltyko-primary px-8 py-3 font-semibold text-white hover:bg-primary-dark"
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
