"use client";

import { useAcademyContext } from "@/hooks/use-academy-context";
import type { SpecializedLabels } from "@/lib/specialization/registry";
import type { SportTerminology } from "@/lib/sport-config/catalog";

export interface SportTerminologyResult extends SportTerminology {
  labels: SpecializedLabels;
}

/**
 * Punto único por defecto para que un componente nuevo consuma vocabulario
 * y etiquetas según la disciplina/país de la academia activa, sin
 * hardcodear texto. Deriva de useAcademyContext().specialization (ya
 * resuelto server-side), sin fetch adicional:
 *
 *   const t = useSportTerminology();
 *   <h2>{t.labels.dashboardHeadline}</h2>
 *   <span>Nueva {t.athlete}</span>
 *
 * OJO: refleja el vocabulario por defecto de la disciplina/país, NO
 * `terminologyOverrides` de una academia concreta (academySportConfigs).
 * Componentes que ya reciben `sportConfigs` por props con overrides (ej.
 * EditAthleteDialog.tsx / AthleteLevelForm.tsx) deben seguir usando
 * `getTerminology(selectedSportConfig)` directamente - no migrarlos a este
 * hook sin verificar antes que no se pierden esos overrides.
 */
export function useSportTerminology(): SportTerminologyResult {
  const { specialization } = useAcademyContext();

  return {
    ...specialization.terminology,
    labels: specialization.labels,
  };
}
