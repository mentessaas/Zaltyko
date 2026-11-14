/**
 * Fachada de niveles y progresión por aparato.
 *
 * Rutas, páginas, componentes de servidor y pruebas importan solo desde aquí.
 * Los módulos de `skill-levels/` son internos:
 * - skill-levels/access.ts: autorización (rol, sede, gimnasta) y listas de
 *   gimnastas de un grupo o de una sesión.
 * - skill-levels/storage.ts: bandera ZALTYKO_SKILL_LEVELS_ENABLED y detección
 *   del candidato SQL sin aplicar.
 * - skill-levels/templates.ts: plantillas (listar, ver, crear, copiar, editar).
 * - skill-levels/evaluations.ts: evaluar elementos en bloque y paso de nivel.
 * - skill-levels/reads.ts: ficha, grupo, sesión, diploma y familias.
 * Cada operación abre su propia transacción y vuelve a autorizarlo todo.
 */
export {
  createSkillTemplate,
  getSkillTemplate,
  listSkillTemplates,
  saveSkillTemplate,
} from "./skill-levels/templates";
export { evaluateSkills, passSkillLevel } from "./skill-levels/evaluations";
export {
  getAthleteSkills,
  getFamilyDiploma,
  getFamilySkills,
  getGroupSkillRoster,
  getLevelPassDiploma,
  getSessionSkillRoster,
} from "./skill-levels/reads";
/**
 * Disponibilidad: las páginas deciden con isSkillLevelsAvailableForPage si
 * muestran los accesos; las pruebas de contrato y de PostgreSQL leen el
 * catálogo de tablas y la comprobación de las tablas sin la bandera.
 */
export {
  isSkillLevelsAvailable,
  isSkillLevelsAvailableForPage,
  isSkillLevelsStorageInstalled,
  SKILL_LEVELS_TABLES,
} from "./skill-levels/storage";
