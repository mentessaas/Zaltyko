import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/home/Navbar";
import Footer from "@/app/(site)/Footer";
import { Mail, Phone, MapPin, Clock, MessageCircle, Send } from "lucide-react";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Contacto | Zaltyko - Software para academias de gimnasi",
  description:
    "Contacta con el equipo de Zaltyko. Estamos disponibles para ayudarte con tu academia de gimnasi.",
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
    icon: Phone,
    title: "Teléfono",
    description: "Lun-Vie de 9h a 18h",
    value: "+34 900 123 456",
    href: "tel:+34900123456",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp",
    description: "Respuesta rápida",
    value: "+34 600 000 000",
    href: "https://wa.me/34600000000",
  },
  {
    icon: Clock,
    title: "Horario",
    description: "Lunes a viernes",
    value: "9:00 - 18:00 (CET)",
  },
];

const reasons = [
  { value: "demo", label: "Solicitar demo" },
  { value: "sales", label: "Información de ventas" },
  { value: "support", label: "Soporte técnico" },
  { value: "billing", label: "Facturación" },
  { value: "partnership", label: "Colaboración" },
  { value: "other", label: "Otro" },
];

export default function ContactPage() {
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

              {/* Office Location */}
              <div className="mt-8 p-6 rounded-xl bg-gray-50">
                <div className="flex items-start">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zaltyko-primary/10">
                    <MapPin className="h-5 w-5 text-zaltyko-primary" />
                  </div>
                  <div className="ml-4">
                    <h3 className="font-semibold text-zaltyko-text-main">Oficina</h3>
                    <p className="text-sm text-zaltyko-text-secondary">
                      Calle Example, 123<br />
                      28001 Madrid<br />
                      España
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div>
              <h2 className="text-2xl font-bold text-zaltyko-text-main mb-6">Envíanos un mensaje</h2>
              <form className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-zaltyko-text-main">
                      Nombre completo
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-zaltyko-primary focus:ring-2 focus:ring-zaltyko-primary/20"
                      placeholder="Tu nombre"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-zaltyko-text-main">
                      Email
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-zaltyko-primary focus:ring-2 focus:ring-zaltyko-primary/20"
                      placeholder="tu@email.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reason" className="block text-sm font-medium text-zaltyko-text-main">
                    Motivo de contacto
                  </label>
                  <select
                    id="reason"
                    name="reason"
                    required
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-zaltyko-primary focus:ring-2 focus:ring-zaltyko-primary/20"
                  >
                    {reasons.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="academy" className="block text-sm font-medium text-zaltyko-text-main">
                    Nombre de tu academia (opcional)
                  </label>
                  <input
                    type="text"
                    id="academy"
                    name="academy"
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-zaltyko-primary focus:ring-2 focus:ring-zaltyko-primary/20"
                    placeholder="Ej: Gimnasio Central"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-zaltyko-text-main">
                    Mensaje
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    required
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-zaltyko-primary focus:ring-2 focus:ring-zaltyko-primary/20"
                    placeholder="¿En qué podemos ayudarte?"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center rounded-full bg-zaltyko-primary px-8 py-3 font-semibold text-white hover:bg-zaltyko-primary-dark transition-colors"
                >
                  <Send className="mr-2 h-5 w-5" />
                  Enviar mensaje
                </button>

                <p className="text-xs text-center text-zaltyko-text-secondary">
                  Al enviar este formulario, aceptas nuestro{" "}
                  <Link href="/privacy-policy" className="underline hover:text-zaltyko-primary">
                    política de privacidad
                  </Link>
                  .
                </p>
              </form>
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
            href="/help"
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
