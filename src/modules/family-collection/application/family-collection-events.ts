/**
 * Cobro automático de cuotas (Fase 4): qué se hace con un evento de Stripe ya
 * verificado que llega a /api/stripe/connect/payments-webhook.
 *
 * 1. Cerrojos: bandera ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED, clave de
 *    prueba de Stripe, base que no es la de producción, evento con
 *    `livemode === false`, de una cuenta conectada y de un tipo de la lista.
 *    Si falta algo, se ignora sin escribir nada.
 * 2. Almacenamiento de las Fases 1–4 presente (forma "phase4" del cobro, más
 *    las columnas de Conectar Stripe y de los métodos de pago). Si no, se
 *    ignora.
 * 3. La cuenta `acct_…` tiene que ser una cuenta conectada de una academia en
 *    el entorno `test`. Si no, se ignora (solo ids en el registro).
 * 4. Buzón (idempotencia por `evt_…`): `duplicate` si ya está procesado;
 *    `in_progress` si otra entrega lo está procesando desde hace menos de 5
 *    minutos (la ruta responde 503 y Stripe lo reenvía); si no, se llama al
 *    manejador del objeto y se cierra `processed`.
 * 5. Si el manejador lanza, la fila queda `failed` con solo el código y el
 *    error se propaga para que la ruta responda 500 y Stripe reenvíe.
 *
 * El evento es solo un aviso: los manejadores vuelven a leer en Stripe, por
 * id y en la cuenta conectada, todo lo que necesiten. Se llaman fuera de
 * cualquier transacción. El de los cobros (`payment_intent.*`) es
 * `handlePaymentIntentEvent` (Tarea 3); los de las devoluciones
 * (`charge.refunded` y `refund.*`) son `handleChargeRefundEvent` y
 * `handleRefundEvent` (Tarea 6, family-collection-refunds.ts); el de las
 * disputas (`charge.dispute.*`) es `handleDisputeEvent` (Tarea 7,
 * family-collection-disputes.ts); los del método de pago
 * (`payment_method.detached`, `mandate.updated` y `setup_intent.succeeded`)
 * son `handlePaymentMethodEvent`, `handleMandateEvent` y
 * `handleSetupIntentEvent` (Tarea 8, más abajo).
 *
 * Cobros (`handlePaymentIntentEvent`), por el mismo camino que la relectura
 * diaria (`reconcileAttemptWithStripe` → `settleOutcome` → `applyOutcome`):
 * 1. Se busca el intento por su `pi_…` en esa academia. Si no está, se relee
 *    el cobro en Stripe: si su metadata apunta a un intento `claimed` de esa
 *    academia y esa cuenta, se le guarda el `pi_…` (`markCreated`) y se
 *    sigue; si no, sin efecto.
 * 2. La cuenta del evento tiene que ser la del intento; si no, sin efecto
 *    (aviso en el registro, solo ids).
 * 3. Intento abierto (`claimed`, `created`, `processing`, `requires_action`)
 *    → se relee y se aplica lo que diga Stripe. Sin resultado todavía
 *    (`transient`, `requires_confirmation`) no se escribe nada. Fase 4
 *    (Tarea 4): si el banco pide que la familia confirme un cobro de tarjeta,
 *    el intento pasa a `requires_action` sin cancelar el cobro; mientras
 *    espera, un evento nunca lo cancela antes de su plazo.
 * 4. Intento cerrado (`failed`/`canceled`) cuyo cobro Stripe da por cobrado:
 *    cobro tardío, nunca dos cobros (settleClosedAttempt, la misma función
 *    que la relectura diaria). Si la factura ya tiene otro intento cobrado
 *    (o sus cuotas ya están pagadas), no se registra y la academia recibe el
 *    aviso `duplicate_collection` (D10). Si tiene uno `claimed` sin `pi_…`
 *    (el proceso diario lo está creando), se lanza
 *    LATE_SUCCESS_SIBLING_IN_FLIGHT: el evento queda `failed` y Stripe lo
 *    reenvía. Si tiene otro abierto con su `pi_…`, se cancela en Stripe
 *    (fuera de toda transacción, `cancelThenClose` con
 *    `late_success_elsewhere`); si Stripe ya lo había cobrado, se registra
 *    ese y el tardío queda `duplicate_collection`. Si Stripe no deja
 *    cancelarlo (una domiciliación en el banco), el tardío queda en espera con
 *    el aviso `late_success_pending` y el evento termina procesado: la
 *    relectura diaria lo registra cuando el banco resuelva. Solo entonces se
 *    registra el tardío y se anulan los reintentos pendientes de la factura,
 *    en una transacción con el orden único.
 * 5. Domiciliación: `processing` → en curso; cobrada → registro; fallida →
 *    `failed` sin reintento y, en el intento 1, el mismo aviso a la familia
 *    que con tarjeta, sin prometer reintento (`sepa_failed`, D11).
 */
