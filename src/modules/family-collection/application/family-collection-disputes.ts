/**
 * Cobro automático de cuotas (Fase 4, Tarea 7): disputas de tarjeta y
 * devoluciones del banco en domiciliación (`charge.dispute.created`,
 * `.updated`, `.closed`, `.funds_withdrawn` y `.funds_reinstated`; objeto
 * `dp_…`/`du_…`).
 *
 * El evento es solo un aviso, y todos los tipos hacen lo mismo:
 * 1. Se relee la disputa en Stripe, en la cuenta conectada (con su cargo:
 *    forma de pago y `pi_…`). Stripe nunca se llama dentro de una
 *    transacción. El orden de llegada no importa: siempre se guarda lo último
 *    que dice Stripe.
 * 2. El intento de esa academia con ese `pi_…` tiene que ser de la cuenta del
 *    evento. Si no está cobrado en el libro (evento de cobro perdido o cobro
 *    tardío), primero se registra el cobro por el camino de siempre
 *    (`recordCollection`: el manejador de `payment_intent.*`), porque la
 *    disputa necesita su pago. Si aun así no está cobrado (p. ej. el cobro
 *    doble de D10, que nunca entra en el libro), no se guarda nada: aviso
 *    `dispute_unallocated` a la academia y el evento queda procesado.
 * 3. upsertDisputeAndApply guarda la disputa y aplica su efecto
 *    (disputeEffect): abierta → la cuota sigue pagada y la academia ve el
 *    plazo (D4); ganada → «Disputa ganada»; perdida en tarjeta → filas
 *    `dispute_lost` y aviso, sin deuda (D3); domiciliación devuelta → filas
 *    `sepa_returned`, cuota nueva pendiente a mano y aviso (D2). Lo que no
 *    cabe en lo repartido: disputa guardada sin filas y aviso
 *    `dispute_unallocated` (nunca un 500 que Stripe reenviaría durante días).
 *
 * Errores de Stripe al releer: uno permanente no tiene efecto (aviso en el
 * registro con solo ids y el código); uno pasajero sube y Stripe reenvía.
 */
import { logger } from "@/lib/logger";
import {
  isFamilyCollectionEventsFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import { DISPUTE_UNALLOCATED_REASON } from "@/modules/family-collection/domain/dispute-effect";
import { stripeReadFailureOf } from "@/modules/family-collection/domain/stripe-read-error";
import {
  createFamilyCollectionDisputeStore,
  type FamilyCollectionDisputeStore,
} from "@/modules/family-collection/infrastructure/family-collection-dispute-store";
import { FAMILY_COLLECTION_DISPUTE_STATUSES } from "@/modules/family-collection/infrastructure/family-collection-schema";
import type { CollectionAttempt } from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  createStripeDisputeGateway,
  type DisputeSnapshot,
  type FamilyCollectionDisputeGateway,
} from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import type { StoredConnectAccount } from "@/modules/payments-connect/infrastructure/connect-account-store";

/** Entrada de un manejador de eventos (la misma forma que ProviderEventHandlerInput). */
export interface DisputeEventInput {
  organizationId: string;
  account: StoredConnectAccount;
  /** `dp_…` o `du_…`. */
  objectId: string;
  now: Date;
  /** Fila del buzón: `last_provider_event_id` y `refunds.provider_event_id`. */
  inboxId: string;
  eventId: string;
}

export interface DisputeEventEffect {
  effectType: string | null;
  effectId: string | null;
}

export interface FamilyCollectionDisputeDeps {
  store?: FamilyCollectionDisputeStore;
  gateway?: FamilyCollectionDisputeGateway;
  /**
   * Registra el cobro de un `pi_…` por el camino de los eventos de cobro
   * (processPaymentIntentEvent). Lo pasa family-collection-events.ts (así
   * este módulo no lo importa). Sin él, una disputa de un cobro que el libro
   * no tiene solo deja el aviso.
   */
  recordCollection?: (input: DisputeEventInput) => Promise<unknown>;
}

/** Tipo de efecto en el buzón: la fila de la disputa (`effect_id`). */
export const DISPUTE_EFFECT_TYPE = "family_collection_dispute";
/** Tipo de efecto en el buzón: aviso sin disputa guardada (`effect_id` = el intento). */
export const DISPUTE_REVIEW_EFFECT_TYPE = "dispute_review";

const NO_EFFECT: DisputeEventEffect = { effectType: null, effectId: null };

const KNOWN_STATUSES: ReadonlySet<string> = new Set(FAMILY_COLLECTION_DISPUTE_STATUSES);
/** Mismos formatos que los checks de la tabla de disputas. */
const DISPUTE_REFERENCE = /^(dp|du)_[A-Za-z0-9_]+$/;
const CHARGE_REFERENCE = /^(ch|py)_[A-Za-z0-9_]+$/;

/** Bandera de eventos, clave de prueba de Stripe y base que no es la de producción. */
function areDisputeEventsOpen(): boolean {
  return isFamilyCollectionEventsFlagEnabled() && resolveConnectEnvironment() === "test" && !isProductionDatabase();
}

