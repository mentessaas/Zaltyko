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
 * Llamar justo antes de `supabase.auth.signOut()`: envía lo pendiente (hasta
 * 4 s) y borra del dispositivo las listas y la cola.
 */
export async function clearOfflineAttendanceOnSignOut(): Promise<void> {
  if (!hasOfflineAttendanceData()) return;
  try {
    const { prepareOfflineSignOut } = await import("./runtime");
    await prepareOfflineSignOut();
  } catch {
    // Cerrar sesión nunca debe quedarse atascado por esto.
  }
}
