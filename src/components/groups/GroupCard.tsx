"use client";

import Link from "next/link";

import { GroupSummary } from "./types";

interface GroupCardProps {
  academyId: string;
  group: GroupSummary;
}

export function GroupCard({ academyId, group }: GroupCardProps) {
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{group.name}</h3>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {group.discipline} {group.level ? `· ${group.level}` : ""}
          </p>
        </div>
        {group.color && (
          <span
            className="h-6 w-6 rounded-full border border-border"
            style={{ backgroundColor: group.color }}
            aria-label={`Color identificador ${group.color}`}
          />
        )}
      </header>

      <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide">Entrenador principal</dt>
          <dd className="font-medium text-foreground">{group.coachName ?? "Sin asignar"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide">Atletas</dt>
          <dd className="font-medium text-foreground">{group.athleteCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide">Asistentes</dt>
          <dd className="font-medium text-foreground">
            {group.assistantNames.length
              ? group.assistantNames.join(", ")
              : "Sin asistentes"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide">Creado</dt>
          <dd>{new Date(group.createdAt).toLocaleDateString("es-ES")}</dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {(group.coachId ? 1 : 0) + group.assistantIds.length} entrenadores · {group.athleteCount} atletas
        </span>
        <Link
          href={`/app/${academyId}/groups/${group.id}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Ver grupo
        </Link>
      </div>
    </article>
  );
}
