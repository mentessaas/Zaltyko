"use client";

import Link from "next/link";
import { CheckSquare, RotateCcw, Square, Users } from "lucide-react";

import { getAthleteStatusLabel, type AthleteStatus } from "@/lib/athletes/constants";
import type { AthleteListItem } from "@/types";
import type { AthleteTerms } from "@/components/athletes/AthletesTableSections";

interface AthletesKanbanViewProps {
  academyId: string;
  athletes: AthleteListItem[];
  selectedAthletes: Set<string>;
  terms: AthleteTerms;
  onEdit: (athlete: AthleteListItem) => void;
  onRestore: (athlete: AthleteListItem) => void;
  onToggleSelect: (id: string) => void;
}

const KANBAN_STATUSES: AthleteStatus[] = ["trial", "active", "inactive", "paused", "archived"];

const STATUS_STYLES: Record<AthleteStatus, string> = {
  trial: "border-zaltyko-indigo/30 bg-zaltyko-indigo/10",
  active: "border-zaltyko-teal/30 bg-zaltyko-teal/10",
  inactive: "border-border bg-muted/50",
  paused: "border-amber-300/50 bg-amber-50",
  archived: "border-slate-300 bg-slate-100",
};

export function AthletesKanbanView({
  academyId,
  athletes,
  selectedAthletes,
  terms,
  onEdit,
  onRestore,
  onToggleSelect,
}: AthletesKanbanViewProps) {

  return (
    <div className="overflow-x-auto pb-2" aria-label={`Vista Kanban de ${terms.athletes.toLowerCase()}`}>
      <div className="grid min-w-[1180px] grid-cols-5 gap-4">
        {KANBAN_STATUSES.map((status) => {
          const statusAthletes = athletes.filter((athlete) => athlete.status === status);
          return (
            <section key={status} className={`min-h-[280px] rounded-2xl border p-3 ${STATUS_STYLES[status]}`}>
              <header className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-foreground">{getAthleteStatusLabel(status)}</h2>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {statusAthletes.length}
                </span>
              </header>

              <div className="space-y-3">
                {statusAthletes.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/80 bg-card/60 p-4 text-center text-xs text-muted-foreground">
                    Sin {terms.athletes.toLowerCase()}
                  </p>
                ) : (
                  statusAthletes.map((athlete) => (
                    <article key={athlete.id} className="rounded-xl border border-border/80 bg-card p-3 shadow-soft">
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleSelect(athlete.id)}
                          className="mt-0.5 shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-zaltyko-teal"
                          aria-label={`${selectedAthletes.has(athlete.id) ? "Deseleccionar" : "Seleccionar"} ${athlete.name}`}
                        >
                          {selectedAthletes.has(athlete.id) ? (
                            <CheckSquare className="h-4 w-4 text-zaltyko-teal" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          {status === "archived" ? (
                            <p className="truncate text-sm font-bold text-foreground">{athlete.name}</p>
                          ) : (
                            <Link
                              href={`/app/${academyId}/athletes/${athlete.id}`}
                              className="block truncate text-sm font-bold text-zaltyko-teal hover:underline"
                            >
                              {athlete.name}
                            </Link>
                          )}
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {athlete.level ?? "Sin nivel"}
                            {athlete.age !== null ? ` · ${athlete.age} años` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                        {athlete.groupName && (
                          <span className="rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground">
                            {athlete.groupName}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {athlete.guardianCount ?? 0}
                        </span>
                      </div>

                      <div className="mt-3 flex justify-end">
                        {status === "archived" ? (
                          <button
                            type="button"
                            onClick={() => onRestore(athlete)}
                            className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-zaltyko-teal hover:bg-zaltyko-teal/10"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restaurar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onEdit(athlete)}
                            className="min-h-8 rounded-lg px-2 text-xs font-semibold text-zaltyko-teal hover:bg-zaltyko-teal/10"
                          >
                            Editar ficha
                          </button>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
