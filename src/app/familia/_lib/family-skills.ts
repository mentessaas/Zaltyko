import { logger } from "@/lib/logger";
import { getFamilySkills } from "@/modules/skill-levels/application/skill-level-service";
import type { FamilySkillsView } from "@/modules/skill-levels/domain/skill-levels";

/**
 * Carga el progreso de niveles para la página de una gimnasta. Con la bandera
 * apagada o sin el candidato SQL devuelve null sin tocar la base de datos de
 * familias; si la lectura falla, lo registra y también devuelve null: la
 * sección de niveles nunca rompe el horario ni la asistencia.
 */
export async function loadFamilySkills(userId: string, athleteId: string): Promise<FamilySkillsView | null> {
  try {
    return await getFamilySkills({ userId, athleteId });
  } catch (error) {
    logger.error("family_skills.read_failed", error);
    return null;
  }
}
