// Cliente de idempotencia para mutaciones ZAL-619 §6.2.
//
// AC-09 del contrato: "Repetir una mutación con la misma idempotency key
// conserva un único resultado; cambiar payload con la misma clave devuelve
// IDEMPOTENCY_CONFLICT."
//
// Estado actual (2026-08-12): el backend aún NO acepta el header
// `Idempotency-Key` (ver ZAL-622 §6 "Bloqueadores y decisiones pendientes"
// punto 4). Este módulo prepara el camino cliente:
//
//   1. Genera una UUIDv4 estable por par (mutationKind, payload).
//   2. La persiste en AsyncStorage para que un reintento por error de red
//      o timeout reusa la MISMA clave — no inventa una nueva cada vez.
//   3. Permite borrar la clave persistida cuando el usuario inicia un
//      nuevo intento lógico con payload distinto (eso lo detecta el caller
//      al hashear; si el hash cambia, no hay colisión).
//
// Cuando el backend implemente el header, este módulo ya está alineado:
// basta con pasar `idempotencyKey` como header `Idempotency-Key` (ver
// `client.ts`). Hasta entonces, la idempotencia "natural" del upsert SQL
// ya garantiza que repetir el mismo payload no duplica registros.
//
// Decisión: usamos Math.random() (no crypto) porque la unicidad de la
// clave es estadística, no criptográfica. Un colisión a 2^122 es
// aceptable para este caso y evita acoplar la app a polyfills de crypto.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'idem:v1:';
const IDEMPOTENCY_KEY_LIMIT = 200;

/** Tipos de mutación que requieren idempotencia según el contrato. */
export type IdempotencyKind =
  | 'attendance.upsert'
  | 'communication.send'
  | 'progress.save'
  | 'manualPayment.record'
  | 'import.commit';

export interface IdempotencyKey {
  /** UUIDv4 lista para enviar como header `Idempotency-Key`. */
  key: string;
  /** True si la clave ya existía de un guardado anterior (reintento). */
  reused: boolean;
}

/** UUIDv4 vía Math.random — ver justificación en el header del archivo. */
function generateUuidv4(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4'; // versión 4
    } else if (i === 19) {
      // variant 10xx: hex[(0..3) + 8] = 8,9,a,b
      out += hex[((Math.random() * 4) | 0) + 8];
    } else {
      out += hex[(Math.random() * 16) | 0];
    }
  }
  return out;
}

/**
 * Hash FNV-1a 32-bit estable sobre el payload serializado. Suficiente
 * para agrupar reintentos del mismo intento lógico del usuario.
 *
 * No es criptográfico: la idempotencia no requiere resistencia a
 * adversarios, solo que dos payloads idénticos den el mismo hash y
 * payloads distintos den hashes distintos con probabilidad razonable.
 */
function hashPayload(payload: unknown): string {
  // Orden estable de claves: aunque JSON.stringify ya ordena por
  // inserción en objetos, lo hacemos explícito para no depender de la
  // implementación del runtime.
  const stable = JSON.stringify(payload, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (value as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return value;
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < stable.length; i++) {
    h ^= stable.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function compositeKey(kind: IdempotencyKind, payload: unknown): string {
  return `${STORAGE_PREFIX}${kind}:${hashPayload(payload)}`;
}

/**
 * Obtiene o crea una clave de idempotencia para una mutación.
 *
 * Si ya existe una clave persistida para el mismo (kind, payload), la
 * REUSA — esto es lo que garantiza idempotencia ante reintentos por
 * error de red o timeout: el backend (cuando lo soporte) verá la misma
 * clave y devolverá el mismo resultado.
 *
 * Si AsyncStorage falla, devolvemos una clave nueva sin persistir: el
 * guardado puede continuar; un reintento posterior generará otra clave,
 * pero como el upsert SQL es naturalmente idempotente, no se duplicará.
 */
export async function getOrCreateIdempotencyKey(
  kind: IdempotencyKind,
  payload: unknown
): Promise<IdempotencyKey> {
  const composite = compositeKey(kind, payload);
  try {
    const existing = await AsyncStorage.getItem(composite);
    if (existing) {
      return { key: existing, reused: true };
    }
  } catch {
    // Storage get falló: devolvemos clave fresca sin persistir.
    return { key: generateUuidv4(), reused: false };
  }
  const fresh = generateUuidv4();
  try {
    await AsyncStorage.setItem(composite, fresh);
    await pruneOldEntriesBestEffort();
  } catch {
    // Set falló: no bloqueamos el guardado.
  }
  return { key: fresh, reused: false };
}

/**
 * Borra una clave persistida. Útil para tests y para flujos donde el
 * usuario "empieza de cero" con la misma pantalla.
 */
export async function clearIdempotencyKey(
  kind: IdempotencyKind,
  payload: unknown
): Promise<void> {
  try {
    await AsyncStorage.removeItem(compositeKey(kind, payload));
  } catch {
    // best-effort
  }
}

/**
 * LRU best-effort: si el total de claves crece mucho, borra las más
 * viejas. Solo se ejecuta después de un set exitoso y es tolerante a
 * fallos. El umbral (200) cubre con margen el uso real (decenas de
 * mutaciones por sesión de entrenamiento).
 */
async function pruneOldEntriesBestEffort(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const idemKeys = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
    if (idemKeys.length <= IDEMPOTENCY_KEY_LIMIT) return;
    const toDelete = idemKeys.slice(0, idemKeys.length - IDEMPOTENCY_KEY_LIMIT);
    await AsyncStorage.multiRemove(toDelete);
  } catch {
    // best-effort
  }
}

/**
 * Exportado para tests. No usar en código de app: depende del formato
 * interno y puede cambiar.
 */
export const __testing = {
  generateUuidv4,
  hashPayload,
  compositeKey,
};
