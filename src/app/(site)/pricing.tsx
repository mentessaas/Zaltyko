import { Check, Shield, Clock, Globe2 } from "lucide-react";

const plans = [
  {
    title: "Free",
    price: "0€",
    description: "Hasta 50 atletas. Ideal para academias en formación o sedes satélite.",
    cta: "Empezar gratis",
    highlight: false,
    features: [
      "Hasta 50 atletas",
      "1 academia + 5 coaches",
      "Agenda semanal + asistencia",
      "Métricas básicas",
      "Límite controlado vía Stripe",
    ],
  },
  {
    title: "Pro",
    price: "19€/mes",
    description: "200 atletas, informes avanzados y seguimiento de evaluaciones técnicas.",
    cta: "Activar Plan Pro",
    highlight: true,
    features: [
      "Hasta 200 atletas",
      "Academias ilimitadas",
      "KPIs avanzados",
      "Exportables para federación",
      "Seguimiento de evaluaciones",
    ],
  },
  {
    title: "Premium",
    price: "49€/mes",
    description: "Para redes de academias y programas élite sin límites operativos.",
    cta: "Hablar con ventas",
    highlight: false,
    features: [
      "Atletas y coaches ilimitados",
      "API extendida",
      "Soporte prioritario",
      "Auditoría multi-sede",
      "Integración futura con GymnasticMeet",
    ],
  },
];

const commonBenefits = [
  {
    icon: Shield,
    title: "Tenancy blindado",
    description: "Aislamiento total por tenant con RLS y cumplimiento RGPD.",
  },
  {
    icon: Clock,
    title: "Operativa en tiempo real",
    description: "Todo se actualiza instantáneamente.",
  },
  {
    icon: Globe2,
    title: "Pensado exclusivamente para gimnasia",
    description: "Diseñado junto a directores técnicos de gimnasia artística y rítmica.",
  },
];

export default function PricingSection() {
  return (
    <section id="planes" className="py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="font-display text-xs uppercase tracking-[0.35em] text-zaltyko-accent">
            Planes
          </span>
          <h2 className="mt-4 font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Elige el plan que mejor se adapte a tu academia
          </h2>
          <p className="mt-3 font-sans text-base text-muted-foreground">
            Todos los planes incluyen las funcionalidades esenciales. Actualiza cuando necesites más capacidad.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.title}
              className={`relative flex h-full flex-col rounded-3xl border border-border bg-card p-8 shadow-xl transition hover:border-zaltyko-accent/40 ${
                plan.highlight ? "ring-2 ring-zaltyko-accent/50" : ""
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 right-6 rounded-full bg-gradient-to-r from-zaltyko-accent to-zaltyko-accent-light px-3 py-1 text-xs font-semibold text-zaltyko-primary-dark">
                  Popular
                </span>
              )}
              <h3 className="font-display text-xl font-semibold text-foreground">{plan.title}</h3>
              <p className="mt-2 font-display text-3xl font-bold text-foreground">{plan.price}</p>
              <p className="mt-2 font-sans text-sm text-muted-foreground">{plan.description}</p>

              <ul className="mt-6 space-y-3 font-sans text-sm text-foreground">
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
                    : "border border-border text-foreground hover:bg-muted"
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
                className="rounded-3xl border border-border bg-card p-6 shadow-lg"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-zaltyko-accent/20 text-zaltyko-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{benefit.title}</h3>
                <p className="mt-2 font-sans text-sm text-muted-foreground">{benefit.description}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-16 rounded-3xl border border-border bg-muted/50 p-8 text-center">
          <h3 className="font-display text-2xl font-semibold text-foreground">
            ¿Necesitas un acuerdo enterprise o migrar múltiples academias?
          </h3>
          <p className="mt-3 font-sans text-sm text-muted-foreground">
            Ofrecemos sesiones de descubrimiento, scripts de migración y un entorno staging para tu equipo técnico.
          </p>
          <a
            href="mailto:ventas@zaltyko.com"
            className="mt-6 inline-flex items-center justify-center rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Contactar a ventas
          </a>
        </div>
      </div>
    </section>
  );
}
