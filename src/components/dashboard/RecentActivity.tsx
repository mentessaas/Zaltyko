"use client";

import { Clock3, Sparkles } from "lucide-react";

import type { DashboardActivity } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

interface RecentActivityProps {
  items: DashboardActivity[];
}

const ACTION_COLORS: Record<string, string> = {
  "athlete.created": "bg-zaltyko-primary/15 text-zaltyko-primary",
  "coach.created": "bg-zaltyko-primary-light/15 text-zaltyko-primary-light",
  "group.created": "bg-violet-500/15 text-violet-600",
  "assessment.created": "bg-zaltyko-accent/15 text-zaltyko-accent",
};

export function RecentActivity({ items }: RecentActivityProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/90">
            Actividad reciente
          </p>
          <h3 className="text-lg font-semibold text-foreground">
            {items.length > 0 ? "Últimos movimientos" : "Sin actividad registrada"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Actualizado en tiempo real con tus acciones y las de tu equipo.
          </p>
        </div>
        <Sparkles className="h-5 w-5 text-muted-foreground/60" strokeWidth={1.6} />
      </header>

      <div className="space-y-4">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/40 px-4 py-5 text-sm text-muted-foreground">
            Empieza a registrar atletas, evaluaciones o grupos para ver el historial aquí.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-1 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase tracking-wide",
                  ACTION_COLORS[item.action] ?? "bg-slate-500/10 text-slate-500"
                )}
              >
                {item.userName ? item.userName.slice(0, 1).toUpperCase() : "?"}
              </span>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">{item.description}</p>
                <p className="text-xs text-muted-foreground">
                  {item.userName ?? "Sistema"} ·{" "}
                  <Clock3 className="mr-1 inline-block h-3 w-3 align-middle text-muted-foreground/70" />
                  {new Date(item.createdAt).toLocaleString("es-ES", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

