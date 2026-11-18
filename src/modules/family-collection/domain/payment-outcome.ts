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
 * `finalCreateErrorCode`: al CREAR el cobro, los rechazos de la petición
 * (400) dicen con seguridad que no se creó nada y que repetir no lo arreglará.
 *
 * Un cobro cancelado en Stripe sin ningún error de pago no es un rechazo del
 * banco: lo canceló Zaltyko, la academia o alguien desde el panel de Stripe.
 * Se cierra como `canceled_in_stripe`, sin aviso a la familia ni reintento.
 *
 * Un cobro hecho solo se registra si Stripe dice que se cobró exactamente el
 * importe del intento y en euros (`receivedMatches`).
 */
import { SUPPORTED_COLLECTION_CURRENCY } from "./collection-gate";

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
   * `amount_received`: lo que Stripe dice que se cobró, en céntimos. `null` si
   * no vino o no se puede leer: el importe es desconocido y un cobro hecho no
   * se registra (lo revisa la academia). Obligatorio para que quien construya
   * un snapshot no pueda olvidarlo y bloquear sin querer todos los registros.
   */
  amountReceivedCents: number | null;
  /** `currency` del cobro en mayúsculas (`EUR`); `null` si no vino. Obligatorio, como el importe. */
  currency: string | null;
  /**
   * Fase 4: id del intento de Zaltyko que lleva el cobro en su metadata
   * (`zaltyko_collection_attempt_id`), solo si es un uuid; `null` si no lo
   * lleva. Solo lo rellena la relectura de la pasarela (`retrievePayment`): lo
   * usa el evento de un cobro cuyo `pi_…` todavía no está guardado en ningún
   * intento. Opcional (no es un importe): sin él no se adopta ningún intento.
   */
  attemptIdFromMetadata?: string | null;
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

/**
 * Motivo (`failure_code`) del intento `canceled` cuyo cobro apareció cancelado
 * en Stripe sin ningún error de pago: lo canceló Zaltyko (al programar un
 * reintento, por la puerta o por un recordatorio ya enviado), la academia o
 * alguien desde el panel de Stripe. No es un fallo de la tarjeta: la familia
 * no recibe el aviso de cobro fallido y no hay reintento.
 */
export const CANCELED_IN_STRIPE_CODE = "canceled_in_stripe";

export type PaymentOutcome =
  | "succeeded"
  | "processing"
  /** Creado en Stripe y todavía sin confirmar. */
  | "requires_confirmation"
  | { failed: PaymentFailure }
  /** No se sabe el resultado: el intento se queda como está y se reanuda. */
  | "transient"
  /** Stripe rechazó la clave de idempotencia: nunca se crea otro cobro. */
  | "idempotency_conflict"
  /**
   * Cancelado en Stripe sin ningún error de pago (CANCELED_IN_STRIPE_CODE):
   * el banco no rechazó nada. El intento se cierra como `canceled`.
   */
  | typeof CANCELED_IN_STRIPE_CODE;

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

/**
 * ¿Cancelado en Stripe sin ningún error de pago? Ni el cobro guarda un último
 * error (`last_payment_error`) ni la llamada trajo un rechazo del banco
 * (`decline_code`). El código de la llamada (p. ej. confirmar un cobro ya
 * cancelado) no es un rechazo del banco y no cuenta.
 */
function canceledWithoutPaymentError(
  snapshot: PaymentIntentSnapshot,
  overrides?: { code: string | null; declineCode: string | null }
): boolean {
  return (
    snapshot.status === "canceled" &&
    codeOf(snapshot.lastErrorCode) === null &&
    codeOf(snapshot.lastDeclineCode) === null &&
    codeOf(overrides?.declineCode ?? null) === null
  );
}

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
      if (canceledWithoutPaymentError(snapshot, overrides)) return CANCELED_IN_STRIPE_CODE;
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
 * nada y que repetir no lo arreglará, venga con el estado HTTP que venga:
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
 * Además, cualquier petición rechazada (HTTP 400, `invalid_request_error`) es
 * final al crear, salvo los conflictos de idempotencia y los bloqueos, que se
 * arreglan esperando. Sin código, se cierra con INVALID_CREATE_REQUEST_CODE.
 * Revisión del coordinador (punto 1): el proceso diario ya no cierra los que
 * no están en FINAL_CREATE_CODES (isPlatformInvalidRequest): los deja
 * `claimed` y los reanuda otro día. Esta función solo los clasifica.
 */
