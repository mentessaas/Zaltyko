"use client";

import { CreditCard, Mail, Globe, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const integrations = [
  {
    name: "Stripe",
    description: "Procesa pagos de forma segura con la pasarela líder mundial. Cobros automáticos, suscripciones y gestión de tarjetas sin complicaciones.",
    icon: CreditCard,
    features: ["Pagos con tarjeta", "Cobros recurrentes", "Portal de facturación"],
    color: "from-violet-600 to-indigo-600",
  },
  {
    name: "Email Transaccional",
    description: "Envía comunicaciones profesionales a familias y entrenadores. Plantillas personalizables para notificaciones y recordatorios.",
    icon: Mail,
    features: ["Notificaciones automáticas", "Plantillas personalizables", "Envío por eventos"],
    color: "from-amber-500 to-orange-500",
  },
  {
    name: "WhatsApp",
    description: "Envía mensajes directos a padres y entrenadores. Notificaciones de clase, eventos y recordatorios de pago.",
    icon: Globe,
    features: ["Mensajes directos", "Notificaciones automáticas", "Plantillas predefinidas"],
    color: "from-green-500 to-emerald-600",
  },
  {
    name: "API para Desarrolladores",
    description: "Integra Zaltyko con tus sistemas. Webhooks para automatizar procesos y mantener todo sincronizado.",
    icon: Globe,
    features: ["API REST", "Webhooks", "Eventos en tiempo real"],
    color: "from-blue-500 to-indigo-600",
  },
];

export default function IntegrationsSection() {
  return (
    <section className="py-24 bg-gray-50 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-100 rounded-full blur-3xl opacity-40" />
        <div className="absolute bottom-20 right-20 w-72 h-72 bg-purple-100 rounded-full blur-3xl opacity-40" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-4 py-1.5 bg-red-100 text-red-700 text-sm font-semibold rounded-full mb-4">
            Integraciones
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            Conecta con las herramientas que ya usas
          </h2>
          <p className="text-xl text-gray-600">
            Zaltyko se integra con las principales herramientas para crear un flujo de trabajo sin interrupciones
          </p>
        </div>

        {/* Integrations grid */}
        <div className="grid md:grid-cols-2 gap-8">
          {integrations.map((integration, i) => (
            <div 
              key={integration.name}
              className="group bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              <div className="flex items-start gap-6">
                {/* Icon */}
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br",
                  integration.color
                )}>
                  <integration.icon className="w-8 h-8 text-white" />
                </div>

                {/* Content */}
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-red-600 transition-colors">
                    {integration.name}
                  </h3>
                  <p className="text-gray-600 mb-4 leading-relaxed">
                    {integration.description}
                  </p>

                  {/* Features */}
                  <ul className="space-y-2">
                    {integration.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-gray-500">
                        <div className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
