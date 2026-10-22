import type { AssessmentWithScores } from "@/types";

/**
 * Lee tanto el sobre actual `{ ok, data }` como las respuestas legacy.
 * Evita que un cambio de envelope convierta un historial real en un estado
 * vacío en pantalla.
 */
export function extractAssessmentRows(payload: unknown): AssessmentWithScores[] {
  if (Array.isArray(payload)) return payload as AssessmentWithScores[];
  if (!payload || typeof payload !== "object") return [];

  const root = payload as { data?: unknown; assessments?: unknown };
  if (Array.isArray(root.data)) return root.data as AssessmentWithScores[];
  if (Array.isArray(root.assessments)) return root.assessments as AssessmentWithScores[];

  if (root.data && typeof root.data === "object") {
    const nested = root.data as { assessments?: unknown };
    if (Array.isArray(nested.assessments)) {
      return nested.assessments as AssessmentWithScores[];
    }
  }

  return [];
}
