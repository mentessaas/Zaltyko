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
}

export interface MarkDecision {
  outcome: SyncOutcome;
  /**
   * Hay un valor distinto que se pierde con esta decisión y conviene dejarlo
   * en el registro: la marca anterior (si la nueva gana) o la nueva (si pierde).
   */
  conflict: boolean;
}

/** Fecha de la marca: la que manda el móvil, acotada a `now`; sin ella, `now`. */
export function resolveMarkedAt(raw: string | undefined, now: Date): Date {
  if (!raw) return now;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return now;
  // Una marca no puede venir del futuro (reloj del móvil adelantado): se acota
  // a «ahora» para que no gane a marcas legítimas posteriores.
  return parsed.getTime() > now.getTime() ? now : parsed;
}

export function decideMark(existing: ExistingMark | undefined, incoming: IncomingMark): MarkDecision {
  if (!existing || !existing.recordedAt) {
    return { outcome: "applied", conflict: false };
  }

  const sameContent =
    existing.status === incoming.status && (existing.notes ?? null) === (incoming.notes ?? null);
  const existingTime = existing.recordedAt.getTime();
  const incomingTime = incoming.markedAt.getTime();

  if (incomingTime > existingTime) {
    // La marca nueva gana. Solo es un conflicto si pisa algo distinto.
    return { outcome: "applied", conflict: !sameContent };
  }

  if (sameContent) {
    // Mismo contenido y no más reciente: es un reenvío (o la misma marca
    // llegó por otro camino). No se toca nada.
    return { outcome: "duplicate", conflict: false };
  }

  // Más antigua (o empate con otro valor): gana la que ya estaba.
  return { outcome: "superseded", conflict: true };
}
