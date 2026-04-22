import type { AcademySpecializationContext } from "@/lib/specialization/registry";
import { getStarterGroupPresets } from "@/lib/specialization/operational-presets";

export interface StarterSetupGroupLike {
  id: string;
  name: string;
  level: string | null;
  coachId: string | null;
  athleteCount: number;
}

export interface StarterSetupGroupSummaryItem {
  id: string;
  name: string;
  issues: string[];
  isReady: boolean;
}

export interface StarterGroupSetupSummary {
  starterGroupCount: number;
  expectedStarterGroupCount: number;
  readyCount: number;
  missingCoachCount: number;
  missingLevelCount: number;
  emptyGroupCount: number;
  missingTemplateCount: number;
  completionPercentage: number;
  items: StarterSetupGroupSummaryItem[];
  missingTemplateNames: string[];
}

export function summarizeStarterGroupSetup(
  specialization: AcademySpecializationContext,
  groups: StarterSetupGroupLike[]
): StarterGroupSetupSummary {
  const starterPresets = getStarterGroupPresets(specialization);
  const starterGroupNames = new Set(starterPresets.map((preset) => preset.name));
  const starterGroups = groups.filter((item) => starterGroupNames.has(item.name));

  const items = starterGroups.map<StarterSetupGroupSummaryItem>((item) => {
    const issues: string[] = [];

    if (!item.coachId) {
      issues.push("Sin responsable asignado");
    }

    if (!item.level || item.level.trim().length === 0) {
      issues.push("Nivel pendiente");
    }

    if (item.athleteCount === 0) {
      issues.push("Sin gimnastas asignadas");
    }

    return {
      id: item.id,
      name: item.name,
      issues,
      isReady: issues.length === 0,
    };
  });

  const missingTemplateNames = starterPresets
    .map((preset) => preset.name)
    .filter((name) => !starterGroups.some((item) => item.name === name));

  const readyCount = items.filter((item) => item.isReady).length;
  const completionBase = starterPresets.length || 1;

  return {
    starterGroupCount: starterGroups.length,
    expectedStarterGroupCount: starterPresets.length,
    readyCount,
    missingCoachCount: items.filter((item) => item.issues.includes("Sin responsable asignado")).length,
    missingLevelCount: items.filter((item) => item.issues.includes("Nivel pendiente")).length,
    emptyGroupCount: items.filter((item) => item.issues.includes("Sin gimnastas asignadas")).length,
    missingTemplateCount: missingTemplateNames.length,
    completionPercentage: Math.round((readyCount / completionBase) * 100),
    items,
    missingTemplateNames,
  };
}
