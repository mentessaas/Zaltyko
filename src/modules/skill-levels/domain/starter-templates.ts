import {
  STARTER_TEMPLATE_NOTICE,
  type SkillApparatus,
  type SkillDiscipline,
  type StarterTemplateSummary,
} from "./skill-levels";

/**
 * Plantillas de ejemplo de niveles por disciplina. Son material propio de
 * Zaltyko, escrito como progresión pedagógica general: NO reproducen la
 * estructura, la nomenclatura ni los requisitos de ninguna federación (RFEG,
 * FMG u otras) y no sustituyen sus programas. La academia las copia y las
 * edita; ninguna se aplica sola. Viven en código, no en la base de datos: la
 * academia solo guarda su copia (tabla skill_templates con starter_key).
 */

export type StarterElement = {
  name: string;
  apparatus: SkillApparatus | null;
  required?: boolean;
};

export type StarterLevel = {
  name: string;
  description?: string;
  elements: readonly StarterElement[];
};

export type StarterTemplate = {
  key: string;
  discipline: SkillDiscipline;
  name: string;
  description: string;
  levels: readonly StarterLevel[];
};

const e = (apparatus: SkillApparatus | null, name: string, required = true): StarterElement => ({
  name,
  apparatus,
  required,
});

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    key: "gaf_progresion_general",
    discipline: "artistic_female",
    name: "GAF · Progresión general",
    description: `Cuatro niveles de iniciación a la artística femenina por aparato. ${STARTER_TEMPLATE_NOTICE}`,
    levels: [
      {
        name: "Iniciación",
        description: "Posiciones básicas, volteretas y primeros desplazamientos.",
        elements: [
          e(null, "Posición hueca y posición arqueada (10 s)"),
          e(null, "Puente desde tumbada", false),
          e("floor", "Voltereta adelante"),
          e("floor", "Voltereta atrás en plano inclinado"),
          e("floor", "Equilibrio sobre un pie (3 s)"),
          e("beam", "Caminar adelante sobre barra baja con buena postura"),
          e("beam", "Bajada con salto desde la barra baja"),
          e("vault", "Carrera y salto a colchón apilado"),
          e("uneven_bars", "Suspensión en barra baja (10 s)"),
        ],
      },
      {
        name: "Nivel 1",
        description: "Rueda lateral, primeras combinaciones y apoyos invertidos.",
        elements: [
          e(null, "Spagat o split (flexibilidad)", false),
          e("floor", "Rueda lateral"),
          e("floor", "Vertical con ayuda"),
          e("floor", "Voltereta atrás"),
          e("beam", "Giro sobre las dos piernas en barra baja"),
          e("beam", "Salto de ángulo en barra baja", false),
          e("vault", "Salto de rana sobre plinto bajo"),
          e("uneven_bars", "Balanceo en suspensión"),
          e("uneven_bars", "Subida a apoyo en barra baja"),
        ],
      },
      {
        name: "Nivel 2",
        description: "Elementos con fase aérea y primeras series cortas.",
        elements: [
          e("floor", "Rondada"),
          e("floor", "Vertical y voltereta"),
          e("floor", "Serie corta: rueda, voltereta y salto"),
          e("beam", "Rueda lateral en barra baja", false),
          e("beam", "Serie corta en barra media"),
          e("vault", "Salto de rana con carrera y trampolín"),
          e("uneven_bars", "Vuelta atrás a apoyo"),
          e("uneven_bars", "Salida con balanceo"),
        ],
      },
      {
        name: "Nivel 3",
        description: "Series completas con control en cada aparato.",
        elements: [
          e("floor", "Rondada y flic-flac con ayuda"),
          e("floor", "Serie completa de suelo"),
          e("beam", "Serie completa de barra con salida"),
          e("vault", "Salto con fase aérea controlada"),
          e("uneven_bars", "Serie corta de paralelas con salida"),
        ],
      },
    ],
  },
  {
    key: "gam_progresion_general",
    discipline: "artistic_male",
    name: "GAM · Progresión general",
    description: `Cuatro niveles de iniciación a la artística masculina por aparato. ${STARTER_TEMPLATE_NOTICE}`,
    levels: [
      {
        name: "Iniciación",
        description: "Fuerza básica, posiciones y volteretas.",
        elements: [
          e(null, "Posición hueca y posición arqueada (10 s)"),
          e(null, "Fondos y flexiones con buena técnica", false),
          e("floor", "Voltereta adelante"),
          e("floor", "Voltereta atrás en plano inclinado"),
          e("floor", "Equilibrio sobre un pie (3 s)"),
          e("rings", "Suspensión en anillas bajas (10 s)"),
          e("high_bar", "Suspensión en barra fija (10 s)"),
          e("parallel_bars", "Apoyo en paralelas bajas (5 s)"),
          e("vault", "Carrera y salto a colchón apilado"),
        ],
      },
      {
        name: "Nivel 1",
        description: "Rueda lateral, apoyos y balanceos.",
        elements: [
          e("floor", "Rueda lateral"),
          e("floor", "Vertical con ayuda"),
          e("floor", "Voltereta atrás"),
          e("pommel_horse", "Apoyo y desplazamiento en potro de entrenamiento", false),
          e("rings", "Balanceo en suspensión"),
          e("parallel_bars", "Balanceo en apoyo"),
          e("high_bar", "Subida a apoyo en barra baja"),
          e("vault", "Salto de rana sobre plinto bajo"),
        ],
      },
      {
        name: "Nivel 2",
        description: "Elementos con fase aérea y primeras series cortas.",
        elements: [
          e("floor", "Rondada"),
          e("floor", "Vertical y voltereta"),
          e("floor", "Serie corta de suelo"),
          e("rings", "Subida a apoyo con ayuda"),
          e("parallel_bars", "Serie corta con salida"),
          e("high_bar", "Vuelta atrás a apoyo"),
          e("vault", "Salto con carrera y trampolín"),
        ],
      },
      {
        name: "Nivel 3",
        description: "Series completas con control en cada aparato.",
        elements: [
          e("floor", "Serie completa de suelo"),
          e("rings", "Serie corta de anillas con salida"),
          e("parallel_bars", "Serie completa de paralelas"),
          e("high_bar", "Serie corta de barra fija con salida"),
          e("vault", "Salto con fase aérea controlada"),
        ],
      },
    ],
  },
  {
    key: "gr_progresion_general",
    discipline: "rhythmic",
    name: "GR · Progresión general",
    description: `Cuatro niveles de iniciación a la rítmica con los cinco aparatos. ${STARTER_TEMPLATE_NOTICE}`,
    levels: [
      {
        name: "Iniciación",
        description: "Cuerpo, flexibilidad, coordinación y manejo básico.",
        elements: [
          e("body", "Posiciones básicas de pies y brazos"),
          e("body", "Equilibrio sobre un pie (3 s)"),
          e("body", "Saltos básicos: salto de gato y salto en tijera"),
          e(null, "Spagat o split (flexibilidad)", false),
          e("rope", "Saltos sencillos con cuerda"),
          e("hoop", "Balanceos y rotaciones del aro con una mano"),
          e("ball", "Botes y rodamientos de pelota"),
          e("clubs", "Molinos y balanceos de mazas", false),
          e("ribbon", "Serpentinas y espirales de cinta", false),
        ],
      },
      {
        name: "Nivel 1",
        description: "Combinaciones sencillas con cada aparato.",
        elements: [
          e("body", "Giro sobre un pie en relevé"),
          e("body", "Equilibrio con pierna libre adelante"),
          e("rope", "Saltos con cuerda: de pie junto y alternos"),
          e("hoop", "Lanzamiento y recogida del aro"),
          e("ball", "Lanzamiento y recogida de la pelota"),
          e("clubs", "Circunducciones simétricas de mazas"),
          e("ribbon", "Serpentinas y espirales continuas"),
        ],
      },
      {
        name: "Nivel 2",
        description: "Elementos corporales con aparato y coreografías cortas.",
        elements: [
          e("body", "Giro con pierna libre elevada"),
          e("body", "Salto con cambio de piernas"),
          e("rope", "Lanzamiento de cuerda con recogida controlada"),
          e("hoop", "Pasaje del aro por el cuerpo"),
          e("ball", "Rodamientos de pelota por el cuerpo"),
          e("ribbon", "Boomerang de cinta", false),
          e(null, "Coreografía corta con un aparato"),
        ],
      },
      {
        name: "Nivel 3",
        description: "Ejercicios completos con música.",
        elements: [
          e(null, "Ejercicio completo con música y un aparato"),
          e("rope", "Serie de cuerda con elementos corporales"),
          e("hoop", "Serie de aro con elementos corporales"),
          e("ball", "Serie de pelota con elementos corporales"),
          e("clubs", "Serie de mazas con elementos corporales", false),
          e("ribbon", "Serie de cinta con elementos corporales", false),
        ],
      },
    ],
  },
];

export function findStarterTemplate(key: string): StarterTemplate | null {
  return STARTER_TEMPLATES.find((template) => template.key === key) ?? null;
}

export function starterTemplateSummaries(): StarterTemplateSummary[] {
  return STARTER_TEMPLATES.map((template) => ({
    key: template.key,
    name: template.name,
    discipline: template.discipline,
    description: template.description,
    levelCount: template.levels.length,
    elementCount: template.levels.reduce((sum, level) => sum + level.elements.length, 0),
  }));
}
