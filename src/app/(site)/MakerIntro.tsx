const steps = [
  {
    title: "Onboarding en 4 pasos",
    description:
      "Creamos el tenant, la academia madre y te guiamos para invitar coaches y cargar a tus primeras atletas.",
  },
  {
    title: "Roles y permisos",
    description:
      "Owner, coach y staff administrativo con accesos diferenciados. Próximamente, portal para familias.",
  },
  {
    title: "Reportes accionables",
    description:
      "Indicadores de asistencia, cupo por nivel y seguimiento a lesionadas. Exporta en un clic para la federación.",
  },
];

export default function MakerIntro() {
  return (
    <section id="modulos" className="bg-zaltyko-primary-dark py-20">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 sm:px-6 lg:flex-row lg:px-8">
        <div className="flex-1">
          <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">
            Diseñado junto a directores técnicos de gimnasia artística.
          </h2>
          <p className="mt-4 font-sans text-base text-white/80">
            No es otra plantilla. Zaltyko nace de academias reales que necesitaban controlar entrenamientos, staff y facturación sin usar hojas de cálculo infinitas. Cada módulo se integra con Stripe, Supabase y nuestras APIs públicas para que puedas extenderlo.
          </p>
          <p className="mt-4 font-sans text-base text-white/70">
            ¿Quieres probarlo? Inicia el onboarding, genera datos demo y entra al dashboard multi-academia. No necesitas configurar auth ni llaves de terceros para el modo demostración.
          </p>
        </div>

        <div className="flex-1 space-y-6">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg"
            >
              <span className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-zaltyko-accent-light">
                Paso {index + 1}
              </span>
              <h3 className="mt-3 font-display text-xl font-semibold text-white">{step.title}</h3>
              <p className="mt-2 font-sans text-sm leading-relaxed text-white/75">
                {step.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
