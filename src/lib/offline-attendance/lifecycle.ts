import { countPending, purgeExpiredQueue } from "./queue";
import { purgeExpiredSnapshots } from "./snapshot";
import type { OfflineStore } from "./store";

/**
 * Caducidad de lo guardado en el móvil, sin esperar a que nadie abra
 * «Pasar lista»: listas de más de 36 h y marcas de la cola de más de 7 días
 * (3 las rechazadas). Se llama al arrancar la app y desde el service worker.
 */
export async function expireOfflineData(
  store: OfflineStore,
  now: Date = new Date()
): Promise<{ snapshots: number; marks: number }> {
  return {
    snapshots: await purgeExpiredSnapshots(store, now),
    marks: await purgeExpiredQueue(store, now),
  };
}

/** Marcas de esta usuaria que aún no se han enviado (para avisar al cerrar sesión). */
export async function pendingBeforeSignOut(store: OfflineStore, userId: string): Promise<number> {
  return countPending(store, userId);
}

/**
 * Qué se borra al cerrar sesión:
 *  - Las listas (nombres de gimnastas), siempre.
 *  - Las marcas sin enviar de esta usuaria, solo si `keepQueue` es falso.
 *    Con `keepQueue` se conservan (con caducidad) hasta que vuelva a entrar;
 *    así una sesión caducada no hace perder lo marcado en el tapiz.
 *  - Las marcas de otras personas no se tocan nunca.
 * Devuelve cuántas marcas (de cualquier usuaria) quedan en la cola.
 */
export async function clearForSignOut(
  store: OfflineStore,
  options: { userId: string | null; keepQueue: boolean }
): Promise<number> {
  await store.clearSnapshots();
  if (!options.keepQueue && options.userId) {
    for (const mark of await store.listQueued()) {
      if (mark.userId === options.userId) await store.deleteQueued(mark.key);
    }
  }
  return (await store.listQueued()).length;
}
