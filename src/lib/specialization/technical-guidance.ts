import type { AcademySpecializationContext } from "@/lib/specialization/registry";

export interface ClassNameSuggestion {
  name: string;
  description: string;
}

export interface GroupTechnicalGuidance {
  headline: string;
  focusAreas: string[];
  apparatus: string[];
  suggestedSessionBlocks: string[];
}

export function resolveSpecializedApparatusCodes(
  specialization: AcademySpecializationContext,
  values: string[]
): string[] {
  const normalizedMap = new Map<string, string>();

  specialization.evaluation.apparatus.forEach((item) => {
    normalizedMap.set(item.code.toLowerCase(), item.code);
    normalizedMap.set(item.label.toLowerCase(), item.code);
  });

  const resolved = values
    .map((value) => normalizedMap.get(value.trim().toLowerCase()))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(resolved));
}

export function getSpecializedClassNameSuggestions(
  specialization: AcademySpecializationContext
): ClassNameSuggestion[] {
  switch (specialization.disciplineVariant) {
    case "artistic_female":
      return [
        {
          name: "Base técnica general",
          description: "Trabajo coordinado de suelo, salto y preparación física general.",
        },
        {
          name: "Viga y barras",
          description: "Sesión centrada en seguridad, técnica y conexiones de barras y viga.",
        },
        {
          name: "Preparación de competición",
          description: "Pases completos, control técnico y ritmo competitivo.",
        },
      ];
    case "artistic_male":
      return [
        {
          name: "Fundamentos por aparato",
          description: "Base técnica combinada para suelo, anillas y barra fija.",
        },
        {
          name: "Fuerza específica",
          description: "Bloque de fuerza, movilidad y técnica aplicada por aparato.",
        },
        {
          name: "Preparación competitiva",
          description: "Series completas y control técnico orientado a competición.",
        },
      ];
    case "rhythmic":
      return [
        {
          name: "Base corporal y aparato",
          description: "Trabajo de base corporal, técnica básica y coordinación con aparato.",
        },
        {
          name: "Pases de conjunto",
          description: "Bloque de sincronía, intercambio y limpieza de montaje.",
        },
        {
          name: "Montaje competitivo",
          description: "Pases completos, resistencia específica y afinado coreográfico.",
        },
      ];
    default:
      return [
        {
          name: `Base de ${specialization.labels.classLabel.toLowerCase()}`,
          description: "Bloque inicial recomendado para arrancar la planificación semanal.",
        },
      ];
  }
}

export function getGroupTechnicalGuidance(
  specialization: AcademySpecializationContext,
  level?: string | null
): GroupTechnicalGuidance {
  const normalizedLevel = (level ?? "").toLowerCase();
  const earlyStage =
    !normalizedLevel ||
    normalizedLevel.includes("pre") ||
    normalizedLevel.includes("inici") ||
    normalizedLevel.includes("alev");
  const competitiveStage =
    normalizedLevel.includes("junior") ||
    normalizedLevel.includes("senior") ||
    normalizedLevel.includes("absol") ||
    normalizedLevel.includes("compet");

  switch (specialization.disciplineVariant) {
    case "artistic_female":
      return earlyStage
        ? {
            headline: "Base técnica y seguridad por aparato",
            focusAreas: [
              "Alineación corporal y control postural",
              "Técnica básica en salto, suelo, viga y barras",
              "Movilidad, fuerza general y hábitos de trabajo",
            ],
            apparatus: ["Salto", "Suelo", "Viga", "Barras asimétricas"],
            suggestedSessionBlocks: [
              "Calentamiento general y movilidad",
              "Circuito técnico por aparato",
              "Preparación física básica",
            ],
          }
        : {
            headline: competitiveStage
              ? "Control técnico y preparación competitiva"
              : "Progresión técnica por aparato",
            focusAreas: [
              "Series completas y enlaces de dificultad",
              "Control de ejecución por aparato",
              "Preparación física específica y prevención de lesión",
            ],
            apparatus: ["Salto", "Suelo", "Viga", "Barras asimétricas"],
            suggestedSessionBlocks: [
              "Activación específica",
              "Pases completos o series objetivo",
              "Corrección técnica por aparato",
            ],
          };
    case "artistic_male":
      return earlyStage
        ? {
            headline: "Base física y técnica general por aparato",
            focusAreas: [
              "Fuerza básica y control corporal",
              "Introducción técnica en suelo, salto y aparatos superiores",
              "Movilidad y hábitos técnicos seguros",
            ],
            apparatus: ["Suelo", "Caballo con arcos", "Anillas", "Salto", "Paralelas", "Barra fija"],
            suggestedSessionBlocks: [
              "Preparación física general",
              "Rotación técnica por aparato",
              "Trabajo de fuerza y movilidad",
            ],
          }
        : {
            headline: competitiveStage
              ? "Volumen técnico y consistencia competitiva"
              : "Desarrollo técnico específico por aparato",
            focusAreas: [
              "Series completas y dificultad progresiva",
              "Fuerza específica aplicada al aparato",
              "Ejecución y control técnico en competición",
            ],
            apparatus: ["Suelo", "Caballo con arcos", "Anillas", "Salto", "Paralelas", "Barra fija"],
            suggestedSessionBlocks: [
              "Activación específica",
              "Rotación por aparato con objetivos técnicos",
              "Trabajo de fuerza final",
            ],
          };
    case "rhythmic":
      return earlyStage
        ? {
            headline: "Base corporal, aparato y coordinación de conjunto",
            focusAreas: [
              "Base corporal, flexibilidad y coordinación",
              "Técnica inicial con aparato",
              "Sincronía y ocupación espacial",
            ],
            apparatus: ["Cuerda", "Pelota", "Mazas", "Aro", "Cinta"],
            suggestedSessionBlocks: [
              "Base corporal y flexibilidad",
              "Técnica de aparato",
              "Pases parciales de montaje",
            ],
          }
        : {
            headline: competitiveStage
              ? "Pases completos y afinado competitivo"
              : "Construcción técnica y coreográfica del conjunto",
            focusAreas: [
              "Intercambios y sincronía de conjunto",
              "Limpieza de aparato y ejecución artística",
              "Resistencia específica y pases completos",
            ],
            apparatus: ["Cuerda", "Pelota", "Mazas", "Aro", "Cinta"],
            suggestedSessionBlocks: [
              "Calentamiento específico y técnica de aparato",
              "Pases de montaje o ejercicio completo",
              "Correcciones coreográficas y físicas",
            ],
          };
    default:
      return {
        headline: "Guía técnica general",
        focusAreas: ["Trabajo técnico progresivo", "Preparación física", "Seguimiento del grupo"],
        apparatus: specialization.evaluation.apparatus.map((item) => item.label),
        suggestedSessionBlocks: ["Activación", "Bloque técnico principal", "Vuelta a la calma"],
      };
  }
}
