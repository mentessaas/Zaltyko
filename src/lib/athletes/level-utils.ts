import type { CategoryOption, LevelOption, ParsedLevel } from "@/types/athlete-edit";
import { CATEGORY_OPTIONS, LEVEL_OPTIONS } from "@/types/athlete-edit";
import { calculateAge } from "@/lib/date-utils";

export function formatDob(value: string | null): string {
  if (!value) return "";
  if (value.length >= 10) {
    return value.slice(0, 10);
  }
  return "";
}

export function parseLevel(rawLevel: string | null): ParsedLevel {
  if (!rawLevel) {
    return { category: "", level: "" };
  }

  const categoryMatch = rawLevel.match(/Categoría\s([A-F])/i);
  const levelMatch = rawLevel.match(/Nivel\s(\d+)|FIG|Pre-nivel/i);

  let parsedCategory: CategoryOption | "" = "";
  let parsedLevel: LevelOption | "" = "";

  if (categoryMatch && CATEGORY_OPTIONS.includes(categoryMatch[1].toUpperCase() as CategoryOption)) {
    parsedCategory = categoryMatch[1].toUpperCase() as CategoryOption;
  }

  if (levelMatch) {
    const value = levelMatch[0];
    if (/FIG/i.test(value)) {
      parsedLevel = "FIG";
    } else if (/Pre-nivel/i.test(value)) {
      parsedLevel = "Pre-nivel";
    } else if (value.match(/Nivel\s(\d+)/i)) {
      const num = value.match(/Nivel\s(\d+)/i)?.[1];
      if (num && LEVEL_OPTIONS.includes(num as LevelOption)) {
        parsedLevel = num as LevelOption;
      }
    }
  }

  return { category: parsedCategory, level: parsedLevel };
}

export function composeLevelLabel(
  category: CategoryOption | "",
  level: LevelOption | ""
): string | null {
  if (!category && !level) return null;
  const parts: string[] = [];
  if (category) parts.push(`Categoría ${category}`);
  if (level) {
    if (level === "Pre-nivel") parts.push("Pre-nivel");
    else if (level === "FIG") parts.push("FIG");
    else parts.push(`Nivel ${level}`);
  }
  return parts.join(" · ") || null;
}

/**
 * Calculate age from date of birth string.
 * @deprecated Use calculateAge from @/lib/date-utils instead
 */
export function calculateAgeFromString(dob: string | null): number | null {
  if (!dob) return null;
  const age = calculateAge(dob);
  return age >= 0 ? age : null;
}

export function formatAge(ageYears: number | null): string {
  return ageYears != null ? `${ageYears} años` : "";
}

