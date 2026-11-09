"use client";

import Link from "next/link";

import { GroupSummary } from "./types";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getStarterGroupPresets } from "@/lib/specialization/operational-presets";
import { pluralizeFirstWord } from "@/lib/specialization/registry";

interface GroupCardProps {
  academyId: string;
  group: GroupSummary;
  sportConfigLabel?: string | null;
  onEdit?: (group: GroupSummary) => void;
}

export function GroupCard({ academyId, group, sportConfigLabel, onEdit }: GroupCardProps) {
  const { specialization } = useAcademyContext();
  const coachCount = (group.coachId ? 1 : 0) + group.assistantIds.length;
  const coachLabelPlural = pluralizeFirstWord(specialization.labels.coachLabel).toLowerCase();
  const apparatusLabels = Object.fromEntries(
    specialization.evaluation.apparatus.map((item) => [item.code, item.label])
  );
  const createdAtDate = new Date(group.createdAt).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const starterGroupNames = new Set(
    getStarterGroupPresets(specialization).map((preset) => preset.name)
  );
  const isStarterGroup = starterGroupNames.has(group.name);

  return (
    <article className="group relative flex flex-col gap-4 overflow-hidden rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white p-5 transition-colors duration-150 hover:border-t-mat">
      <header>
        <div className="flex items-center gap-2">
          <h3 className="font-display text-2xl font-extrabold uppercase leading-tight text-mat-night">{group.name}</h3>
          {isStarterGroup && (
            <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              Plantilla inicial
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {group.level ? `${specialization.labels.levelLabel}: ${group.level}` : specialization.labels.disciplineName}
        </p>
        {sportConfigLabel && (
          <span className="mt-2 inline-flex rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {sportConfigLabel}
          </span>
        )}
      </header>

      <div className="space-y-3 text-sm">
        <div>
          <span className="text-muted-foreground">{specialization.labels.coachLabel} principal: </span>
          <span className="font-medium text-foreground">{group.coachName ?? "Sin asignar"}</span>
        </div>
        {(group.technicalFocus || (group.apparatus?.length ?? 0) > 0 || (group.sessionBlocks?.length ?? 0) > 0) && (
          <div className="space-y-2">
            {group.technicalFocus && (
              <p className="text-muted-foreground">{group.technicalFocus}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {(group.apparatus ?? []).map((item) => (
                <span
                  key={item}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {apparatusLabels[item] || item}
                </span>
              ))}
              {(group.sessionBlocks ?? []).slice(0, 2).map((item) => (
                <span
                  key={item}
                  className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
        {/* Métricas en una fila de dos celdas (patrón de los bloques
            stats de @blocks-so hallados con ui-indexador) en lugar de
            repetir el recuento en el cuerpo y en una pastilla del pie. */}
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
          <div className="bg-card px-3 py-2">
            <dt className="text-xs text-muted-foreground">
              {group.athleteCount === 1
                ? specialization.labels.athleteSingular
                : specialization.labels.athletesPlural}
            </dt>
            <dd className="font-display text-3xl font-black tabular-nums text-mat-night">{group.athleteCount}</dd>
          </div>
          <div className="bg-card px-3 py-2">
            <dt className="text-xs capitalize text-muted-foreground">
              {coachCount === 1 ? specialization.labels.coachLabel.toLowerCase() : coachLabelPlural}
            </dt>
            <dd className="font-display text-3xl font-black tabular-nums text-mat-night">{coachCount}</dd>
          </div>
        </dl>
      </div>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-4">
        <span className="whitespace-nowrap text-xs text-muted-foreground">Creado {createdAtDate}</span>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(group)}
              className="min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              Editar
            </button>
          )}
          <Link
            href={`/app/${academyId}/groups/${group.id}`}
            className="inline-flex min-h-9 items-center whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            Ver grupo
          </Link>
        </div>
      </footer>
    </article>
  );
}
