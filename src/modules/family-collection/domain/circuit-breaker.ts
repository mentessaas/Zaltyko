/**
 * Cobro automático de cuotas (Fase 4, D9): cortacircuitos del proceso diario.
 *
 * Un despliegue roto (por ejemplo, una petición mal formada) haría que Stripe
 * rechazara con un 400 la creación de TODOS los cobros del día, y la regla C4
 * de la Fase 3 cerraría cada intento (`canceled`) y pasaría cada cuota a cobro
 * manual. El cortacircuitos corta antes: se abre con
 * CIRCUIT_BREAKER_CONSECUTIVE rechazos de la plataforma seguidos, o cuando
 * esos rechazos son al menos CIRCUIT_BREAKER_RATIO de las creaciones en
 * cuanto hay CIRCUIT_BREAKER_MIN_SAMPLE (creadas + rechazadas).
 *
 * Solo cuentan los rechazos de toda la plataforma (isPlatformInvalidRequest,
 * domain/payment-outcome.ts). Lo que es de una familia o de una academia
 * (`resource_missing`, `amount_too_small`, `account_invalid`…), los rechazos
 * del banco, los errores de red y los de idempotencia son `other`: no cambian
 * nada (ni suman ni rompen la racha). Solo un cobro creado rompe la racha.
 *
 * Una vez abierto, sigue abierto hasta el final de la pasada; la del día
 * siguiente empieza cerrada. Función pura: no lee el reloj ni guarda nada.
 */

/** Rechazos de la plataforma seguidos que abren el cortacircuitos. */
export const CIRCUIT_BREAKER_CONSECUTIVE = 3;
/** Proporción de rechazos de la plataforma que lo abre (20 %)... */
export const CIRCUIT_BREAKER_RATIO = 0.2;
/** ...en cuanto hay al menos estas creaciones (creadas + rechazadas). */
export const CIRCUIT_BREAKER_MIN_SAMPLE = 10;

export interface BreakerState {
  /** Rechazos de la plataforma seguidos (un cobro creado la pone a cero). */
  consecutive: number;
  /** Cobros creados en Stripe en esta pasada. */
  created: number;
  /** Rechazos de la plataforma en esta pasada. */
  invalid: number;
  open: boolean;
}

/** Resultado de una creación de cobro, tal como lo cuenta el cortacircuitos. */
export type CreateResult = "created" | "platform_invalid_request" | "other";

/** Cortacircuitos cerrado y a cero: el de cada pasada nueva. */
export function closedBreaker(): BreakerState {
  return { consecutive: 0, created: 0, invalid: 0, open: false };
}

/** Estado tras una creación. Nunca cambia el que recibe. */
export function recordCreateResult(state: BreakerState, result: CreateResult): BreakerState {
  if (result === "other") return { ...state };
  const next: BreakerState =
    result === "created"
      ? { ...state, consecutive: 0, created: state.created + 1 }
      : { ...state, consecutive: state.consecutive + 1, invalid: state.invalid + 1 };
  if (next.open) return next;
  const sample = next.created + next.invalid;
  const open =
    next.consecutive >= CIRCUIT_BREAKER_CONSECUTIVE ||
    (sample >= CIRCUIT_BREAKER_MIN_SAMPLE && next.invalid / sample >= CIRCUIT_BREAKER_RATIO);
  return { ...next, open };
}
