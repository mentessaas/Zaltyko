import { Check, Shield, Clock, Globe2 } from "lucide-react";

const plans = [
  {
    title: "Free",
    price: "0 €",
    description: "Hasta 50 atletas. Ideal para academias en formación o sedes satélite.",
    cta: "Empezar gratis",
    highlight: false,
    features: [
      "1 academia + 5 coaches",
      "Agenda semanal y registro de asistencia",
      "Alertas de cupo y métricas básicas",
      "Checkout para upgrades integrado",
    ],
  },
  {
    title: "Pro",
    price: "19 € / mes",
    description: "200 atletas, informes avanzados y seguimiento de evaluaciones técnicas.",
    cta: "Activar Plan Pro",
    highlight: true,
    features: [
      "Academias ilimitadas por tenant",
      "KPIs de rendimiento y lesiones",
      "Automatización de correos a familias",
      "Exportables para federaciones",
    ],
  },
  {
    title: "Premium",
    price: "49 € / mes",
    description: "Para redes de academias y programas élite sin límites operativos.",
    cta: "Hablar con ventas",
    highlight: false,
    features: [
      "Atletas y coaches ilimitados",
      "Integración con GymnasticMeet (fase II)",
      "API extendida y soporte prioritario",
      "Plan de cuentas y auditoría multi-sede",
    ],
  },
];

const commonBenefits = [
  {
    icon: Shield,
    title: "Seguridad multi-tenant",
    description: "Políticas RLS activas, auditoría de acciones y cumplimiento RGPD sin configuración adicional.",
  },
  {
    icon: Clock,
    title: "Operación en tiempo real",
    description: "Dashboards instantáneos de asistencia, evaluaciones y finanzas en todas tus academias.",
  },
  {
    icon: Globe2,
    title: "Soporte en español e inglés",
    description: "Onboarding guiado, documentación clara y acompañamiento para equipos en distintos países.",
  },
];

export default function PricingSection() {
  return (
    <section id="planes" className="bg-zaltyko-primary-dark py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="font-display text-xs uppercase tracking-[0.35em] text-zaltyko-accent">
            Planes claros
          </span>
          <h2 className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">
            Freemium pensado para escalar tu academia sin fricción.
          </h2>
          <p className="mt-3 font-sans text-base text-white/75">
            Cambia de plan en cualquier momento. Stripe sincroniza límites en segundos y aplicamos prorateo automático.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.title}
              className={`relative flex h-full flex-col rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl transition hover:border-zaltyko-accent/40 ${
                plan.highlight ? "ring-2 ring-zaltyko-accent/50" : ""
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 right-6 rounded-full bg-gradient-to-r from-zaltyko-accent to-zaltyko-accent-light px-3 py-1 text-xs font-semibold text-zaltyko-primary-dark">
                  Popular
                </span>
              )}
              <h3 className="font-display text-xl font-semibold text-white">{plan.title}</h3>
              <p className="mt-2 font-display text-3xl font-bold text-white">{plan.price}</p>
              <p className="mt-2 font-sans text-sm text-white/75">{plan.description}</p>

              <ul className="mt-6 space-y-3 font-sans text-sm text-white/80">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-zaltyko-accent" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                href={plan.title === "Premium" ? "mailto:ventas@zaltyko.com" : "/onboarding"}
                className={`mt-8 inline-flex items-center justify-center rounded-full px-6 py-2 text-sm font-semibold transition ${
                  plan.highlight
                    ? "bg-gradient-to-r from-zaltyko-accent to-zaltyko-accent-light text-zaltyko-primary-dark"
                    : "border border-white/20 text-white hover:bg-white/10"
                }`}
              >
                {plan.cta}
              </a>
            </article>
          ))}
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {commonBenefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <article
                key={benefit.title}
                className="rounded-3xl border border-white/10 bg-zaltyko-primary-dark/50 p-6 shadow-lg"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-zaltyko-accent/20 text-zaltyko-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-white">{benefit.title}</h3>
                <p className="mt-2 font-sans text-sm text-white/75">{benefit.description}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-16 rounded-3xl border border-white/10 bg-gradient-to-br from-zaltyko-accent/10 via-zaltyko-accent-light/10 to-transparent p-8 text-center text-white">
          <h3 className="font-display text-2xl font-semibold text-white">
            ¿Necesitas un acuerdo enterprise o migrar múltiples academias?
          </h3>
          <p className="mt-3 font-sans text-sm text-white/80">
            Ofrecemos sesiones de descubrimiento, scripts de migración y un entorno staging para tu equipo técnico.
          </p>
          <a
            href="mailto:ventas@zaltyko.com"
            className="mt-6 inline-flex items-center justify-center rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15"
          >
            Contactar a ventas
          </a>
        </div>
      </div>
    </section>
  );
}
