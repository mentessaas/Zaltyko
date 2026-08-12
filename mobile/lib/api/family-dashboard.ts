// Cliente Mobile para el my-dashboard del padre.
//
// Compone el bundle "Familia my-dashboard" en cliente a partir de tres
// endpoints ya existentes: `getMySchedule`, `getUnreadCount` +
// `getConversations`, y `getMyCharges`. Es la implementación de AC-08
// (ZAL-619) sin tocar backend: el contrato del P0 no exige todavía un
// endpoint dedicado `view=family` para el dashboard (sólo `owner` y
// `coach` están en el shape compartido Web/Mobile — ver
// `mobile/lib/api/dashboard.ts`). Cuando el backend exponga un bundle
// `view=family`, este archivo se reemplaza por una llamada a ese
// endpoint sin tocar la UI.
//
// Por qué no componer en `endpoints.ts`:
//   1. Aísla la regla de "fuente no disponible" para no contaminar
//      endpoints de un solo recurso.
//   2. Concentra la composición paralela y el manejo de fallos
//      parciales (una fuente caída NO debe ocultar las otras dos).
//   3. Permite añadir luego tests negativos sin tocar la red de
//      dependencias de `endpoints.test.ts`.
//
// Reglas contractuales aplicadas (ZAL-619 §6.2):
//   - `sourceAvailable=false` se renderiza como "Fuente no disponible",
//     NUNCA como 0.
//   - `count=0 && sourceAvailable=true` se renderiza como "Sin X".
//   - Errores contractuales (FORBIDDEN_ROLE / AUTH_REQUIRED /
//     VALIDATION_ERROR / RATE_LIMITED) se traducen con la misma tabla
//     que el resto de la app; códigos desconocidos caen al fallback
//     de `translateError` sin filtrar `message` del backend.

import { apiGet } from './client';
import {
  getMySchedule,
  getUnreadCount,
  getConversations,
  getMyCharges,
  type ScheduleItem,
  type Charge,
  isChargePayable,
  type Conversation,
} from './endpoints';

// Re-export para que la UI pueda tipar las filas sin importar `endpoints`
// directamente (mantiene el dominio "familia my-dashboard" autocontenido).
export type { ScheduleItem, Charge };

export interface NextClassesBlock {
  /** Próximas clases del usuario (hoy + futuro). Máx. 5 en P0. */
  items: ScheduleItem[];
  sourceAvailable: boolean;
  href: string;
}

export interface UnreadBlock {
  notifications: number;
  conversations: number;
  sourceAvailable: boolean;
  href: string;
}

export interface PendingChargesBlock {
  /** Cargos donde `isChargePayable(status)` es true: due/overdue/partial/failed. */
  items: Charge[];
  sourceAvailable: boolean;
  href: string;
}

/**
 * Bundle que ve la familia en su home. Los tres bloques son
 * independientes: si uno falla, los otros dos siguen disponibles con
 * `sourceAvailable=true` y el bloque fallido se marca
 * `sourceAvailable=false` (la UI muestra "Fuente no disponible").
 */
export interface FamilyDashboardBundle {
  nextClasses: NextClassesBlock;
  unread: UnreadBlock;
  pendingCharges: PendingChargesBlock;
}

/** Helper de UI consistente con `dashboard.renderCount`. */
export type FamilyCountDisplay =
  | { kind: 'value'; value: number }
  | { kind: 'empty' }
  | { kind: 'unavailable' };

export function renderFamilyCount(
  block: { count: number; sourceAvailable: boolean } | undefined | null
): FamilyCountDisplay {
  if (!block) return { kind: 'unavailable' };
  if (!block.sourceAvailable) return { kind: 'unavailable' };
  // Defensivo: si el backend devuelve un count negativo o no-numérico,
  // no lo renderizamos como valor (preferimos "no disponible" antes
  // que mostrar "-3 pendientes").
  if (!Number.isFinite(block.count) || block.count < 0) {
    return { kind: 'unavailable' };
  }
  if (block.count === 0) return { kind: 'empty' };
  return { kind: 'value', value: block.count };
}

