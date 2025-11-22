"use client";

import Link from "next/link";

import { GroupSummary } from "./types";

interface GroupCardProps {
  academyId: string;
  group: GroupSummary;
  onEdit?: (group: GroupSummary) => void;
}

export function GroupCard({ academyId, group, onEdit }: GroupCardProps) {
  const coachCount = (group.coachId ? 1 : 0) + group.assistantIds.length;
  const createdAtDate = new Date(group.createdAt).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <header>
        <h3 className="text-lg font-semibold text-foreground">{group.name}</h3>
        <p className="text-sm text-muted-foreground">{group.discipline}</p>
      </header>

      <div className="space-y-2 text-sm">
        <div>
          <span className="text-muted-foreground">Entrenador principal: </span>
          <span className="font-medium text-foreground">{group.coachName ?? "Sin asignar"}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            {group.athleteCount} {group.athleteCount === 1 ? "atleta" : "atletas"}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Creado {createdAtDate}</span>
        </div>
      </div>

      <footer className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {coachCount} {coachCount === 1 ? "entrenador" : "entrenadores"} · {group.athleteCount} {group.athleteCount === 1 ? "atleta" : "atletas"}
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
