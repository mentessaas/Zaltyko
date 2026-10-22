import type { AssessmentType } from "@/types";

/** Etiquetas y colores compartidos por historial, listados y exportaciones. */
export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  technical: "Técnica",
  artistic: "Artística",
  execution: "Ejecución",
  coach_feedback: "Feedback del entrenador",
  competition: "Competición",
  practice: "Entrenamiento",
  physical: "Condición física",
  behavioral: "Comportamental",
  overall: "General",
};

export const ASSESSMENT_TYPE_COLORS: Record<AssessmentType, string> = {
  technical: "bg-blue-100 text-blue-800 border-blue-200",
  artistic: "bg-purple-100 text-purple-800 border-purple-200",
  execution: "bg-cyan-100 text-cyan-800 border-cyan-200",
  coach_feedback: "bg-indigo-100 text-indigo-800 border-indigo-200",
  competition: "bg-orange-100 text-orange-800 border-orange-200",
  practice: "bg-teal-100 text-teal-800 border-teal-200",
  physical: "bg-green-100 text-green-800 border-green-200",
  behavioral: "bg-amber-100 text-amber-800 border-amber-200",
  overall: "bg-muted text-muted-foreground border-border",
};

export const ASSESSMENT_TYPE_FILTERS: AssessmentType[] = [
  "technical",
  "artistic",
  "execution",
  "coach_feedback",
  "competition",
  "practice",
  "physical",
  "behavioral",
  "overall",
];
