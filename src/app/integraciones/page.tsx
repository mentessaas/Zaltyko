import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { Check, CreditCard } from "lucide-react";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Integraciones | Software para academias de gimnasia",
  description:
    "Consulta las integraciones disponibles para facturar tu plan de Zaltyko y enviar comunicaciones transaccionales.",
  alternates: {
    canonical: `${baseUrl}/integraciones`,
  },
};

type Integration = { name: string; description: string; icon: typeof CreditCard; features: string[]; status?: string; comingSoon?: boolean };
const integrations: Integration[] = [
  {
    name: "Suscripción de Zaltyko (Stripe)",
    description: "Stripe gestiona el pago del plan Starter o Growth de la academia. Esta integración no activa el cobro automático de las cuotas de sus familias.",
    icon: CreditCard,
    features: ["Suscripción mensual o anual", "Gestión del plan de Zaltyko", "Estado de facturación"],
    status: "available",
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
            Contratación del plan con Stripe
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-lg text-zaltyko-text-secondary">
            Stripe gestiona la suscripción SaaS de tu academia. Para las cuotas familiares, el registro es manual en este lanzamiento.
          </p>
          <p className="mt-3 text-sm font-medium text-zaltyko-text-secondary">
            Suscripción SaaS independiente de las cuotas familiares
          </p>
          <p className="mt-2 text-xs text-zaltyko-text-secondary">
            El correo de acceso se utiliza para confirmar la cuenta y recuperar la contraseña. No se incluyen campañas ni recordatorios automáticos a familias.
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
                      ? "border-border surface-subtle"
                      : "border-zaltyko-primary/20 bg-white shadow-lg shadow-zaltyko-primary/5"
                  }`}
                >
                  {integration.status === "available" && (
                    <span className="absolute -top-3 -right-3 inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                      <Check className="mr-1 h-3 w-3" />
                      Disponible
                    </span>
                  )}
                  {integration.comingSoon && (
                    <span className="absolute -top-3 -right-3 inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
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
            Contáctanos y revisaremos cómo incorporarla a nuestra hoja de ruta.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/contact"
              className="rounded-full bg-white px-8 py-3 font-semibold text-zaltyko-primary hover:bg-muted"
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
