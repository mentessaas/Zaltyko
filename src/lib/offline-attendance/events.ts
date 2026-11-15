/**
 * Evento del navegador: la cola o las listas de pasar lista sin conexión han
 * cambiado. Vive aparte de `runtime.ts` para que las pantallas puedan
 * escucharlo sin cargar el resto del pegamento.
 */
export const OFFLINE_ATTENDANCE_EVENT = "zaltyko:offline-attendance-changed";
