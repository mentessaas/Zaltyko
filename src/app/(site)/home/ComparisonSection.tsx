import Link from "next/link";
import { ArrowRight, Check, CircleHelp } from "lucide-react";
import Reveal from "@/components/motion/Reveal";

const shifts = [
  {
    pain: "¿En qué hoja estaba la ficha?",
    change: "Gimnastas, grupos y familias reunidos en la academia.",
  },
  {
    pain: "¿Qué cuota quedó pendiente?",
    change: "Cuotas y pagos consultables desde el módulo de cobros.",
  },
  {
    pain: "¿Quién faltó a la sesión de hoy?",
    change: "Asistencia registrada por sesión, también desde el móvil.",
  },
  {
    pain: "¿Ya envié el cambio de horario?",
    change: "Avisos y comunicación interna organizados en Zaltyko.",
  },
];

export default function ComparisonSection() {
  return (
    <section className="bg-zaltyko-white py-20 dark:bg-zaltyko-bg-dark sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-zaltyko-teal/20 bg-white px-4 py-2 text-sm font-semibold text-zaltyko-teal dark:border-border dark:bg-card dark:text-zaltyko-lime">
              <CircleHelp aria-hidden="true" className="h-4 w-4" />
              De la pregunta al siguiente paso
            </span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-zaltyko-navy dark:text-foreground sm:text-5xl">
              La dirección necesita contexto, no más sitios donde buscar.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-zaltyko-text-secondary dark:text-muted-foreground sm:text-lg">
              Zaltyko reúne tareas habituales de una academia para que puedas
              revisar lo que ocurre y decidir con información a mano.
            </p>
          </div>
        </Reveal>

        <div className="grid gap-3">
          {shifts.map((item, index) => (
            <Reveal key={item.pain} delay={index * 60}>
              <article
                aria-labelledby={`comparison-pain-${index}`}
                className="grid gap-3 rounded-2xl border border-zaltyko-mist/80 bg-white p-5 dark:border-border dark:bg-card sm:grid-cols-[0.92fr_auto_1.08fr] sm:items-center sm:gap-6 sm:px-7 sm:py-6"
              >
                <h3 id={`comparison-pain-${index}`} className="font-display text-lg font-semibold text-zaltyko-text-secondary dark:text-foreground sm:text-xl">
                  {item.pain}
                </h3>
                <ArrowRight aria-hidden="true" className="hidden h-5 w-5 text-zaltyko-teal dark:text-zaltyko-lime sm:block" />
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zaltyko-teal/10 text-zaltyko-teal">
                    <Check aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <p className="text-sm font-semibold leading-6 text-zaltyko-navy dark:text-foreground sm:text-base">
                    {item.change}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/features"
            className="group inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 font-semibold text-zaltyko-teal transition hover:bg-white dark:text-zaltyko-lime dark:hover:bg-card"
          >
            Ver cómo funciona en tu academia
            <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
