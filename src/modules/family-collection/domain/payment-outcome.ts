/**
 * Cobro automático de cuotas (Fase 3): qué significa para el intento lo que
 * Stripe devolvió al crear, confirmar o releer un cobro. Función pura: no
 * importa tipos de stripe-node; el adaptador
 * (infrastructure/stripe-collection-gateway.ts) traduce a estas formas mínimas.
 *
 * Regla de dinero: nunca se da un cobro por fallido sin haber leído su estado
 * en Stripe. Un error que no trae el cobro (red, límite de peticiones, error
 * interno de Stripe…) es siempre `transient`: el intento se queda como está y
 * la reanudación del día siguiente relee el cobro. La única excepción es
 * `finalCreateErrorCode`: al CREAR el cobro, unos pocos rechazos de Stripe
 * dicen con seguridad que no se creó nada y que repetir no lo arreglará.
 *
 * Un cobro hecho solo se registra si Stripe dice que se cobró exactamente el
 * importe del intento y en euros (`receivedMatches`).
 */
import { SUPPORTED_COLLECTION_CURRENCY } from "./collection-gate";
import { stripeReadFailureOf } from "./stripe-read-error";

/** Lo que se guarda de un cobro de Stripe: solo su id, estado, códigos e importe y moneda cobrados. */
export interface PaymentIntentSnapshot {
  id: string;
  /** Estado del cobro en Stripe (`succeeded`, `processing`, `requires_payment_method`…). */
  status: string;
  /** `last_payment_error.code`, solo si es un código. */
  lastErrorCode: string | null;
  /** `last_payment_error.decline_code`, solo si es un código. */
  lastDeclineCode: string | null;
  /**
   * `amount_received`: lo que Stripe dice que se cobró, en céntimos. Sin él
   * (ausente o `null`) el importe es desconocido y un cobro hecho no se
   * registra: lo revisa la academia.
   */
  amountReceivedCents?: number | null;
  /** `currency` del cobro en mayúsculas (`EUR`); ausente o `null` si no vino. */
  currency?: string | null;
}

/** Lo que Stripe dice que se cobró de verdad: importe en céntimos y moneda. */
export interface ReceivedAmount {
  amountCents: number | null;
  currency: string | null;
}

/**
 * Motivo del aviso a la academia cuando Stripe cobró otro importe u otra
 * moneda que la del intento: el pago no se registra en el libro y el intento
 * se queda como está (su dinero se movió).
 */
export const AMOUNT_MISMATCH_REASON = "amount_mismatch";

/** Importe y moneda cobrados según un snapshot (desconocidos si no hay snapshot). */
export function receivedOf(snapshot: PaymentIntentSnapshot | null): ReceivedAmount {
  return {
    amountCents: snapshot?.amountReceivedCents ?? null,
    currency: snapshot?.currency ?? null,
  };
}

/**
 * ¿Cobró Stripe exactamente lo que pedía el intento? Mismo importe en
 * céntimos y en euros. Un importe o una moneda desconocidos no cuadran nunca.
 */
export function receivedMatches(
  received: ReceivedAmount,
  expected: { amountCents: number; currency: string }
): boolean {
  return (
    received.amountCents !== null &&
    Number.isSafeInteger(received.amountCents) &&
    received.amountCents === expected.amountCents &&
    received.currency === SUPPORTED_COLLECTION_CURRENCY &&
    expected.currency.toUpperCase() === SUPPORTED_COLLECTION_CURRENCY
  );
}

/**
 * Error de Stripe al confirmar, ya traducido por el adaptador. Solo códigos:
 * nunca el mensaje de Stripe ni datos de la tarjeta o del banco.
 */
export interface CollectionError {
  /** Tipo del error de Stripe (`card_error`, `idempotency_error`…), si se conoce. */
  type?: string | null;
  code: string | null;
  declineCode: string | null;
  /** El cobro que acompaña al error, si Stripe lo devolvió. */
  paymentIntent: PaymentIntentSnapshot | null;
}

/**
 * Forma mínima de un error tal como lo lanza stripe-node (`type` es el nombre
 * de la clase, `rawType` el tipo de la API) o tal como llega en el JSON de la
 * API. Todo es opcional: cualquier objeto encaja.
 */
export interface StripeErrorLike {
  type?: string | null;
  rawType?: string | null;
  code?: string | null;
  decline_code?: string | null;
  statusCode?: number | null;
  payment_intent?: {
    id?: string | null;
    status?: string | null;
    last_payment_error?: {
      code?: string | null;
      decline_code?: string | null;
    } | null;
  } | null;
}

export interface PaymentFailure {
  code: string;
  declineCode: string | null;
}

