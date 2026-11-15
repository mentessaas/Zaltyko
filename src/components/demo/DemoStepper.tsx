import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { DEMO_STEPS, type DemoStepKey } from "@/modules/demo/demo-steps";

/**
 * Pie del recorrido: en qué paso estás y a dónde ir. El último paso cierra con
 * la invitación a crear la academia. El clic al registro lo mide DemoSandbox.
 */
export function DemoStepper({
  current,
  className = "mx-auto w-full max-w-6xl px-5 pb-28 lg:px-10 xl:pb-12",
}: {
  current: DemoStepKey;
  /** Las pantallas que ya tienen su propio relleno lateral lo sustituyen. */
  className?: string;
}) {
  const index = DEMO_STEPS.findIndex((step) => step.key === current);
  const previous = index > 0 ? DEMO_STEPS[index - 1] : null;
  const next = index < DEMO_STEPS.length - 1 ? DEMO_STEPS[index + 1] : null;

  return (
    <nav aria-label="Recorrido de la demo" className={className}>
      <div className="rounded-xl border border-z-line border-t-[3px] border-t-mat bg-white p-5 sm:p-6">
        <p className="floor-label text-ramp-600">
          Recorrido · paso {index + 1} de {DEMO_STEPS.length}
        </p>
        <p className="mt-1 font-display text-xl font-black uppercase leading-none text-mat-night sm:text-2xl">
          {DEMO_STEPS[index].label}
        </p>
        <ol className="mt-4 flex flex-wrap gap-2" aria-label="Pasos">
          {DEMO_STEPS.map((step, position) => (
            <li key={step.key}>
              <Link
                href={step.href}
                aria-current={step.key === current ? "step" : undefined}
                className={`inline-flex min-h-9 items-center rounded-md border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mat ${
                  step.key === current
                    ? "border-mat bg-mat text-white"
                    : "border-chalk-line bg-white text-mat-night hover:border-mat"
                }`}
              >
                {position + 1}. {step.label}
              </Link>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-3">
          {previous ? (
            <Link href={previous.href} className={ownerUi.secondaryButton}>
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              {previous.label}
            </Link>
          ) : null}
          {next ? (
            <Link href={next.href} className={ownerUi.primaryButton}>
              Siguiente: {next.label}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          ) : (
            <Link href="/auth/register?role=owner" data-demo-cta="final-recorrido" className={ownerUi.primaryButton}>
              Crear mi academia gratis
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
