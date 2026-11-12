import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LiveClock } from "@/components/mat/LiveClock";
import { OwnerHeroPlanStrip } from "./OwnerHeroPlanStrip";
import type { OwnerSummaryNextStep } from "./owner-summary-next-step";

/**
 * Hero del Resumen «Magnesio sobre tapiz» (como DashboardHeroSection de /app):
 * banda de tapiz con marco de cinta, la academia rotulada en grande, el ámbito
 * de sedes debajo, el saludo con el siguiente paso real y su acción en cinta
 * blanca; a la derecha el reloj de pista y, al pie, la franja del plan.
 */
export function OwnerSummaryHero({
  organizationId,
  organizationName,
  scopeLabel,
  greetingName,
  nextStep,
  timeZone,
  subscriptionHref,
  showPlan = true,
}: {
  organizationId: string;
  organizationName: string;
  /** Sede seleccionada o «Todas las sedes»; null si no hay sede legible. */
  scopeLabel: string | null;
  greetingName: string;
  nextStep: OwnerSummaryNextStep;
  timeZone: string;
  /** Solo para quien gestiona el plan (titular). */
  subscriptionHref: string | null;
  showPlan?: boolean;
}) {
  return (
    <section aria-labelledby="owner-summary-title" className="mat-field relative overflow-hidden rounded-xl">
      <div aria-hidden="true" className="pointer-events-none absolute inset-2 rounded-md border-[3px] border-white/70" />
      <div className="relative flex min-w-0 flex-col gap-6 px-6 py-7 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-8">
        <div className="min-w-0 flex-1">
          <h1
            id="owner-summary-title"
            className="min-w-0 break-words font-display text-[clamp(2rem,4vw,3.25rem)] font-black uppercase leading-[0.92] text-white [overflow-wrap:anywhere] [text-wrap:balance]"
          >
            {/* El espacio va fuera del span: dentro se recorta y el nombre accesible
                quedaría «Resumen deAcademia». */}
            <span className="sr-only">Resumen de</span> {organizationName}
          </h1>
          {scopeLabel ? (
            <p className="floor-label mt-2 break-words text-white/85">{scopeLabel}</p>
          ) : null}
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/90">
            Hola, {greetingName}. {nextStep.message}
          </p>
          {nextStep.cta ? (
            <Link
              href={nextStep.cta.href}
              className="touch-target mt-5 inline-flex items-center gap-2 rounded-md bg-white px-5 text-sm font-extrabold text-mat-deep transition-colors hover:bg-chalk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {nextStep.cta.label}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
        <LiveClock className="shrink-0 text-white lg:text-right" timeZone={timeZone} />
      </div>
      {showPlan ? (
        <OwnerHeroPlanStrip organizationId={organizationId} subscriptionHref={subscriptionHref} />
      ) : null}
    </section>
  );
}
