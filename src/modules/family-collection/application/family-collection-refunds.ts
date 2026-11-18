/**
 * Cobro automático de cuotas (Fase 4, Tarea 6): las devoluciones que la
 * academia hace desde su panel de Stripe (D5: solo la academia devuelve; en
 * Zaltyko no hay botón de devolver) quedan en el libro. La cuota sigue
 * pagada, marcada «Devuelta» (D1). Nunca se borra ni se cambia un pago.
 *
 * Eventos `charge.refunded` (objeto `ch_…`/`py_…`) y `refund.*` (objeto
 * `re_…`/`pyr_…`). El evento es solo un aviso:
 * 1. Se relee en Stripe, en la cuenta conectada: la devolución da su cargo y
 *    el cargo da su `pi_…` y todas sus devoluciones. Stripe nunca se llama
 *    dentro de una transacción.
 * 2. El intento de esa academia con ese `pi_…` tiene que ser de la cuenta del
 *    evento y estar `succeeded` (con su pago en el libro). Si no, sin efecto.
 * 3. Cada devolución del cargo, de la más antigua a la más nueva:
 *    - `succeeded` sin anotar → una transacción con todas sus filas (una por
 *      reparto, de la cuota más antigua a la más nueva) y el aviso
 *      informativo `refunded`. Idempotente por el `re_…` y por la clave de
 *      cada fila.
 *    - Si no cabe en lo repartido (pago sin repartir, repartido en parte o
 *      devoluciones anteriores que ya lo agotan): no se escribe ninguna fila,
 *      la academia recibe el aviso `refund_unallocated` (una vez por `re_…`)
 *      y el evento queda procesado (`refund_review`): nunca un 500 que Stripe
 *      reenviaría durante días.
 *    - `pending`/`requires_action` → nada todavía (lo anotará el evento de
 *      cuando termine).
 *    - Ya anotada y ahora `failed`/`canceled` → aviso `refund_reversed` (una
 *      vez por `re_…`), sin tocar el libro.
 *
 * Errores de Stripe al releer: uno permanente (el cargo no existe o la cuenta
 * ya no es accesible) no tiene efecto y queda un aviso en el registro con
 * solo ids y el código; uno pasajero sube y Stripe reenvía el evento.
 */
import { logger } from "@/lib/logger";
import {
  isFamilyCollectionEventsFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import {
  RefundDoesNotFitError,
  REFUND_REVERSED_REASON,
  REFUND_UNALLOCATED_REASON,
  refundReasonCode,
} from "@/modules/family-collection/domain/refund-split";
import { stripeReadFailureOf } from "@/modules/family-collection/domain/stripe-read-error";
import {
  createFamilyCollectionRefundStore,
  type CollectionAttempt,
  type FamilyCollectionRefundStore,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  createStripeRefundGateway,
  type ChargeRefundSnapshot,
  type ChargeRefundsSnapshot,
  type FamilyCollectionRefundGateway,
} from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import type { StoredConnectAccount } from "@/modules/payments-connect/infrastructure/connect-account-store";

/** Entrada de un manejador de eventos (la misma forma que ProviderEventHandlerInput). */
export interface RefundEventInput {
  organizationId: string;
  account: StoredConnectAccount;
  /** `ch_…`/`py_…` (charge.refunded) o `re_…`/`pyr_…` (refund.*). */
  objectId: string;
  now: Date;
  /** Fila del buzón: `refunds.provider_event_id`. */
  inboxId: string;
  eventId: string;
}

export interface RefundEventEffect {
  effectType: string | null;
  effectId: string | null;
}

export interface FamilyCollectionRefundDeps {
  store?: FamilyCollectionRefundStore;
  gateway?: FamilyCollectionRefundGateway;
}

/** Tipo de efecto en el buzón: filas nuevas en zaltyko.refunds (`effect_id` = la primera). */
export const REFUND_EFFECT_TYPE = "refund";
/** Tipo de efecto en el buzón: aviso a la academia sin filas (`effect_id` = el intento). */
export const REFUND_REVIEW_EFFECT_TYPE = "refund_review";

const NO_EFFECT: RefundEventEffect = { effectType: null, effectId: null };

/** Estados de una devolución que ya no van a terminar en dinero devuelto. */
const REVERSED_STATUSES: ReadonlySet<string> = new Set(["failed", "canceled"]);

/** Bandera de eventos, clave de prueba de Stripe y base que no es la de producción. */
function areRefundEventsOpen(): boolean {
  return isFamilyCollectionEventsFlagEnabled() && resolveConnectEnvironment() === "test" && !isProductionDatabase();
}

/** Solo ids y códigos: nunca datos de la familia ni mensajes de Stripe. */
function eventIds(input: RefundEventInput, extra: Record<string, unknown> = {}) {
  return {
    organizationId: input.organizationId,
    eventId: input.eventId,
    objectId: input.objectId,
    accountId: input.account.providerAccountReference,
    ...extra,
  };
}

/**
 * Lectura en Stripe: un error permanente se registra (solo ids y el código) y
 * da `null` (sin efecto); uno pasajero sube para que Stripe reenvíe el evento.
 */
async function readOrSkip<T>(input: RefundEventInput, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    const failure = stripeReadFailureOf(error);
    if (!failure.permanent) throw error;
    logger.warn(
      "Cobro automático: Stripe no deja leer una devolución de un evento",
      eventIds(input, { errorName: failure.errorName, errorCode: failure.errorCode })
    );
    return null;
  }
}

