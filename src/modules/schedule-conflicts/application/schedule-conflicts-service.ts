/**
 * Fachada de los avisos de choque (O2: entrenadora y pista).
 *
 * Rutas, páginas, otros módulos y pruebas importan solo desde aquí; los
 * módulos de schedule-conflicts/ son internos (eslint.internal-boundaries.json):
 * - detect.ts: detección acotada al horizonte de sesiones, solo lectura.
 * - upcoming.ts: «Choques próximos» para las páginas, con el alcance de quien
 *   mira y un tiempo máximo por consulta.
 * Solo avisa: nada aquí bloquea ni cambia datos.
 */
export { findScheduleConflicts, CONFLICT_HORIZON_DAYS, type ConflictFilter } from "./schedule-conflicts/detect";
export {
  getUpcomingScheduleConflicts,
  loadUpcomingScheduleConflicts,
  PAGE_BUDGET_MS,
  type LoadGuard,
  type UpcomingConflicts,
} from "./schedule-conflicts/upcoming";
