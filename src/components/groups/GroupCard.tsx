"use client";

import Link from "next/link";

import { GroupSummary } from "./types";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getStarterGroupPresets } from "@/lib/specialization/operational-presets";

interface GroupCardProps {
  academyId: string;
  group: GroupSummary;
  onEdit?: (group: GroupSummary) => void;
}

export function GroupCard({ academyId, group, onEdit }: GroupCardProps) {
  const { specialization } = useAcademyContext();
  const coachCount = (group.coachId ? 1 : 0) + group.assistantIds.length;
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
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <header>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-foreground">{group.name}</h3>
          {isStarterGroup && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              Plantilla inicial
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {group.level ? `${specialization.labels.levelLabel}: ${group.level}` : specialization.labels.disciplineName}
        </p>
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
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground"
                >
                  {apparatusLabels[item] || item}
                </span>
              ))}
              {(group.sessionBlocks ?? []).slice(0, 2).map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            {group.athleteCount} {group.athleteCount === 1 ? specialization.labels.athleteSingular.toLowerCase() : specialization.labels.athletesPlural.toLowerCase()}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Creado {createdAtDate}</span>
        </div>
      </div>

      <footer className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {coachCount} {coachCount === 1 ? specialization.labels.coachLabel.toLowerCase() : `${specialization.labels.coachLabel.toLowerCase()}es`} · {group.athleteCount} {group.athleteCount === 1 ? specialization.labels.athleteSingular.toLowerCase() : specialization.labels.athletesPlural.toLowerCase()}
        </span>
        <div className="flex items-center gap-3">
          {onEdit && (
            <button
              onClick={() => onEdit(group)}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Editar
            </button>
          )}
          <Link
            href={`/app/${academyId}/groups/${group.id}`}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Ver grupo
          </Link>
        </div>
      </footer>
    </article>
  );
}
