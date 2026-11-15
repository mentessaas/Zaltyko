/**
 * Atajos ligeros para el resto de la app (no arrastran Supabase ni IndexedDB a
 * las páginas públicas): solo cargan el módulo pesado si en este móvil se
 * llegó a guardar algo.
 */

const LAST_USER_KEY = "zaltyko:offline-attendance:user";

export function hasOfflineAttendanceData(): boolean {
  try {
    return typeof localStorage !== "undefined" && Boolean(localStorage.getItem(LAST_USER_KEY));
  } catch {
    return false;
  }
}

/**
 * Llamar justo antes de `supabase.auth.signOut()`, solo si
 * `hasOfflineAttendanceData()`: envía lo pendiente (hasta 4 s), borra las
 * listas del móvil y, si quedan marcas sin enviar, pregunta primero.
 * Devuelve `false` si la persona decide no cerrar sesión todavía.
 */
export async function clearOfflineAttendanceOnSignOut(): Promise<boolean> {
  if (!hasOfflineAttendanceData()) return true;
  try {
    const { prepareOfflineSignOut } = await import("./runtime");
    return await prepareOfflineSignOut();
  } catch {
    // Cerrar sesión nunca debe quedarse atascado por esto.
    return true;
  }
}
