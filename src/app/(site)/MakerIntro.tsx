const steps = [
  {
    title: "Crea tu academia",
    description:
      "Registra tu academia, define el tipo (artística, rítmica, trampolín o general) y configura tu ubicación.",
  },
  {
    title: "Configura roles y grupos",
    description:
      "Invita entrenadores, crea grupos por nivel/edad y programa horarios de clases semanales.",
  },
  {
    title: "Sube atletas y empieza a operar",
    description:
      "Importa atletas desde Excel o créalos manualmente. La asistencia está disponible desde el primer día.",
  },
];

export default function MakerIntro() {
  return (
    <section id="modulos" className="py-20">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 sm:px-6 lg:flex-row lg:px-8">
        <div className="flex-1">
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Onboarding en 3 pasos
          </h2>
          <p className="mt-4 font-sans text-base text-muted-foreground">
            Zaltyko está diseñado junto a directores técnicos de gimnasia artística y rítmica. No es otra plantilla genérica: cada módulo está pensado para la operativa real de academias de gimnasia.
          </p>
          <p className="mt-4 font-sans text-base text-muted-foreground">
            Tenancy blindado con aislamiento total por tenant, RLS y cumplimiento RGPD. Operativa en tiempo real donde todo se actualiza instantáneamente.
          </p>
        </div>

        <div className="flex-1 space-y-6">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className="rounded-2xl border border-border bg-card p-6 shadow-lg"
            >
              <span className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-zaltyko-accent">
                Paso {index + 1}
              </span>
              <h3 className="mt-3 font-display text-xl font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 font-sans text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