const INVALID_REQUEST_ERROR_TYPES: ReadonlySet<string> = new Set([
  "invalid_request_error",
  "StripeInvalidRequestError",
]);
const RETRYABLE_REQUEST_CODES: ReadonlySet<string> = new Set([
  "idempotency_key_in_use",
  "idempotency_error",
  "lock_timeout",
  "rate_limit",
]);

/** Motivo de un rechazo de la petición al crear que no trae código. */
export const INVALID_CREATE_REQUEST_CODE = "invalid_request";

/** ¿Es un rechazo de la petición (HTTP 400, `invalid_request_error`) que no es de idempotencia? */
function isFinalInvalidRequest(error: object, code: string | null): boolean {
  const fields = error as { type?: unknown; rawType?: unknown; statusCode?: unknown };
  if (fields.statusCode !== 400) return false;
  const types = [fields.rawType, fields.type].filter((value): value is string => typeof value === "string");
  if (types.some((type) => IDEMPOTENCY_ERROR_TYPES.has(type))) return false;
  if (!types.some((type) => INVALID_REQUEST_ERROR_TYPES.has(type))) return false;
  return code === null || !RETRYABLE_REQUEST_CODES.has(code);
}

/**
 * Código con el que se cierra (`canceled`) un intento cuyo cobro Stripe se
 * negó a CREAR, o `null` si hay que tratarlo como pasajero. Solo para errores
 * de la creación y solo si el error no trae un cobro: con cobro, manda su
 * estado. Es final:
 * - uno de FINAL_CREATE_CODES;
 * - cualquier otro rechazo de la petición (HTTP 400, `invalid_request_error`)
 *   que no sea de idempotencia ni un bloqueo: con su código o, sin él,
 *   INVALID_CREATE_REQUEST_CODE.
 * Siguen siendo pasajeros los errores de red, límite de peticiones, error
 * interno de Stripe (5xx), bloqueos, idempotencia y los de autenticación o
 * permisos sin código (una mala configuración de la plataforma no debe
 * cancelar todas las cuotas). Solo se lee el código del error (`code`):
 * nunca el mensaje.
 */
export function finalCreateErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const attached = (error as { payment_intent?: unknown }).payment_intent;
  if (attached !== undefined && attached !== null) return null;
  const code = codeOf((error as { code?: unknown }).code)?.toLowerCase() ?? null;
  if (code !== null && FINAL_CREATE_CODES.has(code)) return code;
  if (isFinalInvalidRequest(error, code)) return code ?? INVALID_CREATE_REQUEST_CODE;
  return null;
}

/**
 * Fase 4 (D9, cortacircuitos): ¿es un rechazo de la petición de toda la
 * plataforma al CREAR el cobro? Es decir, `finalCreateErrorCode` lo da por
 * final (HTTP 400, `invalid_request_error`, sin cobro dentro, no es de
 * idempotencia, bloqueo ni límite de peticiones) y su código NO es de una
 * familia o una academia (FINAL_CREATE_CODES: `resource_missing`,
 * `amount_too_small`, `account_invalid`, `payment_method_unactivated`,
 * `capability_not_active`). Lo que queda (`parameter_missing`,
 * `parameter_invalid_integer`, sin código…) apunta a cómo Zaltyko pide el
 * cobro y se repetiría con todas las cuotas. Nunca cuentan los rechazos del
 * banco (`card_error`), los 5xx, la red ni nada con el cobro dentro.
 */
export function isPlatformInvalidRequest(error: unknown): boolean {
  const code = finalCreateErrorCode(error);
  return code !== null && !FINAL_CREATE_CODES.has(code);
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
 * - `canceled_in_stripe`: cancelado sin ningún error de pago (no es un
 *   rechazo del banco: el intento se cierra como `canceled`).
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