/**
 * Carga el bundle my-dashboard de la familia en paralelo. Si una fuente
 * falla con error NO contractual (red, timeout, código desconocido), el
 * bloque afectado se marca `sourceAvailable=false` y los demás siguen.
 * Si una fuente falla con error contractual (AUTH_REQUIRED /
 * FORBIDDEN_ROLE), la promesa rechaza para que `useQuery` lo pinte en
 * la UI con el mensaje ya traducido (la familia sabrá que la sesión
 * expiró o que su rol no aplica — esto no debe disfrazarse de "Sin
 * datos").
 */
export async function getFamilyDashboard(): Promise<FamilyDashboardBundle> {
  // Corremos las tres llamadas en paralelo y etiquetamos cada resultado
  // con su estado (ok / fail). Una falla individual NO cancela las
  // otras dos (a diferencia de Promise.all que aborta en el primer
  // reject). Esto preserva la información de las fuentes sanas.
  const [schedule, unread, charges] = await Promise.all([
    safeSource<ScheduleItem[]>(getMySchedule),
    safeUnreadSource(),
    safeSource<Charge[]>(getMyCharges),
  ]);

  return {
    nextClasses: {
      items: schedule.ok ? schedule.value.slice(0, 5) : [],
      sourceAvailable: schedule.ok,
      href: '/(tabs)/schedule',
    },
    unread: {
      notifications: unread.ok ? unread.value.notifications : 0,
      conversations: unread.ok ? unread.value.conversations : 0,
      sourceAvailable: unread.ok,
      href: '/(tabs)/notifications',
    },
    pendingCharges: {
      items: charges.ok
        ? charges.value.filter((c) => isChargePayable(c.status))
        : [],
      sourceAvailable: charges.ok,
      href: '/family/invoices',
    },
  };
}

interface SourceOk<T> {
  ok: true;
  value: T;
}
interface SourceFail {
  ok: false;
  /** Categoría del fallo para que la UI decida. */
  reason: 'network' | 'auth' | 'forbidden' | 'unknown';
}
type SourceResult<T> = SourceOk<T> | SourceFail;

/**
 * Envuelve una llamada que devuelve `T[]` y aísla su fallo. Si el
 * error es contractual (AUTH_REQUIRED / FORBIDDEN_ROLE), se considera
 * bloqueante y se rechaza la promesa exterior — la UI debe mostrar
 * error, no "Fuente no disponible". Si el error es de red o
 * desconocido, se marca `sourceAvailable=false`.
 */
async function safeSource<T>(loader: () => Promise<T>): Promise<SourceResult<T>> {
  try {
    const value = await loader();
    return { ok: true, value };
  } catch (err) {
    const code = (err as { code?: string | null }).code ?? null;
    if (code === 'AUTH_REQUIRED' || code === 'UNAUTHENTICATED') {
      // Sesión vencida o ausente — esto es bloqueante.
      throw err;
    }
    if (code === 'FORBIDDEN_ROLE') {
      // El rol no aplica para esta familia (caso límite: viewer
      // navegando). Bloqueante: la UI debe informar.
      throw err;
    }
    // NETWORK_ERROR, TIMEOUT, HTTP_5xx, RATE_LIMITED, código
    // desconocido → fuente caída, las demás siguen.
    return { ok: false, reason: 'network' };
  }
}

/**
 * Variante específica para el contador de no-leídos: combina
 * `getUnreadCount` (notificaciones) + `getConversations` (suma de
 * `unreadCount` por conversación). Si cualquiera de las dos falla,
 * la fuente entera se considera no disponible.
 */
async function safeUnreadSource(): Promise<SourceResult<{ notifications: number; conversations: number }>> {
  try {
    const [count, conversations] = await Promise.all([
      getUnreadCount(),
      getConversations(),
    ]);
    const conversationsUnread = (conversations as Conversation[]).reduce(
      (sum, c) => sum + (c.unreadCount ?? 0),
      0
    );
    return {
      ok: true,
      value: { notifications: count.count, conversations: conversationsUnread },
    };
  } catch (err) {
    const code = (err as { code?: string | null }).code ?? null;
    if (code === 'AUTH_REQUIRED' || code === 'UNAUTHENTICATED') throw err;
    if (code === 'FORBIDDEN_ROLE') throw err;
    return { ok: false, reason: 'network' };
  }
}

// Re-export del cliente base para que tests negativos puedan mockear
// el transporte sin importar `client.ts` directamente.
export { apiGet };
