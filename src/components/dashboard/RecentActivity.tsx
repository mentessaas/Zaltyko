"use client";

import { Clock3, Sparkles } from "lucide-react";

import type { DashboardActivity } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { formatDateTimeForCountry } from "@/lib/date-utils";

interface RecentActivityProps {
  items: DashboardActivity[];
  academyCountry?: string | null;
}

const ACTION_COLORS: Record<string, string> = {
  "athlete.created": "bg-zaltyko-primary/15 text-zaltyko-primary",
  "coach.created": "bg-zaltyko-primary-light/15 text-zaltyko-primary-light",
  "group.created": "bg-red-500/15 text-red-600",
  "assessment.created": "bg-zaltyko-accent/15 text-zaltyko-accent",
  "class.created": "bg-amber-500/15 text-amber-600",
  "notification.created": "bg-blue-500/15 text-blue-600",
  "alert.created": "bg-orange-500/15 text-orange-600",
  "event.created": "bg-red-500/15 text-red-600",
};

export function RecentActivity({ items, academyCountry }: RecentActivityProps) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Actividad reciente
          </p>
          <h3 className="text-lg font-semibold text-foreground">
            {items.length > 0 ? "Últimos movimientos" : "Sin actividad registrada"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Actualizado en tiempo real con tus acciones y las de tu equipo.
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" strokeWidth={1.6} />
        </div>
      </header>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            Empieza a registrar atletas, evaluaciones o grupos para ver el historial aquí.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="group flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50">
              <span
                className={cn(
                  "mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold uppercase tracking-wide",
                  ACTION_COLORS[item.action] ?? "bg-slate-500/10 text-slate-500"
                )}
              >
                {item.userName ? item.userName.slice(0, 1).toUpperCase() : "?"}
              </span>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold text-foreground transition-colors group-hover:text-primary">{item.description}</p>
                <p className="text-xs text-muted-foreground">
                  {item.userName ?? "Sistema"} ·{" "}
                  <Clock3 className="mr-1 inline-block h-3 w-3 align-middle text-muted-foreground/70" />
                  {formatDateTimeForCountry(item.createdAt, academyCountry)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
