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
    <div className="space-y-4 rounded-2xl border border-zaltyko-border/40 bg-gradient-to-br from-white via-white to-zaltyko-primary/5 p-6 shadow-lg shadow-zaltyko-primary/5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-zaltyko-text-secondary/80">
            Actividad reciente
          </p>
          <h3 className="text-lg font-bold text-zaltyko-text-main">
            {items.length > 0 ? "Últimos movimientos" : "Sin actividad registrada"}
          </h3>
          <p className="text-xs text-zaltyko-text-secondary mt-1">
            Actualizado en tiempo real con tus acciones y las de tu equipo.
          </p>
        </div>
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-zaltyko-primary/20 to-zaltyko-primary/5 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-zaltyko-primary" strokeWidth={1.6} />
        </div>
      </header>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-zaltyko-border/50 bg-zaltyko-bg/50 px-4 py-6 text-sm text-zaltyko-text-secondary text-center">
            Empieza a registrar atletas, evaluaciones o grupos para ver el historial aquí.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-zaltyko-primary/5 transition-colors group">
              <span
                className={cn(
                  "mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold uppercase tracking-wide shadow-md",
                  ACTION_COLORS[item.action] ?? "bg-slate-500/10 text-slate-500"
                )}
              >
                {item.userName ? item.userName.slice(0, 1).toUpperCase() : "?"}
              </span>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold text-zaltyko-text-main group-hover:text-zaltyko-primary transition-colors">{item.description}</p>
                <p className="text-xs text-zaltyko-text-secondary">
                  {item.userName ?? "Sistema"} ·{" "}
                  <Clock3 className="mr-1 inline-block h-3 w-3 align-middle text-zaltyko-text-secondary/70" />
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

