import Link from "next/link";
import { Check } from "lucide-react";

import type { OwnerSetupChecklist } from "@/modules/owner-dashboard/application/setup-checklist-steps";
import { ownerUi } from "./owner-ui";

/**
 * "Puesta en marcha": ruled panel listing the four launch steps. Each step is
 * marked from real data; the panel disappears once every step is done.
 */
export function OwnerSetupChecklistPanel({
  checklist,
  locationName,
}: {
  checklist: OwnerSetupChecklist;
  locationName?: string | null;
}) {
  if (checklist.complete) return null;
  const leadScope = locationName ? `en ${locationName}` : "en tu academia";

  return (
    <section aria-labelledby="owner-setup-title" className={`${ownerUi.card} mt-6 min-w-0`}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h2 id="owner-setup-title" className={ownerUi.sectionTitle}>
          Puesta en marcha
        </h2>
        <span className={`${ownerUi.chip} tabular-nums`}>
          {checklist.completed} de {checklist.total} hechos
        </span>
      </div>
      <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-z-soft">
        Cuatro pasos para pasar la primera lista {leadScope}. Cada paso se marca solo cuando Zaltyko encuentra el dato.
      </p>
      <ol className="mt-4 min-w-0 border-t border-z-line">
        {checklist.steps.map((step, index) => {
          const current = step.key === checklist.currentKey;
          const number = index + 1;
          return (
            <li
              key={step.key}
              aria-current={current ? "step" : undefined}
              className={`group flex min-w-0 flex-col gap-3 border-b border-z-line px-1 py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-5 ${current ? "bg-z-brand-50/60 sm:px-4" : ""}`}
            >
              <div className="flex min-w-0 flex-1 items-start gap-4">
                {current ? (
                  <span aria-hidden="true" className="flex shrink-0 items-baseline font-display font-black tabular-nums">
                    <span className="text-[4.5rem] leading-[0.8] text-z-brand-500 sm:text-[6rem]">{number}</span>
                    <span className="text-[1.875rem] leading-none text-z-soft">/{checklist.total}</span>
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className={`flex w-12 shrink-0 justify-center font-display text-[3rem] font-black leading-none tabular-nums transition-colors ${step.done ? "text-z-line" : "text-z-soft group-hover:text-z-brand-500"}`}
                  >
                    {number}
                  </span>
                )}
                <div className="min-w-0 flex-1 self-center">
                  <p className={`flex min-w-0 flex-wrap items-center gap-2 break-words font-semibold ${step.done ? "text-z-soft" : "text-z-ink"}`}>
                    <span className="min-w-0 [overflow-wrap:anywhere]">{step.title}</span>
                    {step.done ? (
                      <span className={ownerUi.chip}>
                        <Check aria-hidden="true" className="mr-1 h-3.5 w-3.5 text-z-brand-600" />
                        Hecho
                      </span>
                    ) : current ? (
                      <span className={ownerUi.chipAccent}>Siguiente paso</span>
                    ) : (
                      <span className="sr-only">Pendiente</span>
                    )}
                  </p>
                  {step.detail ? (
                    <p className="mt-1 break-words text-sm leading-6 text-z-soft [overflow-wrap:anywhere]">{step.detail}</p>
                  ) : null}
                </div>
              </div>
              {step.href && step.action ? (
                <Link
                  href={step.href}
                  className={`${current ? ownerUi.primaryButton : ownerUi.secondaryButton} w-full shrink-0 sm:w-auto`}
                >
                  {step.action}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
