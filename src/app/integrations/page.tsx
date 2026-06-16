import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/home/Navbar";
import Footer from "@/app/(site)/Footer";
import { Check, CreditCard, Calendar, Mail, Zap } from "lucide-react";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Integraciones | Software para academias de gimnasia",
  description:
    "Conecta Zaltyko con Stripe, Google Calendar, email transaccional y más. Automatiza pagos, horarios y comunicaciones.",
  alternates: {
    canonical: `${baseUrl}/integrations`,
  },
};

const integrations = [
  {
    name: "Stripe",
    description: "Procesa pagos de membresías y servicios de forma segura. Acepta tarjetas, domiciliaciones y pagos recurrentes.",
    icon: CreditCard,
    features: ["Pagos recurrentes", "Facturación automática", "Gestión de suscripciones", "Webhook de eventos"],
    status: "connected",
  },
  {
    name: "Google Calendar",
    description: "Sincroniza automáticamente horarios de clases y eventos con el calendario de tu academia.",
    icon: Calendar,
    features: ["Sincronización bidireccional", "Recordatorios automáticos", "Eventos de clases", "Disponibilidad de salas"],
    status: "connected",
  },
  {
    name: "Email Transaccional",
    description: "Envía emails automáticos a atletas, padres y entrenadores. Notificaciones, recordatorios y comunicaciones personalizadas.",
    icon: Mail,
    features: ["Emails de bienvenida", "Recordatorios de pago", "Notificaciones de clases", "Plantillas personalizables"],
    status: "connected",
  },
  {
    comingSoon: true,
    name: "WhatsApp Business",
    description: "Comunícate con padres y atletas directamente por WhatsApp. Mensajes automáticos y respuestas rápidas.",
    icon: Zap,
    features: ["Mensajes automatizados", "Notificaciones de clase", "Recordatorios de pago", "Chat grupal por clase"],
  },
  {
    comingSoon: true,
    name: "Zoom / Google Meet",
    description: "Clases online y reuniones con padres. Videollamadas integradas dentro de la plataforma.",
    icon: Zap,
    features: ["Videollamadas integradas", "Grabación de clases", "Pizarra compartida", "Salas breakout"],
  },
  {
    comingSoon: true,
    name: "Instagram / Facebook",
    description: "Publica contenido automáticamente en redes sociales. Comparte eventos, logros y noticias.",
    icon: Zap,
    features: ["Publicación programada", "Historias automáticas", "Feed de competencias", "Botón de contacto"],
  },
];

export default function IntegrationsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-zaltyko-primary/5 to-transparent">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-4">
            Integraciones
          </span>
          <h1 className="font-display text-4xl font-bold tracking-tight text-zaltyko-text-main sm:text-5xl">
            Conecta con tus herramientas favoritas
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-lg text-zaltyko-text-secondary">
            Zaltyko se integra con los servicios que ya usas. Automatiza procesos y ahorra tiempo.
          </p>
        </div>
      </section>

      {/* Integrations Grid */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {integrations.map((integration, index) => {
              const Icon = integration.icon;
              return (
                <div
                  key={index}
                  className={`relative rounded-2xl border p-6 ${
                    integration.comingSoon
                      ? "border-gray-200 bg-gray-50"
                      : "border-zaltyko-primary/20 bg-white shadow-lg shadow-zaltyko-primary/5"
                  }`}
                >
                  {integration.status === "connected" && (
                    <span className="absolute -top-3 -right-3 inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                      <Check className="mr-1 h-3 w-3" />
                      Activo
                    </span>
                  )}
                  {integration.comingSoon && (
                    <span className="absolute -top-3 -right-3 inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                      Próximamente
                    </span>
                  )}

                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zaltyko-primary/10 mb-4">
                    <Icon className="h-6 w-6 text-zaltyko-primary" />
                  </div>

                  <h3 className="text-lg font-semibold text-zaltyko-text-main">{integration.name}</h3>
                  <p className="mt-2 text-sm text-zaltyko-text-secondary">{integration.description}</p>

                  <ul className="mt-4 space-y-2">
                    {integration.features.map((feature, i) => (
                      <li key={i} className="flex items-center text-sm text-zaltyko-text-secondary">
                        <Check className="mr-2 h-4 w-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-zaltyko-primary">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white">¿Necesitas una integración específica?</h2>
          <p className="mt-4 text-lg text-white/80">
            Cont&aacute;ctanos y we&apos;ll work to add it to our roadmap.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/contact"
              className="rounded-full bg-white px-8 py-3 font-semibold text-zaltyko-primary hover:bg-gray-100"
            >
              Contáctanos
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border-2 border-white px-8 py-3 font-semibold text-white hover:bg-white/10"
            >
              Ver precios
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
