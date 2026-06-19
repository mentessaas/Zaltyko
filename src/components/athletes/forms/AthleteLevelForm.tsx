"use client";

import { athleteStatusOptions } from "@/lib/athletes/constants";
import { CATEGORY_OPTIONS, LEVEL_OPTIONS } from "@/types/athlete-edit";
import type { CategoryOption, LevelOption } from "@/types/athlete-edit";
import type { SportConfigOption } from "@/components/groups/types";

interface SelectOption {
  code: string;
  name: string;
}

interface AthleteLevelFormProps {
  sportConfigId?: string;
  sportConfigs?: SportConfigOption[];
  programCode?: string;
  programOptions?: SelectOption[];
  category: CategoryOption | "";
  level: LevelOption | "";
  status: (typeof athleteStatusOptions)[number];
  categoryOptions?: SelectOption[];
  levelOptions?: SelectOption[];
  categoryLabel?: string;
  levelLabel?: string;
  onSportConfigChange?: (value: string) => void;
  onProgramChange?: (value: string) => void;
  onCategoryChange: (value: CategoryOption | "") => void;
  onLevelChange: (value: LevelOption | "") => void;
  onStatusChange: (value: (typeof athleteStatusOptions)[number]) => void;
}

export function AthleteLevelForm({
  sportConfigId = "",
  sportConfigs = [],
  programCode = "",
  programOptions = [],
  category,
  level,
  status,
  categoryOptions,
  levelOptions,
  categoryLabel = "Categoría",
  levelLabel = "Nivel",
  onSportConfigChange,
  onProgramChange,
  onCategoryChange,
  onLevelChange,
  onStatusChange,
}: AthleteLevelFormProps) {
  const effectiveCategoryOptions =
    categoryOptions ?? CATEGORY_OPTIONS.map((option) => ({ code: option, name: option }));
  const effectiveLevelOptions =
    levelOptions ??
    LEVEL_OPTIONS.map((option) => ({
      code: option,
      name: option === "Pre-nivel" ? "Pre-nivel" : option === "FIG" ? "FIG" : `Nivel ${option}`,
    }));

  return (
    <section className="rounded-xl border border-border/80 bg-card/40 p-5 shadow-sm">
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Nivel competitivo
        </p>
        <h3 className="text-base font-semibold text-foreground">{categoryLabel}, {levelLabel.toLowerCase()} y estado</h3>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {sportConfigs.length > 0 && onSportConfigChange && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Modalidad / rama</label>
            <select
              value={sportConfigId}
              onChange={(event) => onSportConfigChange(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Sin asignar</option>
              {sportConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.disciplineName} · {config.branchName}
                </option>
              ))}
            </select>
          </div>
        )}
        {programOptions.length > 0 && onProgramChange && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Programa</label>
            <select
              value={programCode}
              onChange={(event) => onProgramChange(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Sin programa</option>
              {programOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">{categoryLabel}</label>
          <select
            value={category}
            onChange={(event) =>
              onCategoryChange(event.target.value as CategoryOption | "")
            }
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Sin {categoryLabel.toLowerCase()}</option>
            {effectiveCategoryOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">{levelLabel}</label>
          <select
            value={level}
            onChange={(event) =>
              onLevelChange(event.target.value as LevelOption | "")
            }
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Selecciona {levelLabel.toLowerCase()}</option>
            {effectiveLevelOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
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
