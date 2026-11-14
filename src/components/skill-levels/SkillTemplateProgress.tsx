import type { ReactNode } from "react";

import {
  apparatusLabel,
  elementStatusLabels,
  skillDisciplineLabels,
  type ElementStateView,
  type ElementStatus,
  type LevelStateView,
  type TemplateProgressView,
} from "@/modules/skill-levels/domain/skill-levels";

import { ownerUi } from "@/components/owner-dashboard/owner-ui";

/**
 * Progreso de una gimnasta frente a una plantilla de niveles, de solo lectura.
 * Lo usan la ficha del equipo (con acciones por elemento y por nivel) y la
 * sección de /familia (sin acciones). Sin estado ni efectos: se puede pintar
 * en servidor y en cliente.
 */

const statusChip: Record<ElementStatus, string> = {
  not_started: ownerUi.chip,
  in_progress: ownerUi.chipAccent,
  achieved: ownerUi.chipSuccess,
};

export function ElementStatusChip({ status }: { status: ElementStatus }) {
  return <span className={statusChip[status]}>{elementStatusLabels[status]}</span>;
}

export function ProgressMeter({ percent, label }: { percent: number; label: string }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
      className={ownerUi.meterTrack}
    >
      <div className="h-full rounded-sm bg-z-brand-500" style={{ width: `${value}%` }} />
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function levelStateLabel(level: LevelStateView): string {
  if (level.passed) return `Superado el ${formatDate(level.passed.passedOn)}`;
  if (level.current) return "Nivel actual";
  return "Pendiente";
}

export function SkillTemplateProgress({
  progress,
  diplomaHrefFor,
  renderElementActions,
  renderLevelActions,
  headingLevel = 3,
}: {
  progress: TemplateProgressView;
  /** Enlace al diploma de un paso de nivel. Sin él no se muestra el diploma. */
  diplomaHrefFor?: (passId: string) => string;
  renderElementActions?: (element: ElementStateView, level: LevelStateView) => ReactNode;
  renderLevelActions?: (level: LevelStateView) => ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const current = progress.levels.find((level) => level.current) ?? null;
  return (
    <section className="grid gap-4" aria-label={`Progreso en ${progress.template.name}`}>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Heading className="min-w-0 break-words font-display text-lg font-black uppercase leading-none text-z-ink">
            {progress.template.name}
          </Heading>
          <p className={ownerUi.help}>{skillDisciplineLabels[progress.template.discipline]}</p>
        </div>
        <ProgressMeter percent={progress.overallPercent} label={`Progreso total en ${progress.template.name}`} />
        <p className={ownerUi.help}>
          {progress.finished
            ? "Todos los niveles superados."
            : current
              ? `Trabaja en «${current.name}» · ${progress.overallPercent} % del recorrido`
              : "Esta plantilla no tiene niveles activos."}
          {progress.readyToPass && current ? ` · Listo para pasar de nivel.` : ""}
          {progress.template.archived ? " · Plantilla archivada." : ""}
        </p>
      </div>

      {progress.apparatus.length > 1 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Elementos conseguidos por aparato">
          {progress.apparatus.map((entry) => (
            <li key={entry.apparatus ?? "general"} className={ownerUi.chip}>
              {apparatusLabel(entry.apparatus)}: {entry.achieved}/{entry.total}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-3">
        {progress.levels.map((level) => (
          <details
            key={level.id}
            open={level.current}
            className={`${ownerUi.listItem} group`}
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 break-words font-semibold text-z-ink">{level.name}</span>
              <span className="flex flex-wrap items-center gap-2">
                <span className={level.passed ? ownerUi.chipSuccess : level.current ? ownerUi.chipAccent : ownerUi.chip}>
                  {levelStateLabel(level)}
                </span>
                <span className={ownerUi.help}>
                  {level.completion.achievedRequired}/{level.completion.requiredElements} obligatorios
                </span>
              </span>
            </summary>
            <div className="mt-3 grid gap-3">
              {level.description ? <p className={ownerUi.help}>{level.description}</p> : null}
              <ProgressMeter percent={level.completion.percent} label={`Progreso en ${level.name}`} />
              {level.elements.length === 0 ? (
                <p className={ownerUi.muted}>Este nivel todavía no tiene elementos.</p>
              ) : (
                <ul className="grid gap-2">
                  {level.elements.map((element) => (
                    <li key={element.id} className="grid gap-2 border-t border-z-line pt-2 first:border-t-0 first:pt-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-z-ink">{element.name}</p>
                          <p className={ownerUi.help}>
                            {apparatusLabel(element.apparatus)}
                            {element.required ? "" : " · Opcional"}
                            {element.state.status === "achieved" && element.state.achievedOn
                              ? ` · ${formatDate(element.state.achievedOn)}`
                              : ""}
                            {element.state.evaluatedByName && element.state.status !== "not_started"
                              ? ` · ${element.state.evaluatedByName}`
                              : ""}
                          </p>
                        </div>
                        <ElementStatusChip status={element.state.status} />
                      </div>
                      {renderElementActions ? renderElementActions(element, level) : null}
                    </li>
                  ))}
                </ul>
              )}
              {level.passed && diplomaHrefFor ? (
                <a href={diplomaHrefFor(level.passed.id)} className={ownerUi.textLink} target="_blank" rel="noreferrer">
                  Ver diploma de «{level.name}»
                </a>
              ) : null}
              {renderLevelActions ? renderLevelActions(level) : null}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
