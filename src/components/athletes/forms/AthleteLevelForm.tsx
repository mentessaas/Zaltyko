"use client";

import { athleteStatusOptions } from "@/lib/athletes/constants";
import { CATEGORY_OPTIONS, LEVEL_OPTIONS } from "@/types/athlete-edit";
import type { CategoryOption, LevelOption } from "@/types/athlete-edit";

interface AthleteLevelFormProps {
  category: CategoryOption | "";
  level: LevelOption | "";
  status: (typeof athleteStatusOptions)[number];
  onCategoryChange: (value: CategoryOption | "") => void;
  onLevelChange: (value: LevelOption | "") => void;
  onStatusChange: (value: (typeof athleteStatusOptions)[number]) => void;
}

export function AthleteLevelForm({
  category,
  level,
  status,
  onCategoryChange,
  onLevelChange,
  onStatusChange,
}: AthleteLevelFormProps) {
  return (
    <section className="rounded-xl border border-border/80 bg-card/40 p-5 shadow-sm">
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Nivel competitivo
        </p>
        <h3 className="text-base font-semibold text-foreground">Categoría, nivel y estado</h3>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Categoría</label>
          <select
            value={category}
            onChange={(event) =>
              onCategoryChange(event.target.value as CategoryOption | "")
            }
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Sin categoría</option>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Nivel</label>
          <select
            value={level}
            onChange={(event) =>
              onLevelChange(event.target.value as LevelOption | "")
            }
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Selecciona nivel</option>
            {LEVEL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "Pre-nivel" ? "Pre-nivel" : option === "FIG" ? "FIG" : `Nivel ${option}`}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Estado</label>
          <select
            value={status}
            onChange={(event) =>
              onStatusChange(event.target.value as (typeof athleteStatusOptions)[number])
            }
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {athleteStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}

