import type { AcademySpecializationContext } from "@/lib/specialization/registry";

export interface StarterGroupPreset {
  key: string;
  name: string;
  level: string;
  description: string;
}

export interface StarterClassPreset {
  key: string;
  name: string;
  description: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  capacity: number;
  groupPresetKey?: string;
}

export function getStarterGroupPresets(
  specialization: AcademySpecializationContext
): StarterGroupPreset[] {
  switch (specialization.disciplineVariant) {
    case "artistic_female":
      return [
        {
          key: "af-base",
          name: "Equipo Base",
          level: "Pre-iniciación",
          description: "Primer grupo para trabajo técnico general y adaptación.",
        },
        {
          key: "af-school",
          name: "Equipo Escolar",
          level: "Alevín",
          description: "Grupo orientado a progresión y primeras competiciones escolares.",
        },
        {
          key: "af-competition",
          name: "Equipo Competición",
          level: "Infantil",
          description: "Bloque principal para seguimiento técnico y calendario competitivo.",
        },
      ];
    case "artistic_male":
      return [
        {
          key: "am-base",
          name: "Equipo Base",
          level: "Pre-iniciación",
          description: "Trabajo general de fuerza, movilidad y fundamentos por aparato.",
        },
        {
          key: "am-school",
          name: "Equipo Desarrollo",
          level: "Alevín",
          description: "Grupo para consolidar técnica y primeros objetivos competitivos.",
        },
        {
          key: "am-competition",
          name: "Equipo Competición",
          level: "Infantil",
          description: "Seguimiento técnico regular para calendario federativo.",
        },
      ];
    case "rhythmic":
      return [
        {
          key: "rh-school",
          name: "Conjunto Escolar",
          level: "Iniciación",
          description: "Base para coordinación, aparato y primeras coreografías.",
        },
        {
          key: "rh-base",
          name: "Conjunto Base",
          level: "Alevín",
          description: "Trabajo de aparato, montaje y control técnico de conjunto.",
        },
        {
          key: "rh-competition",
          name: "Conjunto Competición",
          level: "Junior",
          description: "Bloque principal para seguimiento competitivo y pases completos.",
        },
      ];
    default:
      return specialization.categories.levelOptions.slice(0, 3).map((level, index) => ({
        key: `default-${index}`,
        name: `${specialization.labels.groupLabel} ${level}`,
        level,
        description: `Configuración inicial sugerida para ${specialization.labels.groupLabel.toLowerCase()}s de ${specialization.labels.disciplineName.toLowerCase()}.`,
      }));
  }
}

export function getStarterClassPresets(
  specialization: AcademySpecializationContext,
  groupPresets: StarterGroupPreset[] = getStarterGroupPresets(specialization)
): StarterClassPreset[] {
  switch (specialization.disciplineVariant) {
    case "artistic_female":
      return groupPresets.map((groupPreset, index) => ({
        key: `class-${groupPreset.key}`,
        groupPresetKey: groupPreset.key,
        name: `${groupPreset.name} · ${specialization.labels.classLabel}`,
        description:
          index === 0
            ? "Bloque técnico base para suelo, salto y preparación general."
            : index === 1
              ? "Sesión mixta de técnica y trabajo físico específico."
              : "Bloque competitivo con volumen y control técnico.",
        weekdays: index === 2 ? [1, 3, 5] : [1, 3],
        startTime: index === 2 ? "18:00" : "17:30",
        endTime: index === 2 ? "20:30" : "19:00",
        capacity: 16,
      }));
    case "artistic_male":
      return groupPresets.map((groupPreset, index) => ({
        key: `class-${groupPreset.key}`,
        groupPresetKey: groupPreset.key,
        name: `${groupPreset.name} · ${specialization.labels.classLabel}`,
        description:
          index === 0
            ? "Fundamentos generales, fuerza básica y movilidad."
            : index === 1
              ? "Técnica por aparato con progresiones de fuerza."
              : "Bloque competitivo con aparatos completos.",
        weekdays: index === 2 ? [2, 4, 6] : [2, 4],
        startTime: index === 2 ? "18:00" : "17:30",
        endTime: index === 2 ? "20:30" : "19:00",
        capacity: 16,
      }));
    case "rhythmic":
      return groupPresets.map((groupPreset, index) => ({
        key: `class-${groupPreset.key}`,
        groupPresetKey: groupPreset.key,
        name: `${groupPreset.name} · ${specialization.labels.classLabel}`,
        description:
          index === 0
            ? "Base corporal, aparato y primeros montajes."
            : index === 1
              ? "Trabajo técnico de conjunto con pases parciales."
              : "Pases completos y preparación de competición.",
        weekdays: index === 2 ? [1, 3, 5] : [2, 4],
        startTime: index === 2 ? "17:30" : "17:00",
        endTime: index === 2 ? "20:00" : "18:30",
        capacity: 14,
      }));
    default:
      return groupPresets.map((groupPreset) => ({
        key: `class-${groupPreset.key}`,
        groupPresetKey: groupPreset.key,
        name: `${groupPreset.name} · ${specialization.labels.classLabel}`,
        description: `Bloque inicial de ${specialization.labels.classLabel.toLowerCase()} para ${groupPreset.name.toLowerCase()}.`,
        weekdays: [1, 3],
        startTime: "17:30",
        endTime: "19:00",
        capacity: 15,
      }));
  }
}
