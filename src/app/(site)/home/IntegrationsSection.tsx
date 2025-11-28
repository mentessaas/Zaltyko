import { CreditCard, Calendar, Mail, ArrowRight } from "lucide-react";

const integrations = [
  {
    name: "Stripe",
    description: "Procesa pagos de forma segura con la pasarela líder mundial. Cobros automáticos, suscripciones y gestión de tarjetas sin complicaciones.",
    icon: CreditCard,
    color: "from-indigo-500 to-violet-600",
    features: ["Pagos con tarjeta", "Cobros recurrentes", "Portal de facturación"],
  },
  {
    name: "Google Calendar",
    description: "Sincroniza clases y eventos con el calendario de entrenadores y familias. Notificaciones automáticas antes de cada sesión.",
    icon: Calendar,
    color: "from-blue-500 to-cyan-600",
    features: ["Sincronización bidireccional", "Recordatorios", "Eventos compartidos"],
  },
  {
    name: "Email transaccional",
    description: "Envía notificaciones, recordatorios y comunicaciones automáticas a padres y staff con entregabilidad garantizada.",
    icon: Mail,
    color: "from-rose-500 to-pink-600",
    features: ["Plantillas personalizables", "Seguimiento de apertura", "Emails masivos"],
  },
];

export default function IntegrationsSection() {
  return (
    <section id="integraciones" className="py-20 lg:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-4">
            Ecosistema conectado
          </span>
          <h2 className="font-display text-3xl font-bold tracking-tight text-zaltyko-text-main sm:text-4xl">
            Integraciones que potencian tu academia
          </h2>
          <p className="mt-6 text-lg text-zaltyko-text-secondary leading-relaxed">
            Zaltyko se conecta con las herramientas que ya usas para crear un flujo de trabajo 
            sin interrupciones. Automatiza procesos y mantén todo sincronizado.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {integrations.map((integration) => (
            <div
              key={integration.name}
              className="group relative bg-zaltyko-bg/50 rounded-2xl border border-zaltyko-border p-8 hover:bg-white hover:shadow-medium transition-all duration-300"
            >
              {/* Icon */}
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${integration.color} flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <integration.icon className="w-7 h-7" />
              </div>

              {/* Content */}
              <h3 className="font-display text-xl font-bold text-zaltyko-text-main mb-3">
                {integration.name}
              </h3>
              <p className="text-sm text-zaltyko-text-secondary leading-relaxed mb-6">
                {integration.description}
              </p>

              {/* Features */}
              <ul className="space-y-2">
                {integration.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-zaltyko-text-secondary">
                    <ArrowRight className="w-4 h-4 text-zaltyko-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* More integrations coming */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zaltyko-primary/10 text-zaltyko-primary text-sm font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zaltyko-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-zaltyko-primary"></span>
            </span>
            Más integraciones en desarrollo: Federaciones, ERP contable, WhatsApp Business
          </div>
        </div>
      </div>
    </section>
  );
}

