import { Check, Shield, Clock, Globe2 } from "lucide-react";
import Link from "next/link";

type Plan = {
  title: string;
  price: string;
  description: string;
  cta: string;
  highlight: boolean;
  features: string[];
  annualPrice: string;
  annualSavings?: string;
};

const plans: Plan[] = [
  {
    title: "Starter",
    price: "49€/mes",
    description: "Para academias pequeñas de artística o rítmica que quieren ordenar operación y cobros.",
    cta: "Solicitar demo",
    highlight: false,
    features: [
      "Hasta 80 gimnastas",
      "1 academia",
      "Grupos, horarios y asistencia",
      "Cobros y pagos pendientes",
      "Perfil público básico",
    ],
    annualPrice: "490€/año",
  },
  {
    title: "Growth",
    price: "99€/mes",
    description: "Para academias en crecimiento con más grupos, familias, cobros y seguimiento técnico.",
    cta: "Solicitar demo",
    highlight: true,
    features: [
      "Hasta 250 gimnastas",
      "Cobros recurrentes y recordatorios",
      "Informes de asistencia y pagos",
      "Seguimiento por aparatos o rutinas",
      "Perfil público optimizado",
    ],
    annualPrice: "990€/año",
    annualSavings: "Ahorra 198€",
  },
  {
    title: "Network",
    price: "Desde 199€/mes",
    description: "Para academias multi-sede o programas con operación avanzada.",
    cta: "Hablar con Zaltyko",
    highlight: false,
    features: [
      "Multi-sede",
      "Migración asistida",
      "Soporte prioritario",
      "Informes de dirección",
      "Plan de crecimiento y captación",
    ],
    annualPrice: "Plan anual a medida",
  },
];

const commonBenefits = [
  {
    icon: Shield,
    title: "Datos 100% seguros",
    description: "Aislamiento total por academia con encriptación y cumplimiento RGPD.",
  },
  {
    icon: Clock,
    title: "Configuración en 2h",
    description: "Desde cero hasta operativo en una mañana. Sin conocimientos técnicos.",
  },
  {
    icon: Globe2,
    title: "Diseñado para gimnasia",
    description: "Creado junto a directores técnicos de gimnasia artística y rítmica.",
  },
];

export default function PricingSection() {
  return (
    <section id="planes" className="py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Urgency banner */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-zaltyko-teal/25 bg-zaltyko-teal/10 px-5 py-2 text-sm font-medium text-zaltyko-indigo">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zaltyko-teal opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-zaltyko-teal" />
            </span>
            Demo guiada · planes por tamaño de academia artística o rítmica
          </div>
        </div>

        <div className="text-center">
          <span className="font-display text-xs uppercase tracking-[0.35em] text-zaltyko-accent">
            Planes
          </span>
          <h2 className="mt-4 font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Planes pensados por etapa de academia
          </h2>
          <p className="mt-3 font-sans text-base text-muted-foreground">
            No vendemos módulos sueltos: vendemos dirección diaria, cobros claros y seguimiento técnico para gimnasia artística y rítmica.
          </p>
        </div>

        {/* Annual billing toggle */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-center gap-3 bg-muted/60 rounded-full px-1 py-1">
            <span className="px-4 py-1.5 rounded-full text-sm font-medium text-muted-foreground">Mensual</span>
            <span className="px-4 py-1.5 rounded-full bg-zaltyko-teal text-white text-sm font-bold shadow-sm">
              Anual — hasta 20% dto. <span className="text-xs opacity-70">(próximamente)</span>
            </span>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.title}
              className={`relative flex h-full flex-col rounded-3xl border border-border bg-card p-8 shadow-xl transition hover:border-zaltyko-accent/40 ${
                plan.highlight ? "ring-2 ring-zaltyko-accent/50" : ""
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 right-6 rounded-full bg-zaltyko-teal px-3 py-1 text-xs font-semibold text-white">
                  Popular
                </span>
              )}
              <h3 className="font-display text-xl font-semibold text-foreground">{plan.title}</h3>
              <p className="mt-2 font-display text-3xl font-bold text-foreground">{plan.annualPrice}</p>
              {plan.annualSavings && (
                <span className="mt-1 inline-block text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full w-fit">
                  {plan.annualSavings}
                </span>
              )}
              <p className="mt-2 font-sans text-sm text-muted-foreground">{plan.description}</p>

              <ul className="mt-6 space-y-3 font-sans text-sm text-foreground">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-zaltyko-teal" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/contact?type=demo"
                className={`mt-8 inline-flex items-center justify-center rounded-full px-6 py-2 text-sm font-semibold transition ${
                  plan.highlight
                    ? "bg-zaltyko-teal text-white hover:bg-primary-dark"
                    : "border border-border text-foreground hover:bg-muted"
                }`}
              >
                {plan.cta}
              </Link>
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
            ¿Necesitas migrar datos o coordinar varias sedes?
          </h3>
          <p className="mt-3 font-sans text-sm text-muted-foreground">
            Hacemos una sesión de diagnóstico y definimos una puesta en marcha para que tu equipo pueda operar sin fricción.
          </p>
          <a
            href="mailto:ventas@zaltyko.com"
            className="mt-6 inline-flex items-center justify-center rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Solicitar demo
          </a>
        </div>
      </div>
    </section>
  );
}
