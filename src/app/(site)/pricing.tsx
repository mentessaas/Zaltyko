import { Check } from "lucide-react";

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

export default function PricingSection() {
  return (
    <section id="planes" className="bg-[#071013] py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="text-xs uppercase tracking-[0.35em] text-emerald-300">
            Planes claros
          </span>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
            Freemium pensado para escalar tu academia sin fricción.
          </h2>
          <p className="mt-3 text-base text-slate-200/75">
            Cambia de plan en cualquier momento. Stripe sincroniza límites en segundos y aplicamos prorateo automático.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.title}
              className={`relative flex h-full flex-col rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl transition hover:border-emerald-300/40 ${
                plan.highlight ? "ring-2 ring-emerald-400/50" : ""
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 right-6 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-3 py-1 text-xs font-semibold text-[#0d1b1e]">
                  Popular
                </span>
              )}
              <h3 className="text-xl font-semibold text-white">{plan.title}</h3>
              <p className="mt-2 text-3xl font-bold text-white">{plan.price}</p>
              <p className="mt-2 text-sm text-slate-200/75">{plan.description}</p>

              <ul className="mt-6 space-y-3 text-sm text-slate-100/80">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-emerald-300" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                href={plan.title === "Premium" ? "mailto:ventas@gymna.app" : "/onboarding"}
                className={`mt-8 inline-flex items-center justify-center rounded-full px-6 py-2 text-sm font-semibold transition ${
                  plan.highlight
                    ? "bg-gradient-to-r from-emerald-400 to-lime-300 text-[#0d1b1e]"
                    : "border border-white/20 text-white hover:bg-white/10"
                }`}
              >
                {plan.cta}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
