/**
 * Cobro automático de cuotas (Fase 4): eventos de Stripe de las cuentas
 * conectadas de las academias. Funciones puras: no importan stripe-node ni
 * tocan la base.
 *
 * El evento es solo un aviso, nunca la verdad. De su cuerpo solo se leen
 * `id`, `type`, `account`, `livemode`, `created`, `data.object.id` y
 * `data.object.object`; todo lo demás se vuelve a leer en Stripe por id, en la
 * cuenta conectada. En el buzón (zaltyko.payment_provider_events) solo se
 * guardan referencias opacas y el tipo: nunca importes, nombres, correos,
 * tarjetas ni IBAN.
 */
import { stripeReadFailureOf } from "@/modules/family-collection/domain/stripe-read-error";

/** Lo único que se toma de un evento de Stripe ya verificado. */
export interface ConnectedAccountEvent {
  /** `evt_…`. */
  eventId: string;
  type: string;
  /** `acct_…` de la academia; `null` si el evento no viene de una cuenta conectada. */
  accountId: string | null;
  /** Todo lo que no sea exactamente `false` cuenta como Live. */
  livemode: boolean;
  /** Segundos Unix de Stripe. */
  created: number;
  /** `data.object.id` (`pi_…`, `re_…`…). */
  objectId: string | null;
  /** `data.object.object` (`payment_intent`, `refund`…). */
  objectType: string | null;
}

/** Tipos de evento que escucha la ruta de eventos de los cobros a familias. */
export const FAMILY_COLLECTION_EVENT_TYPES: ReadonlySet<string> = new Set([
  "payment_intent.processing",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.requires_action",
  "payment_intent.canceled",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "refund.failed",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
  "mandate.updated",
  "payment_method.detached",
  "setup_intent.succeeded",
]);

export type ProviderEventRoute =
  | { kind: "payment_intent"; paymentIntentId: string }
  | { kind: "charge"; chargeId: string }
  | { kind: "refund"; refundId: string }
  | { kind: "dispute"; disputeId: string }
  | { kind: "mandate"; mandateId: string }
  | { kind: "payment_method"; paymentMethodId: string }
  | { kind: "setup_intent"; setupIntentId: string }
  | { kind: "ignored"; reason: "type" | "object" };

type RoutedKind = Exclude<ProviderEventRoute["kind"], "ignored">;

interface RouteSpec {
  kind: RoutedKind;
  /** `data.object.object` que se espera para ese tipo de evento. */
  objectType: string;
  /** Referencia opaca que se espera en `data.object.id`. */
  idPattern: RegExp;
}

// Referencias de Stripe: prefijo y letras o números, hasta 255 caracteres.
const reference = (prefixes: string) => new RegExp(`^(?:${prefixes})_[A-Za-z0-9]{1,250}$`);

const PAYMENT_INTENT: RouteSpec = { kind: "payment_intent", objectType: "payment_intent", idPattern: reference("pi") };
// Cargo de tarjeta (`ch_`) o de domiciliación (`py_`).
const CHARGE: RouteSpec = { kind: "charge", objectType: "charge", idPattern: reference("ch|py") };
// Devolución de tarjeta (`re_`) o de domiciliación (`pyr_`, C6; se confirma en
// staging en la Tarea 14).
const REFUND: RouteSpec = { kind: "refund", objectType: "refund", idPattern: reference("re|pyr") };
// Disputa de tarjeta (`dp_`) o de domiciliación (`du_`).
const DISPUTE: RouteSpec = { kind: "dispute", objectType: "dispute", idPattern: reference("dp|du") };
const MANDATE: RouteSpec = { kind: "mandate", objectType: "mandate", idPattern: reference("mandate") };
const PAYMENT_METHOD: RouteSpec = { kind: "payment_method", objectType: "payment_method", idPattern: reference("pm") };
const SETUP_INTENT: RouteSpec = { kind: "setup_intent", objectType: "setup_intent", idPattern: reference("seti") };

const ROUTE_BY_TYPE: ReadonlyMap<string, RouteSpec> = new Map([
  ["payment_intent.processing", PAYMENT_INTENT],
  ["payment_intent.succeeded", PAYMENT_INTENT],
  ["payment_intent.payment_failed", PAYMENT_INTENT],
  ["payment_intent.requires_action", PAYMENT_INTENT],
  ["payment_intent.canceled", PAYMENT_INTENT],
  ["charge.refunded", CHARGE],
  ["refund.created", REFUND],
  ["refund.updated", REFUND],
  ["refund.failed", REFUND],
  ["charge.dispute.created", DISPUTE],
  ["charge.dispute.updated", DISPUTE],
  ["charge.dispute.closed", DISPUTE],
  ["charge.dispute.funds_withdrawn", DISPUTE],
  ["charge.dispute.funds_reinstated", DISPUTE],
  ["mandate.updated", MANDATE],
  ["payment_method.detached", PAYMENT_METHOD],
  ["setup_intent.succeeded", SETUP_INTENT],
]);

/**
 * ¿A qué manejador va el evento? Decide por `type` y comprueba que el objeto
 * sea del tipo esperado y que su id tenga el prefijo esperado. Si algo no
 * cuadra, el evento se ignora: nunca se adivina.
 */
export function routeProviderEvent(event: ConnectedAccountEvent): ProviderEventRoute {
  const spec = FAMILY_COLLECTION_EVENT_TYPES.has(event.type) ? ROUTE_BY_TYPE.get(event.type) : undefined;
  if (!spec) return { kind: "ignored", reason: "type" };
  const id = event.objectId;
  if (event.objectType !== spec.objectType || id === null || !spec.idPattern.test(id)) {
    return { kind: "ignored", reason: "object" };
  }
  switch (spec.kind) {
    case "payment_intent":
      return { kind: "payment_intent", paymentIntentId: id };
    case "charge":
      return { kind: "charge", chargeId: id };
    case "refund":
      return { kind: "refund", refundId: id };
    case "dispute":
      return { kind: "dispute", disputeId: id };
    case "mandate":
      return { kind: "mandate", mandateId: id };
    case "payment_method":
      return { kind: "payment_method", paymentMethodId: id };
    case "setup_intent":
      return { kind: "setup_intent", setupIntentId: id };
  }
}

/** Lo que se guarda del evento en el buzón: solo ids, tipo y fecha de Stripe. */
export interface ProviderEventPayload {
  type: string;
  account: string | null;
  objectType: string | null;
  objectId: string | null;
  created: number;
}

/** Siempre con las mismas claves y en el mismo orden (la huella SHA-256 sale de aquí). */
export function providerEventPayload(event: ConnectedAccountEvent): ProviderEventPayload {
  return {
    type: event.type,
    account: event.accountId,
    objectType: event.objectType,
    objectId: event.objectId,
    created: event.created,
  };
}

/**
 * Código que se guarda en `last_error` y que va al registro cuando un
 * manejador falla: el código de Stripe (`card_declined`…), el código propio
 * (`LATE_SUCCESS_SIBLING_IN_FLIGHT`…) o, si no hay, el nombre del error.
 * Nunca su mensaje: puede llevar datos del banco o de la familia.
 */
export function providerEventErrorCode(error: unknown): string {
  const failure = stripeReadFailureOf(error);
  return failure.errorCode ?? failure.errorName;
}
