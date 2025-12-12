"use client";

import Link from "next/link";
import { Users2 } from "lucide-react";

import type { DashboardGroupSummary } from "@/lib/dashboard";

interface GroupsOverviewProps {
  groups: DashboardGroupSummary[];
  academyId: string;
}

const DISCIPLINE_LABELS: Record<string, string> = {
  artistica: "Gimnasia artística",
  ritmica: "Gimnasia rítmica",
  trampolin: "Trampolín",
  general: "General",
};

export function GroupsOverview({ groups, academyId }: GroupsOverviewProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/90">
            Grupos activos
          </p>
          <h3 className="text-lg font-semibold text-foreground">
            {groups.length > 0 ? "Resumen de grupos" : "Sin grupos registrados"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Vista rápida de los grupos con más actividad y sus responsables.
          </p>
        </div>
        <Link
          href={`/app/${academyId}/groups`}
          className="text-xs font-semibold text-primary transition hover:underline"
        >
          Gestionar grupos
        </Link>
      </header>

      <div className="space-y-3">
        {groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
            Aún no has creado grupos. Configura uno para organizar a tus atletas y entrenadores.
          </div>
        ) : (
          groups.map((group) => (
            <div
              key={group.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-semibold text-foreground">{group.name}</p>
                <p className="text-xs text-muted-foreground">
                  {DISCIPLINE_LABELS[group.discipline] ?? "Disciplina general"}
                </p>
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                  <Users2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                  {group.athleteCount} atletas
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Coach principal</p>
                <p className="font-medium text-foreground">
                  {group.coachName ?? "Sin asignar"}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

