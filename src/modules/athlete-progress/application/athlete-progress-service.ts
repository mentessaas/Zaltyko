/**
 * Fachada de objetivos y observaciones por gimnasta (P2 #17, primera parte).
 *
 * Rutas, páginas, componentes de servidor y pruebas importan solo desde aquí.
 * `athlete-progress/*` es interno y lo protege la frontera de
 * eslint.internal-boundaries.json (tests/internal-module-boundaries.test.ts):
 * - athlete-progress/access.ts: autorización (rol, sede, gimnasta, sesión).
 * - athlete-progress/reads.ts: lectura de la ficha y desde Pasar lista.
 * - athlete-progress/objectives.ts: alta y cambio de estado con historial.
 * - athlete-progress/observations.ts: alta, acceso rápido y edición.
 * - athlete-progress/storage.ts: detección del candidato SQL sin aplicar.
 * Cada operación abre su propia transacción y vuelve a autorizarlo todo.
 */
export { getAthleteProgress, getSessionAthleteProgress } from "./athlete-progress/reads";
export { changeAthleteObjectiveStatus, createAthleteObjective } from "./athlete-progress/objectives";
export {
  createAthleteObservation,
  createSessionObservation,
  updateAthleteObservation,
} from "./athlete-progress/observations";
/**
 * Disponibilidad: las páginas deciden con isAthleteProgressAvailableForPage si
 * muestran los accesos; las pruebas de contrato y de PostgreSQL leen el
 * catálogo de tablas y la comprobación completa.
 */
export {
  ATHLETE_PROGRESS_TABLES,
  isAthleteProgressAvailableForPage,
  isAthleteProgressStorageAvailable,
} from "./athlete-progress/storage";
