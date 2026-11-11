/**
 * Fachada de objetivos y observaciones por gimnasta (P2 #17, primera parte).
 *
 * Rutas, páginas y pruebas importan solo desde aquí. Los módulos internos:
 * - athlete-progress-access.ts: autorización (rol, sede, gimnasta, sesión).
 * - athlete-progress-reads.ts: lectura de la ficha y desde Pasar lista.
 * - athlete-progress-objectives.ts: alta y cambio de estado con historial.
 * - athlete-progress-observations.ts: alta, acceso rápido y edición.
 * Cada operación abre su propia transacción y vuelve a autorizarlo todo.
 */
export { getAthleteProgress, getSessionAthleteProgress } from "./athlete-progress-reads";
export { changeAthleteObjectiveStatus, createAthleteObjective } from "./athlete-progress-objectives";
export {
  createAthleteObservation,
  createSessionObservation,
  updateAthleteObservation,
} from "./athlete-progress-observations";
