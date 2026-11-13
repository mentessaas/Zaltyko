"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";

import type { OwnerSetupChecklist } from "@/modules/owner-dashboard/application/setup-checklist-steps";
import { ownerUi } from "./owner-ui";

/**
 * «Puesta en marcha» con el formato de /app (DashboardOnboardingPanel): el
 * número del paso actual manda a tamaño de rótulo de pista, debajo «Paso N de
 * M · X % completado» con su barra, la acción del paso a la derecha y los
 * pendientes desplegables en una lista reglada. Cada paso se marca solo con
 * datos reales; el panel desaparece cuando están todos hechos.
 */
export function OwnerSetupChecklistPanel({
  checklist,
  locationName,
}: {
  checklist: OwnerSetupChecklist;
  locationName?: string | null;
}) {
  const [showPending, setShowPending] = useState(false);
  const pendingListId = useId();
  if (checklist.complete) return null;

  const leadScope = locationName ? `en ${locationName}` : "en tu academia";
  const currentIndex = Math.max(
    0,
    checklist.steps.findIndex((step) => step.key === checklist.currentKey)
  );
  const current = checklist.steps[currentIndex];
  const currentNumber = currentIndex + 1;
  const percent = checklist.total > 0 ? Math.round((checklist.completed / checklist.total) * 100) : 0;
  const pendingSteps = checklist.steps
    .map((step, index) => ({ step, number: index + 1 }))
    .filter(({ step }) => !step.done);

  return (
    <section aria-labelledby="owner-setup-title" className={`${ownerUi.cardFlush} mt-6 min-w-0`}>
      <div className="flex min-w-0 flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-7 sm:p-6">
        <p
          aria-hidden="true"
          className="shrink-0 font-display text-[4.5rem] font-black leading-[0.8] tabular-nums text-z-brand-500 sm:text-8xl"
        >
          {currentNumber}
          <span className="text-3xl text-z-soft">/{checklist.total}</span>
        </p>
        <div className="min-w-0 flex-1">
          <h2 id="owner-setup-title" className={ownerUi.sectionTitle}>
            Puesta en marcha
          </h2>
          <p className="mt-1 text-sm tabular-nums text-z-soft">
            Paso {currentNumber} de {checklist.total} · {percent}% completado
          </p>
          <div
            role="progressbar"
            aria-label="Progreso de la puesta en marcha"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${checklist.completed} de ${checklist.total} pasos hechos`}
            className={`mt-3 ${ownerUi.meterTrack}`}
          >
            <div className="h-full bg-z-brand-500" style={{ width: `${percent}%` }} />
          </div>
          {current ? (
            <div className="mt-4 min-w-0" aria-current="step">
              <p className="break-words font-semibold text-z-ink [overflow-wrap:anywhere]">
                <span className="sr-only">Siguiente paso: </span>
                {current.title}
              </p>
              {current.detail ? (
                <p className="mt-1 break-words text-sm leading-6 text-z-soft [overflow-wrap:anywhere]">{current.detail}</p>
              ) : null}
            </div>
          ) : null}
          <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-z-soft">
            Cuatro pasos para pasar la primera lista {leadScope}. Cada paso se marca solo cuando Zaltyko encuentra el dato.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          {current?.href && current.action ? (
            <Link href={current.href} className={`${ownerUi.primaryButton} w-full sm:w-auto`}>
              {current.action}
            </Link>
          ) : null}
          {pendingSteps.length > 1 ? (
            <button
              type="button"
              onClick={() => setShowPending((value) => !value)}
              aria-expanded={showPending}
              aria-controls={pendingListId}
              className={`${ownerUi.secondaryButton} w-full sm:w-auto`}
            >
              {showPending ? "Ocultar pasos" : `Ver ${pendingSteps.length} pendientes`}
              {showPending ? (
                <ChevronUp aria-hidden="true" className="h-4 w-4" />
              ) : (
                <ChevronDown aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          ) : null}
        </div>
      </div>

      {showPending ? (
        <ol id={pendingListId} aria-label="Pasos pendientes" className="border-t border-z-line">
          {pendingSteps.map(({ step, number }) => {
            const isCurrent = step.key === checklist.currentKey;
            return (
              <li
                key={step.key}
                aria-current={isCurrent ? "step" : undefined}
                className={`group flex min-w-0 flex-col gap-3 border-b border-z-line px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-5 ${isCurrent ? "bg-z-brand-50/60" : ""}`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-5">
                  <span
                    aria-hidden="true"
                    className="w-12 shrink-0 text-center font-display text-5xl font-black leading-none tabular-nums text-ramp-400 transition-colors group-hover:text-z-brand-500"
                  >
                    {number}
                  </span>
                  <div className="min-w-0 flex-1 self-center">
                    <p className="flex min-w-0 flex-wrap items-center gap-2 break-words font-semibold text-z-ink">
                      <span className="min-w-0 [overflow-wrap:anywhere]">{step.title}</span>
                      {isCurrent ? <span className={ownerUi.chipAccent}>Siguiente paso</span> : null}
                    </p>
                    {step.detail ? (
                      <p className="mt-0.5 break-words text-sm leading-6 text-z-soft [overflow-wrap:anywhere]">{step.detail}</p>
                    ) : null}
                  </div>
                </div>
                {!isCurrent && step.href && step.action ? (
                  <Link href={step.href} className={`${ownerUi.secondaryButton} w-full shrink-0 sm:w-auto`}>
                    {step.action}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