/** Solo ids y códigos: nunca datos de la familia ni mensajes de Stripe. */
function eventIds(input: DisputeEventInput, extra: Record<string, unknown> = {}) {
  return {
    organizationId: input.organizationId,
    eventId: input.eventId,
    disputeId: input.objectId,
    accountId: input.account.providerAccountReference,
    ...extra,
  };
}

/** Una disputa con la forma que guarda la tabla (estado conocido, referencias con su formato). */
function isStorable(dispute: DisputeSnapshot, objectId: string): boolean {
  return (
    dispute.id === objectId &&
    dispute.id.length <= 255 &&
    DISPUTE_REFERENCE.test(dispute.id) &&
    dispute.chargeId.length <= 255 &&
    CHARGE_REFERENCE.test(dispute.chargeId) &&
    KNOWN_STATUSES.has(dispute.status)
  );
}

/** Aviso a la academia sin disputa guardada; el evento queda procesado. */
async function noticeWithoutDispute(
  input: DisputeEventInput,
  store: FamilyCollectionDisputeStore,
  attempt: CollectionAttempt,
  dispute: DisputeSnapshot,
  why: string
): Promise<DisputeEventEffect> {
  logger.warn(
    "Cobro automático: una disputa no se pudo guardar en las cuotas; aviso a la academia",
    eventIds(input, { attemptId: attempt.id, why })
  );
  await store.recordDisputeNotice({
    attempt,
    reason: DISPUTE_UNALLOCATED_REASON,
    disputeId: dispute.id,
    amountCents: dispute.amountCents,
    currency: dispute.currency ?? attempt.currency,
    now: input.now,
  });
  return { effectType: DISPUTE_REVIEW_EFFECT_TYPE, effectId: attempt.id };
}

export async function processDisputeEvent(
  input: DisputeEventInput,
  deps: FamilyCollectionDisputeDeps = {}
): Promise<DisputeEventEffect> {
  if (!areDisputeEventsOpen()) return NO_EFFECT;
  const store = deps.store ?? createFamilyCollectionDisputeStore();
  if (!(await store.isStorageAvailable())) return NO_EFFECT;
  const gateway = deps.gateway ?? createStripeDisputeGateway();

  let dispute: DisputeSnapshot | null;
  try {
    dispute = await gateway.retrieveDispute({
      connectedAccount: input.account.providerAccountReference,
      disputeId: input.objectId,
    });
  } catch (error) {
    const failure = stripeReadFailureOf(error);
    if (!failure.permanent) throw error;
    logger.warn(
      "Cobro automático: Stripe no deja leer una disputa de un evento",
      eventIds(input, { errorName: failure.errorName, errorCode: failure.errorCode })
    );
    return NO_EFFECT;
  }
  if (!dispute || !isStorable(dispute, input.objectId)) {
    logger.warn("Cobro automático: disputa de Stripe sin la forma esperada; no se aplica", eventIds(input));
    return NO_EFFECT;
  }
  const paymentIntentId = dispute.paymentIntentId;
  // Un cargo sin cobro de Zaltyko (la academia cobra otras cosas en su cuenta): no es asunto de este módulo.
  if (!paymentIntentId) return NO_EFFECT;

  const find = () => store.findAttemptByPaymentIntent({ organizationId: input.organizationId, paymentIntentId });
  let attempt = await find();
  if (!attempt) return NO_EFFECT;
  if (attempt.paymentProviderAccountId !== input.account.id) {
    logger.warn(
      "Cobro automático: disputa de una cuenta conectada que no es la del intento; no se aplica",
      eventIds(input, { attemptId: attempt.id })
    );
    return NO_EFFECT;
  }

  // La disputa necesita el pago: un cobro que el libro aún no tiene se registra antes.
  if (attempt.status !== "succeeded" && deps.recordCollection) {
    await deps.recordCollection({ ...input, objectId: paymentIntentId });
    attempt = (await find()) ?? attempt;
  }
  if (attempt.status !== "succeeded") {
    return noticeWithoutDispute(input, store, attempt, dispute, "not_collected");
  }

  const result = await store.upsertDisputeAndApply({
    organizationId: input.organizationId,
    attemptId: attempt.id,
    paymentIntentId,
    dispute,
    paymentMethodKind: dispute.paymentMethodKind ?? attempt.paymentMethodKind,
    providerEventInboxId: input.inboxId,
    environment: "test",
    now: input.now,
  });
  if (result.outcome !== "applied") return noticeWithoutDispute(input, store, attempt, dispute, result.outcome);
  if (result.review) {
    logger.warn(
      "Cobro automático: una disputa no cabe en lo repartido; se guarda sin filas y se avisa a la academia",
      eventIds(input, { attemptId: attempt.id })
    );
  }
  return { effectType: DISPUTE_EFFECT_TYPE, effectId: result.disputeId };
}
