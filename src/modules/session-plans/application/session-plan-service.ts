/**
 * Fachada de la planificación sobre sesiones (P2 #17, segunda parte).
 *
 * Rutas, páginas, componentes de servidor y pruebas importan solo desde aquí.
 * `session-plan/*` es interno y lo protege la frontera de
 * eslint.internal-boundaries.json (tests/internal-module-boundaries.test.ts):
 * - session-plan/access.ts: autorización (rol, sede, sesión, clase) y
 *   gimnastas que participan en la sesión.
 * - session-plan/plans.ts: lectura y guardado del plan, y marca de bloques.
 * - session-plan/templates.ts: plantilla de plan por clase.
 * - session-plan/storage.ts: detección del candidato SQL sin aplicar.
 * Cada operación abre su propia transacción y vuelve a autorizarlo todo.
 */
export { getSessionPlan, markSessionPlanBlock, saveSessionPlan } from "./session-plan/plans";
export { getClassPlanTemplate, saveClassPlanTemplate } from "./session-plan/templates";
/**
 * Disponibilidad: las páginas deciden con isSessionPlanAvailableForPage si
 * muestran los accesos; las pruebas de contrato y de PostgreSQL leen el
 * catálogo de tablas y la comprobación completa.
 */
export {
  isSessionPlanAvailableForPage,
  isSessionPlanStorageAvailable,
  SESSION_PLAN_TABLES,
} from "./session-plan/storage";
