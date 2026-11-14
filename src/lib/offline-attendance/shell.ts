/** La pantalla sin conexión que guarda el service worker (ver public/sw.js). */
export const OFFLINE_SHELL_PATH = "/pasar-lista-sin-conexion";

/**
 * Pide al service worker que guarde la pantalla de pasar lista sin conexión
 * y sus archivos. No lleva datos de nadie. Si no hay service worker (modo
 * privado, desarrollo) no pasa nada.
 */
export async function requestOfflineShellCache(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: "CACHE_OFFLINE_SHELL" });
  } catch {
    // sin service worker: la lista de hoy sigue guardada, solo falta la pantalla
  }
}
