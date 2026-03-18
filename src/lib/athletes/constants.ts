// Todos los estados posibles de un atleta
export const ATHLETE_STATUS_OPTIONS = [
  "trial",     // Periodo de prueba
  "active",    // Activo
  "inactive",  // Inactivo
  "paused",    // Pausado temporal
  "archived",  // Archivado
] as const;

export const athleteStatusOptions = ATHLETE_STATUS_OPTIONS;

export type AthleteStatus = (typeof ATHLETE_STATUS_OPTIONS)[number];

// Helpers para estados
export const ACTIVE_STATUSES: AthleteStatus[] = ["active", "trial"];
export const INACTIVE_STATUSES: AthleteStatus[] = ["inactive", "paused", "archived"];

export function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.includes(status as AthleteStatus);
}

