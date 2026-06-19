import type { SportTerminology, TerminologyKey } from "@/lib/sport-config/catalog";
import { TERMINOLOGY_KEYS } from "@/lib/sport-config/catalog";

export type TerminologySource = {
  terminology?: Partial<Record<TerminologyKey, string>> | Record<string, string> | null;
};

export const DEFAULT_TERMINOLOGY: SportTerminology = {
  athlete: "Atleta",
  athletes: "Atletas",
  group: "Grupo",
  groups: "Grupos",
  coach: "Entrenador/a",
  parent: "Familiar",
  apparatus: "Aparato",
  level: "Nivel",
  category: "Categoría",
  routine: "Ejercicio",
  competition: "Competición",
  payment: "Pago",
  attendance: "Asistencia",
  license: "Licencia",
  team: "Equipo",
  branch: "Rama",
};

export const TERMINOLOGY_KEY_LABELS: Record<TerminologyKey, string> = {
  athlete: "Persona deportista singular",
  athletes: "Personas deportistas plural",
  group: "Grupo singular",
  groups: "Grupos plural",
  coach: "Entrenador/a",
  parent: "Familiar o responsable",
  apparatus: "Aparato",
  level: "Nivel",
  category: "Categoría",
  routine: "Ejercicio o rutina",
  competition: "Competición",
  payment: "Pago",
  attendance: "Asistencia",
  license: "Licencia",
  team: "Equipo o conjunto",
  branch: "Rama",
};

export function getTerminologyTerm(
  source: TerminologySource | null | undefined,
  key: TerminologyKey
) {
  return source?.terminology?.[key] || DEFAULT_TERMINOLOGY[key];
}

export function getTerminology(
  source: TerminologySource | null | undefined
): SportTerminology {
  return {
    ...DEFAULT_TERMINOLOGY,
    ...(source?.terminology ?? {}),
  };
}

export function getTerminologyForSportConfig<T extends TerminologySource & { id: string }>(
  sportConfigs: T[] | undefined,
  sportConfigId?: string | null
) {
  const selectedConfig =
    (sportConfigId ? sportConfigs?.find((config) => config.id === sportConfigId) : null) ??
    sportConfigs?.[0] ??
    null;

  return getTerminology(selectedConfig);
}

export function sanitizeTerminologyOverrides(
  value: Partial<Record<TerminologyKey, string>> | Record<string, string> | null | undefined
) {
  const sanitized: Partial<Record<TerminologyKey, string>> = {};

  for (const key of TERMINOLOGY_KEYS) {
    const term = value?.[key];
    if (typeof term !== "string") continue;
    const normalized = term.trim();
    if (normalized.length > 0) {
      sanitized[key] = normalized.slice(0, 80);
    }
  }

  return sanitized;
}

export function getTerminologyWarnings(source: TerminologySource | null | undefined) {
  const terms = getTerminology(source);
  const warnings: string[] = [];
  const pairs: Array<[TerminologyKey, TerminologyKey, string]> = [
    ["athlete", "athletes", "deportistas"],
    ["group", "groups", "grupos"],
  ];

  for (const [singularKey, pluralKey, label] of pairs) {
    const singular = terms[singularKey].trim().toLocaleLowerCase();
    const plural = terms[pluralKey].trim().toLocaleLowerCase();
    if (singular && plural && singular === plural) {
      warnings.push(`Revisa singular/plural de ${label}; ahora usan el mismo texto.`);
    }
  }

  if (terms.team.trim().toLocaleLowerCase() === terms.group.trim().toLocaleLowerCase()) {
    warnings.push("Revisa equipo/conjunto y grupo; ahora usan el mismo texto.");
  }

  return warnings;
}