export type PaymentOutcome =
  | "succeeded"
  | "processing"
  /** Creado en Stripe y todavía sin confirmar. */
  | "requires_confirmation"
  | { failed: PaymentFailure }
  /** No se sabe el resultado: el intento se queda como está y se reanuda. */
  | "transient"
  /** Stripe rechazó la clave de idempotencia: nunca se crea otro cobro. */
  | "idempotency_conflict";

/** El banco pide que la persona confirme el pago (3DS). */
export const AUTHENTICATION_REQUIRED_CODE = "authentication_required";

/** Código cuando el cobro falló sin que Stripe diera uno. */
export const UNKNOWN_FAILURE_CODE = "payment_failed";

/**
 * Forma de un código de Stripe (`card_declined`, `insufficient_funds`…), con
 * el límite de las columnas `failure_code`/`decline_code`. Cualquier otra cosa
 * (un mensaje del banco, por ejemplo) se descarta.
 */
export const STRIPE_CODE_PATTERN = /^[a-z0-9_]{1,64}$/i;

/** Solo códigos de Stripe; lo demás, `null`. */
export function codeOf(value: unknown): string | null {
  return typeof value === "string" && STRIPE_CODE_PATTERN.test(value) ? value : null;
}

/** Estados de Stripe en los que el cobro no salió y ya no va a salir solo. */
const FAILED_STATUSES: ReadonlySet<string> = new Set([
  "requires_payment_method",
  "requires_action",
  "canceled",
]);

const IDEMPOTENCY_ERROR_TYPES: ReadonlySet<string> = new Set([
  "idempotency_error",
  "StripeIdempotencyError",
]);

/** Otra petición con la misma clave sigue en curso: se reintenta más tarde. */
const IDEMPOTENCY_IN_USE_CODE = "idempotency_key_in_use";

export function isAuthenticationRequiredFailure(failure: {
  code: string | null;
  declineCode: string | null;
}): boolean {
  return (
    failure.code === AUTHENTICATION_REQUIRED_CODE ||
    failure.declineCode === AUTHENTICATION_REQUIRED_CODE
  );
}

function failed(
  snapshot: PaymentIntentSnapshot,
  overrides: { code: string | null; declineCode: string | null } = {
    code: null,
    declineCode: null,
  }
): PaymentOutcome {
  const declineCode = overrides.declineCode ?? codeOf(snapshot.lastDeclineCode);
  const code =
    overrides.code ??
    codeOf(snapshot.lastErrorCode) ??
    // `requires_action` sin código: el banco pide autenticación. En esta fase
    // es un fallo terminal; la Fase 4 la hará recuperable.
    (snapshot.status === "requires_action" ? AUTHENTICATION_REQUIRED_CODE : null) ??
    UNKNOWN_FAILURE_CODE;
  return { failed: { code, declineCode } };
}

function mapSnapshot(
  snapshot: PaymentIntentSnapshot,
  overrides?: { code: string | null; declineCode: string | null }
): PaymentOutcome {
  switch (snapshot.status) {
    case "succeeded":
      return "succeeded";
    case "processing":
    // Sin captura manual en este flujo; si apareciera, el dinero está
    // autorizado y nunca se da por fallido: se relee como en curso.
    case "requires_capture":
      return "processing";
    case "requires_confirmation":
      return "requires_confirmation";
    default:
      if (FAILED_STATUSES.has(snapshot.status)) return failed(snapshot, overrides);
      // Estado desconocido: no se decide nada sin entenderlo.
      return "transient";
  }
}

function mapCollectionError(error: CollectionError): PaymentOutcome {
  const code = codeOf(error.code);
  if (code === IDEMPOTENCY_IN_USE_CODE) return "transient";
  if (typeof error.type === "string" && IDEMPOTENCY_ERROR_TYPES.has(error.type)) {
    return "idempotency_conflict";
  }
  // Sin el cobro no se sabe qué pasó en Stripe: nunca se da por fallido. (Al
  // crear, los rechazos seguros los decide antes finalCreateErrorCode.)
  if (!error.paymentIntent) return "transient";
  return mapSnapshot(error.paymentIntent, {
    code,
    declineCode: codeOf(error.declineCode),
  });
}

const CURRENCY_PATTERN = /^[a-z]{3}$/i;

/**
 * Snapshot de un cobro tal como lo devuelve Stripe (respuesta de la API o el
 * `payment_intent` de un error): id, estado, códigos del último error e importe
 * y moneda cobrados.
 * `null` si le falta el id o el estado.
 */