function byCreation(left: ChargeRefundSnapshot, right: ChargeRefundSnapshot): number {
  const time = left.createdAt.getTime() - right.createdAt.getTime();
  if (time !== 0) return time;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

interface SettleContext {
  organizationId: string;
  /** Fila del buzón del evento; null cuando las anota el cobro tardío al registrarse. */
  inboxId: string | null;
  now: Date;
  /** Solo ids para el registro. */
  logIds: Record<string, unknown>;
  store: FamilyCollectionRefundStore;
  attempt: CollectionAttempt;
  paymentIntentId: string;
}

type RefundStep = { recorded: string | null; review: boolean };

async function settleSucceededRefund(context: SettleContext, refund: ChargeRefundSnapshot): Promise<RefundStep> {
  const { store, attempt } = context;
  const currency = refund.currency ?? attempt.currency;
  // Ya anotada (otro evento del mismo cargo): nada que escribir ni bloquear.
  if (await store.isRefundRecorded({ organizationId: context.organizationId, environment: "test", refundId: refund.id })) {
    return { recorded: null, review: false };
  }
  try {
    const result = await store.recordAttemptRefunds({
      organizationId: context.organizationId,
      attemptId: attempt.id,
      paymentIntentId: context.paymentIntentId,
      refund: {
        id: refund.id,
        amountCents: refund.amountCents,
        currency,
        reasonCode: refundReasonCode(refund.reasonCode),
        refundedAt: refund.createdAt,
      },
      providerEventId: context.inboxId,
      environment: "test",
      now: context.now,
    });
    return { recorded: result.outcome === "recorded" ? (result.refundIds[0] ?? null) : null, review: false };
  } catch (error) {
    if (!(error instanceof RefundDoesNotFitError)) throw error;
    // No cabe en lo repartido: la transacción ya se deshizo entera. Aviso
    // (una vez por `re_…`) y el evento termina procesado.
    logger.warn("Cobro automático: una devolución de Stripe no cabe en lo repartido; aviso a la academia", {
      ...context.logIds,
      attemptId: attempt.id,
      refundId: refund.id,
    });
    await store.recordRefundNotice({
      attempt,
      reason: REFUND_UNALLOCATED_REASON,
      refundId: refund.id,
      amountCents: refund.amountCents,
      currency,
      now: context.now,
    });
    return { recorded: null, review: true };
  }
}

async function settleReversedRefund(context: SettleContext, refund: ChargeRefundSnapshot): Promise<RefundStep> {
  const { store, attempt } = context;
  const recorded = await store.isRefundRecorded({
    organizationId: context.organizationId,
    environment: "test",
    refundId: refund.id,
  });
  // Nunca anotada: no hay nada que revisar.
  if (!recorded) return { recorded: null, review: false };
  // Anotada y después fallida o cancelada en Stripe: el libro no se toca
  // (nunca se borra una fila); la academia lo revisa.
  await store.recordRefundNotice({
    attempt,
    reason: REFUND_REVERSED_REASON,
    refundId: refund.id,
    amountCents: refund.amountCents,
    currency: refund.currency ?? attempt.currency,
    now: context.now,
  });
  return { recorded: null, review: true };
}

/** Lo común a los dos eventos: el cargo ya releído con todas sus devoluciones. */
async function settleChargeRefunds(
  input: RefundEventInput,
  store: FamilyCollectionRefundStore,
  charge: ChargeRefundsSnapshot
): Promise<RefundEventEffect> {
  if (!charge.paymentIntentId) return NO_EFFECT;
  const attempt = await store.findAttemptByPaymentIntent({
    organizationId: input.organizationId,
    paymentIntentId: charge.paymentIntentId,
  });
  // Un cargo que no es de un cobro automático de Zaltyko: no es asunto de este módulo.
  if (!attempt) return NO_EFFECT;
  if (attempt.paymentProviderAccountId !== input.account.id) {
    logger.warn(
      "Cobro automático: devolución de una cuenta conectada que no es la del intento; no se aplica",
      eventIds(input, { attemptId: attempt.id })
    );
    return NO_EFFECT;
  }
  // Sin cobro registrado en el libro no hay nada que devolver en él.
  if (attempt.status !== "succeeded") return NO_EFFECT;

  return settleAttemptRefunds(
    {
      organizationId: input.organizationId,
      inboxId: input.inboxId,
      now: input.now,
      logIds: eventIds(input),
      store,
      attempt,
      paymentIntentId: charge.paymentIntentId,
    },
    charge
  );
}

/** Cada devolución del cargo de un intento cobrado, de la más antigua a la más nueva. */
async function settleAttemptRefunds(context: SettleContext, charge: ChargeRefundsSnapshot): Promise<RefundEventEffect> {
  const { attempt } = context;
  let firstRecorded: string | null = null;
  let review = false;
  for (const refund of [...charge.refunds].sort(byCreation)) {
    let step: RefundStep;
    if (refund.status === "succeeded") {
      step = await settleSucceededRefund(context, refund);
    } else if (REVERSED_STATUSES.has(refund.status)) {
      step = await settleReversedRefund(context, refund);
    } else {
      // `pending` o `requires_action`: todavía no hay dinero devuelto.
      continue;
    }
    firstRecorded ??= step.recorded;
    review ||= step.review;
  }
  if (firstRecorded) return { effectType: REFUND_EFFECT_TYPE, effectId: firstRecorded };
  if (review) return { effectType: REFUND_REVIEW_EFFECT_TYPE, effectId: attempt.id };
  return NO_EFFECT;
}

interface ResolvedDeps {
  store: FamilyCollectionRefundStore;
  gateway: FamilyCollectionRefundGateway;
}

/** Cerrojos y almacenamiento; sin ellos, null (sin efecto y sin llamar a Stripe). */
async function resolveDeps(deps: FamilyCollectionRefundDeps): Promise<ResolvedDeps | null> {
  if (!areRefundEventsOpen()) return null;
  const store = deps.store ?? createFamilyCollectionRefundStore();
  if (!(await store.isStorageAvailable())) return null;
  return { store, gateway: deps.gateway ?? createStripeRefundGateway() };
}

/** `charge.refunded`: el objeto es el cargo (`ch_…`/`py_…`). */
export async function processChargeRefundEvent(
  input: RefundEventInput,
  deps: FamilyCollectionRefundDeps = {}
): Promise<RefundEventEffect> {
  const resolved = await resolveDeps(deps);
  if (!resolved) return NO_EFFECT;
  const charge = await readOrSkip(input, () =>
    resolved.gateway.retrieveChargeRefunds({
      connectedAccount: input.account.providerAccountReference,
      chargeId: input.objectId,
    })
  );
  return charge ? settleChargeRefunds(input, resolved.store, charge) : NO_EFFECT;
}

/** `refund.created`/`refund.updated`/`refund.failed`: el objeto es la devolución (`re_…`/`pyr_…`). */
export async function processRefundEvent(
  input: RefundEventInput,
  deps: FamilyCollectionRefundDeps = {}
): Promise<RefundEventEffect> {
  const resolved = await resolveDeps(deps);
  if (!resolved) return NO_EFFECT;
  const connectedAccount = input.account.providerAccountReference;
  const chargeId = await readOrSkip(input, () =>
    resolved.gateway.retrieveRefundCharge({ connectedAccount, refundId: input.objectId })
  );
  if (!chargeId) return NO_EFFECT;
  const charge = await readOrSkip(input, () => resolved.gateway.retrieveChargeRefunds({ connectedAccount, chargeId }));
  return charge ? settleChargeRefunds(input, resolved.store, charge) : NO_EFFECT;
}

/** Manejador de `charge.refunded` con las dependencias reales. */
export const handleChargeRefundEvent = (input: RefundEventInput): Promise<RefundEventEffect> =>
  processChargeRefundEvent(input);

/** Manejador de `refund.*` con las dependencias reales. */
export const handleRefundEvent = (input: RefundEventInput): Promise<RefundEventEffect> => processRefundEvent(input);

/**
 * Tarea 7 (pendiente de la Tarea 6): devoluciones de un cobro que el libro
 * registra tarde. Mientras un intento está cerrado en Zaltyko (cobro tardío
 * en espera, `late_success_pending`) o es el cobro doble de D10, una
 * devolución de la academia no tiene efecto (el intento no está cobrado en el
 * libro) y su evento no se repite. Cuando después se registra ese cobro
 * (settleClosedAttempt: el tardío o el hermano que Stripe ya había cobrado),
 * se relee en Stripe el cargo de su `pi_…` con todas sus devoluciones y se
 * anotan por el mismo camino (recordAttemptRefunds): el libro nunca lo da por
 * cobrado entero si Stripe ya devolvió. Idempotente por el `re_…`. Fuera de
 * toda transacción; sin evento propio, las filas llevan `provider_event_id`
 * null. Los errores de Stripe suben: decide quien llama.
 */
export async function applyRecordedAttemptRefunds(
  input: { attempt: CollectionAttempt; connectedAccount: string; now: Date },
  deps: { store: FamilyCollectionRefundStore; gateway: FamilyCollectionRefundGateway }
): Promise<RefundEventEffect> {
  const paymentIntentId = input.attempt.paymentIntentId;
  if (!paymentIntentId) return NO_EFFECT;
  const charge = await deps.gateway.retrievePaymentIntentRefunds({
    connectedAccount: input.connectedAccount,
    paymentIntentId,
  });
  if (!charge || charge.paymentIntentId !== paymentIntentId || charge.refunds.length === 0) return NO_EFFECT;
  // El intento tal como está ahora en la base: tiene que estar ya cobrado.
  const attempt = await deps.store.findAttemptByPaymentIntent({
    organizationId: input.attempt.organizationId,
    paymentIntentId,
  });
  if (!attempt || attempt.id !== input.attempt.id || attempt.status !== "succeeded") return NO_EFFECT;
  return settleAttemptRefunds(
    {
      organizationId: attempt.organizationId,
      inboxId: null,
      now: input.now,
      logIds: { organizationId: attempt.organizationId, attemptId: attempt.id, chargeId: charge.chargeId },
      store: deps.store,
      attempt,
      paymentIntentId,
    },
    charge
  );
}
