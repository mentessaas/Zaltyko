/**
 * Resolución de marcas de asistencia que llegan desde el móvil, a veces horas
 * después de hacerse (la entrenadora estaba sin cobertura).
 *
 * Reglas:
 *  - «Última marca gana»: gana la que se hizo después en el tapiz, no la que
 *    llegó después al servidor. Se compara `markedAt` con el `recordedAt` ya
 *    guardado.
 *  - Idempotente: reenviar la misma marca no cambia nada (`duplicate`).
 *  - Sin migración: `recordedAt` es el momento de la marca, y la propia fila
 *    es el estado; no hace falta una tabla de operaciones.
 *  - Conflicto = alguien cambió esa marca mientras la entrenadora estaba sin
 *    red. El móvil manda el `recordedAt` que vio (`seenRecordedAt`); si el
 *    guardado sigue igual, la entrenadora solo está corrigiendo lo suyo y no
 *    es conflicto.
 *  - Reloj del móvil: el móvil manda también la hora a la que envía
 *    (`sentAt`); la diferencia con la hora del servidor se resta de cada
 *    marca, así un reloj adelantado o atrasado no desordena las marcas.
 */

export type SyncOutcome = "applied" | "duplicate" | "superseded";

export interface ExistingMark {
  status: string;
  notes: string | null;
  recordedAt: Date | null;
}

export interface IncomingMark {
  status: string;
  notes: string | null;
  markedAt: Date;
  /**
   * `recordedAt` que el móvil vio al marcar: una fecha, `null` si no había
   * marca, o `undefined` si el cliente no lo manda (guardado en línea o
   * versión antigua).
   */
  seenRecordedAt?: Date | null;
}

export interface MarkDecision {
  outcome: SyncOutcome;
  /**
   * Hay un valor distinto que se pierde con esta decisión y conviene dejarlo
   * en el registro: la marca anterior (si la nueva gana) o la nueva (si pierde).
   */
  conflict: boolean;
}

/**
 * Diferencia de reloj entre el servidor y el móvil, en milisegundos
 * (positiva si el móvil va atrasado). Sin `sentAt` válido no se compensa.
 */
export function clockOffsetMs(sentAt: string | undefined, now: Date): number {
  if (!sentAt) return 0;
  const sent = new Date(sentAt).getTime();
  return Number.isNaN(sent) ? 0 : now.getTime() - sent;
}

/**
 * Fecha de la marca: la que manda el móvil corregida con la diferencia de
 * reloj y acotada a `now`; sin ella (o rota), `now`.
 */
export function resolveMarkedAt(raw: string | undefined, now: Date, offsetMs = 0): Date {
  if (!raw) return now;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return now;
  const corrected = parsed.getTime() + offsetMs;
  // Una marca no puede venir del futuro: se acota a «ahora» para que no gane
  // a marcas legítimas posteriores.
  return corrected > now.getTime() ? now : new Date(corrected);
}

export function decideMark(existing: ExistingMark | undefined, incoming: IncomingMark): MarkDecision {
  if (!existing || !existing.recordedAt) {
    return { outcome: "applied", conflict: false };
  }

  const sameContent =
    existing.status === incoming.status && (existing.notes ?? null) === (incoming.notes ?? null);
  const existingTime = existing.recordedAt.getTime();
  const incomingTime = incoming.markedAt.getTime();

  // ¿Cambió alguien esa marca desde que la entrenadora la vio? Si el cliente
  // no dice qué vio, se vuelve a la regla simple: distinto contenido = conflicto.
  const seen = incoming.seenRecordedAt;
  const changedMeanwhile =
    seen === undefined ? !sameContent : seen === null || seen.getTime() !== existingTime;
  const conflict = !sameContent && changedMeanwhile;

  if (incomingTime > existingTime) {
    return { outcome: "applied", conflict };
  }

  if (sameContent) {
    // Mismo contenido y no más reciente: es un reenvío (o la misma marca
    // llegó por otro camino). No se toca nada.
    return { outcome: "duplicate", conflict: false };
  }

  // Más antigua (o empate con otro valor): gana la que ya estaba.
  return { outcome: "superseded", conflict: true };
}