export function snapshotOfPaymentIntent(value: unknown): PaymentIntentSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as {
    id?: unknown;
    status?: unknown;
    amount_received?: unknown;
    currency?: unknown;
    last_payment_error?: { code?: unknown; decline_code?: unknown } | null;
  };
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return null;
  if (typeof candidate.status !== "string" || candidate.status.length === 0) return null;
  const lastError =
    typeof candidate.last_payment_error === "object" && candidate.last_payment_error !== null
      ? candidate.last_payment_error
      : null;
  const amountReceived = candidate.amount_received;
  return {
    id: candidate.id,
    status: candidate.status,
    lastErrorCode: codeOf(lastError?.code),
    lastDeclineCode: codeOf(lastError?.decline_code),
    amountReceivedCents:
      typeof amountReceived === "number" && Number.isSafeInteger(amountReceived) && amountReceived >= 0
        ? amountReceived
        : null,
    currency:
      typeof candidate.currency === "string" && CURRENCY_PATTERN.test(candidate.currency)
        ? candidate.currency.toUpperCase()
        : null,
  };
}

/**
 * Rechazos de Stripe al CREAR el cobro que dicen con seguridad que no se creó
 * nada y que repetir no lo arreglará:
 * - `amount_too_small`: el importe no llega al mínimo de Stripe;
 * - `resource_missing`: el cliente o el método de pago de la familia ya no
 *   existen en la cuenta de la academia;
 * - `account_invalid`: la cuenta de la academia ya no es válida;
 * - `payment_method_unactivated` y `capability_not_active`: ese tipo de pago
 *   (tarjeta o domiciliación) no está activo en la cuenta de la academia.
 */
const FINAL_CREATE_CODES: ReadonlySet<string> = new Set([
  "amount_too_small",
  "resource_missing",
  "account_invalid",
  "payment_method_unactivated",
  "capability_not_active",
]);

/**
 * Código con el que se cierra (`canceled`) un intento cuyo cobro Stripe se
 * negó a CREAR, o `null` si hay que tratarlo como pasajero. Solo para errores
 * de la creación y solo si el error no trae un cobro: con cobro, manda su
 * estado. Los errores de red, límite de peticiones, error interno de Stripe,
 * permisos o bloqueos siguen siendo pasajeros. El código se lee igual que al
 * releer un cobro (stripeReadFailureOf): nunca el mensaje.
 */
export function finalCreateErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const attached = (error as { payment_intent?: unknown }).payment_intent;
  if (attached !== undefined && attached !== null) return null;
  const code = stripeReadFailureOf(error).errorCode?.toLowerCase() ?? null;
  return code !== null && FINAL_CREATE_CODES.has(code) ? code : null;
}

/**
 * `CollectionError` a partir de un error de stripe-node o del JSON de la API.
 * El tipo es el de la API (`card_error`) si lo hay; si no, el nombre de la
 * clase del SDK. Solo códigos: nunca el mensaje.
 */
export function collectionErrorOf(error: StripeErrorLike): CollectionError {
  const type =
    typeof error.rawType === "string"
      ? error.rawType
      : typeof error.type === "string"
        ? error.type
        : null;
  return {
    type,
    code: codeOf(error.code),
    declineCode: codeOf(error.decline_code),
    paymentIntent: snapshotOfPaymentIntent(error.payment_intent),
  };
}

function isSnapshot(
  value: PaymentIntentSnapshot | CollectionError | StripeErrorLike
): value is PaymentIntentSnapshot {
  return (
    typeof (value as Partial<PaymentIntentSnapshot>).id === "string" &&
    typeof (value as Partial<PaymentIntentSnapshot>).status === "string" &&
    "lastErrorCode" in value
  );
}

function isCollectionError(
  value: CollectionError | StripeErrorLike
): value is CollectionError {
  return "declineCode" in value && "paymentIntent" in value;
}

/**
 * Resultado de un cobro a partir de su estado en Stripe o del error de una
 * llamada:
 * - `succeeded`, `processing` (SEPA o tarjeta pendiente) y
 *   `requires_confirmation` (creado y sin confirmar) salen del estado.
 * - `{ failed }` solo cuando se conoce el cobro y Stripe lo dejó sin pagar.
 *   `authentication_required` es un fallo terminal en esta fase.
 * - `idempotency_conflict`: Stripe rechazó la clave; nunca se crea otro cobro.
 * - `transient`: cualquier otra cosa.
 */
export function mapPaymentIntent(
  input: PaymentIntentSnapshot | CollectionError | StripeErrorLike
): PaymentOutcome {
  if (isSnapshot(input)) return mapSnapshot(input);
  if (isCollectionError(input)) return mapCollectionError(input);
  return mapCollectionError(collectionErrorOf(input));
}

/** Igual que mapPaymentIntent para un error capturado de cualquier tipo. */
export function mapUnknownPaymentError(error: unknown): PaymentOutcome {
  if (typeof error !== "object" || error === null) return "transient";
  return mapPaymentIntent(error as StripeErrorLike);
}
