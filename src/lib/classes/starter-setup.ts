import type { AcademySpecializationContext } from "@/lib/specialization/registry";
import { getStarterClassPresets, getStarterGroupPresets } from "@/lib/specialization/operational-presets";

export interface StarterSetupClassLike {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  coaches: Array<{ id: string }>;
  groups: Array<{ id: string }>;
}

export interface StarterSetupClassSummaryItem {
  id: string;
  name: string;
  issues: string[];
  isReady: boolean;
}

export interface StarterSetupSummary {
  starterClassCount: number;
  expectedStarterClassCount: number;
  readyCount: number;
  missingCoachCount: number;
  flexibleScheduleCount: number;
  missingCapacityCount: number;
  missingGroupCount: number;
  missingTemplateCount: number;
  completionPercentage: number;
  items: StarterSetupClassSummaryItem[];
  missingTemplateNames: string[];
}

export function summarizeStarterClassSetup(
  specialization: AcademySpecializationContext,
  classes: StarterSetupClassLike[]
): StarterSetupSummary {
  const starterPresets = getStarterClassPresets(specialization, getStarterGroupPresets(specialization));
  const starterClassNames = new Set(starterPresets.map((preset) => preset.name));
  const starterClasses = classes.filter((item) => starterClassNames.has(item.name));

  const items = starterClasses.map<StarterSetupClassSummaryItem>((item) => {
    const issues: string[] = [];

    if (item.coaches.length === 0) {
      issues.push("Sin responsable asignado");
    }

    if (!item.capacity || item.capacity <= 0) {
      issues.push("Sin aforo definido");
    }

    if (item.groups.length === 0) {
      issues.push("Sin grupo vinculado");
    }

    if (item.weekdays.length === 0 || !item.startTime || !item.endTime) {
      issues.push("Horario pendiente");
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
    .filter((name) => !starterClasses.some((item) => item.name === name));

  const readyCount = items.filter((item) => item.isReady).length;
  const completionBase = starterPresets.length || 1;

  return {
    starterClassCount: starterClasses.length,
    expectedStarterClassCount: starterPresets.length,
    readyCount,
    missingCoachCount: items.filter((item) => item.issues.includes("Sin responsable asignado")).length,
    flexibleScheduleCount: items.filter((item) => item.issues.includes("Horario pendiente")).length,
    missingCapacityCount: items.filter((item) => item.issues.includes("Sin aforo definido")).length,
    missingGroupCount: items.filter((item) => item.issues.includes("Sin grupo vinculado")).length,
    missingTemplateCount: missingTemplateNames.length,
    completionPercentage: Math.round((readyCount / completionBase) * 100),
    items,
    missingTemplateNames,
  };
}