import { db } from "@/db";
import { logger } from "@/lib/logger";
import {
  isFamilyCollectionEventsFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import {
  createRunState,
  type FamilyCollectionDeps,
} from "@/modules/family-collection/application/family-collection-service";
import { processDisputeEvent } from "@/modules/family-collection/application/family-collection-disputes";
import {
  handleChargeRefundEvent,
  handleRefundEvent,
} from "@/modules/family-collection/application/family-collection-refunds";
import {
  reconcileAttemptWithStripe,
  settleClosedAttempt,
  type ClosedAttemptOutcome,
} from "@/modules/family-collection/application/family-collection-reconcile";
import {
  countSkip,
  type FamilyCollectionRunResult,
  type RunState,
} from "@/modules/family-collection/application/family-collection-steps";
import { isFamilyCollectionEventsStorageAvailable } from "@/modules/family-collection/application/storage";
import type { PaymentIntentSnapshot } from "@/modules/family-collection/domain/payment-outcome";
import { stripeReadFailureOf } from "@/modules/family-collection/domain/stripe-read-error";
import {
  FAMILY_COLLECTION_EVENT_TYPES,
  providerEventErrorCode,
  routeProviderEvent,
  type ConnectedAccountEvent,
  type ProviderEventRoute,
} from "@/modules/family-collection/domain/provider-event";
import type { CollectionAttempt } from "@/modules/family-collection/infrastructure/family-collection-store";
import { FAMILY_COLLECTION_OPEN_STATUSES } from "@/modules/family-collection/infrastructure/family-collection-schema";
import {
  claimProviderEvent,
  finishProviderEvent,
} from "@/modules/family-collection/infrastructure/provider-event-inbox";
import {
  completeFamilyPaymentSetupFromProvider,
  revokeAuthorizationFromProvider,
  type FamilyPaymentMethodsDeps,
  type FamilyPaymentProviderReadDeps,
} from "@/modules/family-payment-methods/application/family-payment-methods-service";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import {
  findConnectAccountByReference,
  type StoredConnectAccount,
} from "@/modules/payments-connect/infrastructure/connect-account-store";

export interface ProviderEventHandlerInput {
  organizationId: string;
  /** Cuenta conectada de la academia en el entorno `test` (la del evento). */
  account: StoredConnectAccount;
  /** Referencia opaca del objeto del evento (`pi_…`, `re_…`, `dp_…`…). */
  objectId: string;
  now: Date;
  /**
   * Fila del buzón (zaltyko.payment_provider_events.id) de la misma academia:
   * la usan las devoluciones (`refunds.provider_event_id`) y las disputas
   * (`last_provider_event_id`) como clave foránea.
   */
  inboxId: string;
  /** `evt_…` de Stripe, solo para el registro. */
  eventId: string;
}

export interface ProviderEventEffect {
  effectType: string | null;
  /** Id (uuid) de la fila de Zaltyko que cambió, o `null`. */
  effectId: string | null;
}

export type ProviderEventHandler = (input: ProviderEventHandlerInput) => Promise<ProviderEventEffect>;

export interface ProviderEventHandlers {
  paymentIntent: ProviderEventHandler;
  charge: ProviderEventHandler;
  refund: ProviderEventHandler;
  dispute: ProviderEventHandler;
  mandate: ProviderEventHandler;
  paymentMethod: ProviderEventHandler;
  setupIntent: ProviderEventHandler;
}

const NO_EFFECT: ProviderEventEffect = { effectType: null, effectId: null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El id del efecto que se guarda en el buzón (`effect_id` es uuid). Un id con
 * otro formato no se guarda (queda `null`): si se intentara guardar, el cierre
 * fallaría con el efecto ya aplicado y el evento se reprocesaría cada 5 minutos.
 */
export function inboxEffectId(effectId: string | null): string | null {
  if (effectId === null) return null;
  return UUID_PATTERN.test(effectId) ? effectId : null;
}

// ---------------------------------------------------------------------------
// Cobros (`payment_intent.*`): el mismo camino que la relectura diaria
// ---------------------------------------------------------------------------

/** Lo que deja el evento de un cobro: su efecto y lo que contó la pasada (o null sin pasada). */
export interface PaymentIntentEventOutcome {
  effect: ProviderEventEffect;
  result: FamilyCollectionRunResult | null;
}

/** Tipo de efecto del buzón cuando el evento cambió un intento. */
export const ATTEMPT_EFFECT_TYPE = "family_collection_attempt";

/** Estados en los que un intento todavía puede avanzar (se relee y se aplica). */
const OPEN_ATTEMPT_STATUSES: ReadonlySet<string> = new Set(FAMILY_COLLECTION_OPEN_STATUSES);

/**
 * Efecto en el buzón: el intento, si el evento lo cambió (un estado escrito o
 * el aviso `late_success_pending` de un cobro tardío en espera); si no, nada.
 */
function effectOf(attempt: CollectionAttempt, outcome: ClosedAttemptOutcome): ProviderEventEffect {
  return outcome === null ? NO_EFFECT : { effectType: ATTEMPT_EFFECT_TYPE, effectId: attempt.id };
}

/** Solo ids: nunca datos de la familia ni mensajes de Stripe. */
function eventIds(input: ProviderEventHandlerInput, extra: Record<string, unknown> = {}) {
  return {
    organizationId: input.organizationId,
    eventId: input.eventId,
    paymentIntentId: input.objectId,
    accountId: input.account.providerAccountReference,
    ...extra,
  };
}

/**
 * Regla 1: un `pi_…` que no está guardado en ningún intento. Se relee en
 * Stripe (en la cuenta del evento): si su metadata apunta a un intento
 * `claimed` de esa academia y esa cuenta, se le guarda el `pi_…`. Si Stripe
 * dice que ese cobro no existe o no es accesible (error permanente), sin
 * efecto; un error pasajero sigue hacia arriba (Stripe reenvía el evento).
 */
async function adoptClaimedAttempt(
  state: RunState,
  input: ProviderEventHandlerInput
): Promise<CollectionAttempt | null> {
  let snapshot: PaymentIntentSnapshot;
  try {
    snapshot = await state.gateway.retrievePayment({
      connectedAccount: input.account.providerAccountReference,
      paymentIntentId: input.objectId,
    });
  } catch (error) {
    const failure = stripeReadFailureOf(error);
    if (!failure.permanent) throw error;
    logger.warn(
      "Cobro automático: Stripe no deja leer el cobro de un evento",
      eventIds(input, { errorName: failure.errorName, errorCode: failure.errorCode })
    );
    return null;
  }
  const attemptId = snapshot.attemptIdFromMetadata ?? null;
  // Un cobro que no creó el cobro automático de Zaltyko (la academia cobra
  // otras cosas en su cuenta): no es asunto de este módulo.
  if (attemptId === null || snapshot.id !== input.objectId) return null;
  const claimed = await state.store.findClaimedAttemptById({ organizationId: input.organizationId, attemptId });
  if (!claimed) return null;
  if (claimed.paymentProviderAccountId !== input.account.id) {
    logger.warn("Cobro automático: evento de un cobro de otra cuenta conectada; no se aplica", eventIds(input, { attemptId }));
    return null;
  }
  if (
    await state.store.markCreated({
      organizationId: input.organizationId,
      attemptId,
      paymentIntentId: snapshot.id,
      now: state.now,
    })
  ) {
    return { ...claimed, status: "created", paymentIntentId: snapshot.id };
  }
  // Otro camino (el proceso diario) le guardó el `pi_…` a la vez: se usa lo que haya.
  countSkip(state, "concurrent");
  return state.store.findAttemptByPaymentIntent({ organizationId: input.organizationId, paymentIntentId: input.objectId });
}

async function settlePaymentIntentEvent(
  state: RunState,
  input: ProviderEventHandlerInput
): Promise<ProviderEventEffect> {
  const attempt =
    (await state.store.findAttemptByPaymentIntent({
      organizationId: input.organizationId,
      paymentIntentId: input.objectId,
    })) ?? (await adoptClaimedAttempt(state, input));
  if (!attempt) return NO_EFFECT;

  // Regla 2: la cuenta del evento tiene que ser la del intento.
  if (attempt.paymentProviderAccountId !== input.account.id) {
    logger.warn(
      "Cobro automático: evento de una cuenta conectada que no es la del intento; no se aplica",
      eventIds(input, { attemptId: attempt.id })
    );
    return NO_EFFECT;
  }

  // Regla 3 (y 5): abierto → se relee y se aplica, como la relectura diaria.
  if (OPEN_ATTEMPT_STATUSES.has(attempt.status)) {
    return effectOf(attempt, await reconcileAttemptWithStripe(state, attempt));
  }
  // Regla 4: cerrado sin cobro → ¿se cobró tarde?
  if (attempt.status === "failed" || attempt.status === "canceled") {
    return effectOf(attempt, await settleClosedAttempt(state, attempt, { source: "event" }));
  }
  // Ya cobrado: un evento atrasado (p. ej. `processing` después de
  // `succeeded`) no cambia nada.
  return NO_EFFECT;
}

/**
 * Evento de un cobro (`payment_intent.*`) con sus dependencias: el estado de
 * una pasada en modo `"event"` (cerrojos, bandera de eventos y
 * almacenamiento). Sin estado, sin efecto. Devuelve también lo que contó la
 * pasada (`concurrent`, `collected`…), para los tests y el registro.
 */
export async function processPaymentIntentEvent(
  input: ProviderEventHandlerInput,
  deps: FamilyCollectionDeps = {}
): Promise<PaymentIntentEventOutcome> {
  const state = await createRunState({ now: input.now }, deps, "event");
  if (!state) return { effect: NO_EFFECT, result: null };
  const effect = await settlePaymentIntentEvent(state, input);
  return { effect, result: state.result };
}

/** Manejador de los eventos `payment_intent.*` con las dependencias reales. */
export const handlePaymentIntentEvent: ProviderEventHandler = async (input) =>
  (await processPaymentIntentEvent(input)).effect;

/**
 * Manejador de `charge.dispute.*` (Tarea 7) con las dependencias reales. Si
 * el libro aún no tiene el cobro disputado, lo registra antes por el camino
 * de los cobros (processPaymentIntentEvent con el `pi_…` de la disputa).
 */
export const handleDisputeEvent: ProviderEventHandler = (input) =>
  processDisputeEvent(input, {
    recordCollection: (collectionInput) => processPaymentIntentEvent(collectionInput),
  });

// ---------------------------------------------------------------------------
// Método de pago (Tarea 8): desligado, orden de domiciliación y preparación
// ---------------------------------------------------------------------------

/** Tipo de efecto del buzón cuando el evento cambió una autorización de pago automático. */
export const AUTHORIZATION_EFFECT_TYPE = "family_payment_authorization";

function authorizationEffect(authorizationId: string): ProviderEventEffect {
  return { effectType: AUTHORIZATION_EFFECT_TYPE, effectId: authorizationId };
}

/**
 * `payment_method.detached`: se relee el `pm_…` en la cuenta del evento; si
 * Stripe confirma que ya no está ligado a ningún cliente (o ya no existe), la
 * autorización activa de esa academia y esa cuenta con ese método queda
 * revocada (revokeAuthorizationFromProvider). Si Stripe aún lo tiene ligado,
 * sin efecto. Los intentos de cobro no se tocan.
 */
export async function processPaymentMethodEvent(
  input: ProviderEventHandlerInput,
  deps: FamilyPaymentProviderReadDeps = {}
): Promise<ProviderEventEffect> {
  const result = await revokeAuthorizationFromProvider(
    {
      organizationId: input.organizationId,
      accountRowId: input.account.id,
      paymentMethodId: input.objectId,
      reason: "detached_in_stripe",
      now: input.now,
    },
    deps
  );
  return result.outcome === "revoked" ? authorizationEffect(result.authorizationId) : NO_EFFECT;
}

/**
 * `mandate.updated` (domiciliación; también con la domiciliación del cobro
 * automático apagada por su bandera): se relee la orden; solo `inactive`
 * revoca la autorización con esa orden. `active` o `pending`, sin efecto.
 */
export async function processMandateEvent(
  input: ProviderEventHandlerInput,
  deps: FamilyPaymentProviderReadDeps = {}
): Promise<ProviderEventEffect> {
  const result = await revokeAuthorizationFromProvider(
    {
      organizationId: input.organizationId,
      accountRowId: input.account.id,
      mandateId: input.objectId,
      reason: "mandate_inactive",
      now: input.now,
    },
    deps
  );
  return result.outcome === "revoked" ? authorizationEffect(result.authorizationId) : NO_EFFECT;
}

/**
 * `setup_intent.succeeded` (decisión 12 del ADR): la familia guardó el
 * método en Stripe y cerró el navegador. Se relee el `seti_…` y se activa el
 * intento de preparación abierto con esa referencia, una sola vez
 * (completeFamilyPaymentSetupFromProvider).
 */
export async function processSetupIntentEvent(
  input: ProviderEventHandlerInput,
  deps: FamilyPaymentMethodsDeps = {}
): Promise<ProviderEventEffect> {
  const result = await completeFamilyPaymentSetupFromProvider(
    {
      organizationId: input.organizationId,
      accountRowId: input.account.id,
      setupIntentId: input.objectId,
      now: input.now,
    },
    deps
  );
  return result.outcome === "active" ? authorizationEffect(result.authorizationId) : NO_EFFECT;
}

/** Manejadores de la Tarea 8 con las dependencias reales. */
export const handlePaymentMethodEvent: ProviderEventHandler = (input) => processPaymentMethodEvent(input);
export const handleMandateEvent: ProviderEventHandler = (input) => processMandateEvent(input);
export const handleSetupIntentEvent: ProviderEventHandler = (input) => processSetupIntentEvent(input);

/**
 * Manejadores por defecto: los cobros (Tarea 3), las devoluciones hechas
 * desde el panel de Stripe (Tarea 6), las disputas (Tarea 7) y el método de
 * pago (Tarea 8).
 */
export const DEFAULT_PROVIDER_EVENT_HANDLERS: ProviderEventHandlers = {
  paymentIntent: handlePaymentIntentEvent,
  charge: handleChargeRefundEvent,
  refund: handleRefundEvent,
  dispute: handleDisputeEvent,
  mandate: handleMandateEvent,
  paymentMethod: handlePaymentMethodEvent,
  setupIntent: handleSetupIntentEvent,
};

/** Los manejadores que no se pasan (o se pasan sin valor) son los de DEFAULT_PROVIDER_EVENT_HANDLERS. */
function withDefaults(overrides: Partial<ProviderEventHandlers> | undefined): ProviderEventHandlers {
  const merged = { ...DEFAULT_PROVIDER_EVENT_HANDLERS };
  for (const key of Object.keys(merged) as Array<keyof ProviderEventHandlers>) {
    const handler = overrides?.[key];
    if (handler) merged[key] = handler;
  }
  return merged;
}

type RoutedEvent = Exclude<ProviderEventRoute, { kind: "ignored" }>;

function handlerFor(
  route: RoutedEvent,
  handlers: ProviderEventHandlers
): { handler: ProviderEventHandler; objectId: string } {
  switch (route.kind) {
    case "payment_intent":
      return { handler: handlers.paymentIntent, objectId: route.paymentIntentId };
    case "charge":
      return { handler: handlers.charge, objectId: route.chargeId };
    case "refund":
      return { handler: handlers.refund, objectId: route.refundId };
    case "dispute":
      return { handler: handlers.dispute, objectId: route.disputeId };
    case "mandate":
      return { handler: handlers.mandate, objectId: route.mandateId };
    case "payment_method":
      return { handler: handlers.paymentMethod, objectId: route.paymentMethodId };
    case "setup_intent":
      return { handler: handlers.setupIntent, objectId: route.setupIntentId };
  }
}

/** Bandera, clave de prueba y base que no es la de producción. */
export function areFamilyCollectionEventsOpen(): boolean {
  return isFamilyCollectionEventsFlagEnabled() && resolveConnectEnvironment() === "test" && !isProductionDatabase();
}

/** Almacenamiento de las Fases 1 (cuentas), 2 (métodos de pago), 3 y 4 (cobro). */
async function isEventsStorageReady(): Promise<boolean> {
  const [events, paymentMethods, connect] = await Promise.all([
    isFamilyCollectionEventsStorageAvailable(db),
    isFamilyPaymentMethodsStorageAvailable(db),
    isConnectOnboardingStorageAvailable(db),
  ]);
  return events && paymentMethods && connect;
}

export async function handleFamilyCollectionEvent(
  event: ConnectedAccountEvent,
  deps: { handlers?: Partial<ProviderEventHandlers>; now?: Date } = {}
): Promise<"processed" | "duplicate" | "in_progress" | "ignored"> {
  // La ruta ya comprueba todo esto; se repite aquí porque es lo que protege
  // el dinero si alguien llama a esta función desde otro sitio.
  if (!areFamilyCollectionEventsOpen()) return "ignored";
  if (event.livemode !== false || !event.accountId || !FAMILY_COLLECTION_EVENT_TYPES.has(event.type)) {
    return "ignored";
  }
  const route = routeProviderEvent(event);
  if (route.kind === "ignored") return "ignored";

  if (!(await isEventsStorageReady())) return "ignored";

  const account = await findConnectAccountByReference(db, "test", event.accountId);
  if (!account || account.environment !== "test") {
    logger.info("Cobro automático: evento de una cuenta conectada que no es de ninguna academia en pruebas", {
      eventId: event.eventId,
      eventType: event.type,
      accountId: event.accountId,
    });
    return "ignored";
  }

  const now = deps.now ?? new Date();
  const { claim, inboxId, attempts } = await claimProviderEvent({ organizationId: account.organizationId, event, now });
  if (claim === "other_organization") {
    // El mismo evt_ ya está guardado en otra academia: 200 duplicado, pero visible (solo ids).
    logger.info("Cobro automático: evento de Stripe ya guardado en otra academia", {
      eventId: event.eventId,
      eventType: event.type,
      accountId: event.accountId,
      organizationId: account.organizationId,
      inboxId,
    });
    return "duplicate";
  }
  if (claim !== "process") return claim;

  const { handler, objectId } = handlerFor(route, withDefaults(deps.handlers));
  let effect: ProviderEventEffect;
  try {
    effect = await handler({
      organizationId: account.organizationId,
      account,
      objectId,
      now,
      inboxId,
      eventId: event.eventId,
    });
  } catch (error) {
    const errorCode = providerEventErrorCode(error);
    try {
      await finishProviderEvent({
        inboxId,
        attempts,
        status: "failed",
        effectType: null,
        effectId: null,
        errorCode,
        now: deps.now,
      });
    } catch (finishError) {
      // La fila se queda `processing`: pasados 5 minutos, un reenvío la vuelve a reclamar.
      logger.error("Cobro automático: no se pudo marcar como fallido un evento de Stripe", undefined, {
        eventId: event.eventId,
        eventType: event.type,
        accountId: event.accountId,
        errorName: finishError instanceof Error ? finishError.name : "unknown",
      });
    }
    throw error;
  }

  const effectId = inboxEffectId(effect.effectId);
  if (effectId !== effect.effectId) {
    logger.warn("Cobro automático: el efecto de un evento no tiene un id guardable; se cierra sin él", {
      eventId: event.eventId,
      eventType: event.type,
      effectType: effect.effectType,
    });
  }
  const closed = await finishProviderEvent({
    inboxId,
    attempts,
    status: "processed",
    effectType: effect.effectType,
    effectId,
    errorCode: null,
    now: deps.now,
  });
  if (!closed) {
    // Otra entrega más nueva reclamó la fila: su cierre es el que cuenta.
    logger.info("Cobro automático: el cierre de un evento lo hizo otra entrega más nueva", {
      eventId: event.eventId,
      eventType: event.type,
      inboxId,
    });
  }
  return "processed";
}
