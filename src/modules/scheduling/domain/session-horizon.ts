/**
 * Horizonte del calendario de sesiones, compartido por la generación
 * (session-horizon.ts) y por quien recorre sesiones futuras (por ejemplo, la
 * propagación de titulares de coach-assignment). Vive en el dominio para no
 * crear un ciclo de importaciones con session-service.
 */
/** Keep at least this many days of generated sessions ahead of today. */
export const SESSION_HORIZON_REFILL_DAYS = 60;
/** Generate up to this many days ahead (same cap as class creation). */
export const SESSION_HORIZON_TARGET_DAYS = 120;
