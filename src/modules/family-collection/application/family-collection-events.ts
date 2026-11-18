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
 * 4. Buzón (idempotencia por `evt_…`): `duplicate` si ya está procesado o en
 *    curso; si no, se llama al manejador del objeto y se cierra `processed`.
 * 5. Si el manejador lanza, la fila queda `failed` con solo el código y el
 *    error se propaga para que la ruta responda 500 y Stripe reenvíe.
 *
 * El evento es solo un aviso: los manejadores vuelven a leer en Stripe, por
 * id y en la cuenta conectada, todo lo que necesiten. Se llaman fuera de
 * cualquier transacción. En esta tarea todos son vacíos; las Tareas 3 a 8 los
 * rellenan.
 */
import { db } from "@/db";
import { logger } from "@/lib/logger";
import {
  isFamilyCollectionEventsFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import { isFamilyCollectionEventsStorageAvailable } from "@/modules/family-collection/application/storage";
import {
  FAMILY_COLLECTION_EVENT_TYPES,
  providerEventErrorCode,
  routeProviderEvent,
  type ConnectedAccountEvent,
  type ProviderEventRoute,
} from "@/modules/family-collection/domain/provider-event";
import {
  claimProviderEvent,
  finishProviderEvent,
} from "@/modules/family-collection/infrastructure/provider-event-inbox";
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

const noEffect: ProviderEventHandler = async () => ({ effectType: null, effectId: null });

/** Manejadores de esta tarea: ninguno hace nada todavía. */
export const DEFAULT_PROVIDER_EVENT_HANDLERS: ProviderEventHandlers = {
  paymentIntent: noEffect,
  charge: noEffect,
  refund: noEffect,
  dispute: noEffect,
  mandate: noEffect,
  paymentMethod: noEffect,
  setupIntent: noEffect,
};

/** Los manejadores que no se pasan (o se pasan sin valor) son los vacíos. */
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
): Promise<"processed" | "duplicate" | "ignored"> {
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
  const { claim, inboxId } = await claimProviderEvent({ organizationId: account.organizationId, event, now });
  if (claim === "duplicate") return "duplicate";

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

  await finishProviderEvent({
    inboxId,
    status: "processed",
    effectType: effect.effectType,
    effectId: effect.effectId,
    errorCode: null,
    now: deps.now,
  });
  return "processed";
}
