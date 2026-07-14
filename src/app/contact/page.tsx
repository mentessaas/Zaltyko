import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { Mail, Clock, MessageCircle } from "lucide-react";
import { ContactForm } from "@/components/contact/ContactForm";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://zaltyko.com";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Contacta con el equipo de Zaltyko. Estamos disponibles para ayudarte con tu academia de gimnasia.",
  alternates: {
    canonical: `${baseUrl}/contact`,
  },
};

const contactInfo = [
  {
    icon: Mail,
    title: "Email",
    description: "Escríbenos para cualquier consulta",
    value: "hola@zaltyko.com",
    href: "mailto:hola@zaltyko.com",
  },
  {
    icon: MessageCircle,
    title: "Demo guiada",
    description: "Revisamos tu caso y te mostramos el flujo adecuado",
    value: "Solicitar demo",
    href: "/contact?type=demo",
  },
  {
    icon: Clock,
    title: "Horario",
    description: "Lunes a viernes",
    value: "9:00 - 18:00 (CET)",
  },
];

interface ContactPageProps {
  searchParams: Promise<{ type?: string; plan?: string }>;
}

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const { type, plan } = await searchParams;
  const selectedPlan = plan ?? (type === "network" ? "network" : undefined);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-zaltyko-primary/5 to-transparent">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-4">
            Contacto
          </span>
          <h1 className="font-display text-4xl font-bold tracking-tight text-zaltyko-text-main sm:text-5xl">
            Hablemos de tu academia
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-lg text-zaltyko-text-secondary">
            ¿Tienes preguntas sobre Zaltyko? Nuestro equipo está aquí para ayudarte.
          </p>
        </div>
      </section>

      {/* Contact Info & Form */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2">
            {/* Contact Info */}
            <div>
              <h2 className="text-2xl font-bold text-zaltyko-text-main mb-6">Información de contacto</h2>
              <div className="space-y-6">
                {contactInfo.map((info, index) => {
                  const Icon = info.icon;
                  return (
                    <div key={index} className="flex items-start">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zaltyko-primary/10">
                        <Icon className="h-5 w-5 text-zaltyko-primary" />
                      </div>
                      <div className="ml-4">
                        <h3 className="font-semibold text-zaltyko-text-main">{info.title}</h3>
                        <p className="text-sm text-zaltyko-text-secondary">{info.description}</p>
                        {info.href ? (
                          <a
                            href={info.href}
                            className="text-sm font-medium text-zaltyko-primary hover:underline"
                          >
                            {info.value}
                          </a>
                        ) : (
                          <p className="text-sm font-medium text-zaltyko-text-main">{info.value}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 rounded-xl bg-gray-50 p-6">
                <h3 className="font-semibold text-zaltyko-text-main">Cómo trabajamos</h3>
                <p className="mt-2 text-sm text-zaltyko-text-secondary">
                  Respondemos por email con una propuesta concreta para tu academia. Si necesitas ver el producto,
                  agendaremos una demo guiada.
                </p>
              </div>
            </div>

            {/* Contact Form */}
            <div>
              <h2 className="text-2xl font-bold text-zaltyko-text-main mb-6">Envíanos un mensaje</h2>
              <ContactForm defaultReason={type} defaultPlan={selectedPlan} />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Link */}
      <section className="py-16 bg-gray-50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-zaltyko-text-main">
            ¿Prefieres resolverlo tú mismo?
          </h2>
          <p className="mt-4 text-zaltyko-text-secondary">
            Consulta nuestro centro de ayuda con guías y tutoriales.
          </p>
          <Link
            href="/ayuda"
            className="mt-6 inline-block rounded-full border-2 border-zaltyko-primary px-8 py-3 font-semibold text-zaltyko-primary hover:bg-zaltyko-primary/10"
          >
            Ver preguntas frecuentes
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
