/**
 * Fachada de la asignación de entrenadoras (O1: titular por clase y
 * sustitución por sesión).
 *
 * Rutas, páginas, otros módulos y pruebas importan solo desde aquí; los
 * módulos de coach-assignment/ son internos (eslint.internal-boundaries.json):
 * - storage.ts: detección del candidato SQL sin aplicar (503 y accesos ocultos).
 * - access.ts: autorización por rol y sede, y elegibilidad de quien se asigna.
 * - class-coaches.ts: titulares de una clase y propagación a sesiones futuras.
 * - session-coaches.ts: sustitución en una sesión concreta.
 * - inheritance.ts: herencia de titulares en las sesiones que se generan.
 * - today.ts: quién está en cada sesión de Hoy.
 * Cada operación abre su propia transacción y vuelve a autorizarlo todo.
 */
export {
  getClassCoaches,
  getClassTitularsByClass,
  setClassCoaches,
} from "./coach-assignment/class-coaches";
export { getSessionCoaches, setSessionCoaches } from "./coach-assignment/session-coaches";
export { inheritClassCoachesForNewSessions } from "./coach-assignment/inheritance";
export { getSessionCoachSummaries, withSessionCoaches } from "./coach-assignment/today";
export {
  COACH_ASSIGNMENT_TABLES,
  isCoachAssignmentAvailableForPage,
  isCoachAssignmentStorageAvailable,
} from "./coach-assignment/storage";
