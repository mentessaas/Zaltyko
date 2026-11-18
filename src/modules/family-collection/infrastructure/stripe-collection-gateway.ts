/**
 * Cobro automático de cuotas (Fase 3): adaptador fino sobre Stripe para
 * cobrar la factura mensual en la cuenta conectada de la academia.
 *
 * Todas las llamadas van con `stripeAccount` (cargo directo: el cobro vive en
 * la cuenta de la academia). Sin comisión de plataforma (`application_fee_*`),
 * sin `on_behalf_of` y sin `receipt_email`. Sin base de datos ni decisiones de
 * negocio: el dominio traduce el resultado (`mapPaymentIntent`) y el servicio
 * decide qué hacer.
 *
 * Crear y confirmar van por separado, cada uno con su clave de idempotencia
 * por factura e intento, para que una caída entre ambos pasos nunca produzca
 * un segundo cobro. Stripe solo admite `off_session` y `mandate` cuando se
 * confirma, así que se envían en la confirmación y no al crear.
 *
 * Solo se envían ids de Zaltyko en `metadata` y la descripción que da el
 * servicio («Cuota noviembre 2026»). Solo se devuelven referencias opacas
 * (`pi_…`) y códigos de Stripe (`code`, `decline_code`), nunca mensajes del
 * banco, datos de la tarjeta, IBAN ni nombres.
 */
import type Stripe from "stripe";

import { getStripeClient } from "@/lib/stripe/client";
import { SUPPORTED_COLLECTION_CURRENCY } from "@/modules/family-collection/domain/collection-gate";
import {
  collectionErrorOf,
  snapshotOfPaymentIntent,
  type CollectionError,
  type PaymentIntentSnapshot,
  type StripeErrorLike,
} from "@/modules/family-collection/domain/payment-outcome";
import { TOO_MANY_PAYMENTS_FOR_ATTEMPT_ERROR } from "@/modules/family-collection/domain/stripe-read-error";
import type { PaymentMethodKind } from "@/modules/family-payment-methods/domain/consent";

/** Moneda de las cuotas: `EUR` en la base, en minúsculas solo aquí. */
const STRIPE_CURRENCY = "eur";

/** Campo de metadata con el que se busca el cobro de un intento al reanudar. */
export const COLLECTION_ATTEMPT_METADATA_KEY = "zaltyko_collection_attempt_id";

export interface FamilyCollectionGateway {
  /**
   * Crea el cobro sin confirmarlo. Reintentar con la misma factura e intento
   * devuelve el mismo cobro mientras Stripe recuerde la clave (24 h); después,
   * el servicio usa el `pi_…` guardado o `findPaymentByAttempt`.
   */
  createPayment(input: {
    connectedAccount: string;
    attempt: { id: string; invoiceId: string; attemptNumber: number };
    amountCents: number;
    /** Moneda de la factura; solo `EUR` (la puerta ya lo exige). */
    currency: string;
    customer: string;
    paymentMethod: string;
    kind: PaymentMethodKind;
    organizationId: string;
    /** «Cuota {mes} {año}»; nunca la referencia interna de la factura. */
    description: string;
  }): Promise<PaymentIntentSnapshot>;
  /**
   * Confirma el cobro fuera de sesión. Un rechazo de la tarjeta (o que el
   * banco pida autenticación) no lanza: vuelve como `CollectionError`. Los
   * errores de red, de la API, de límite o de idempotencia sí se lanzan.
   */
  confirmPayment(input: {
    connectedAccount: string;
    paymentIntentId: string;
    attempt: { invoiceId: string; attemptNumber: number };
    /** Orden SEPA de la autorización; `null` con tarjeta. */
    mandate: string | null;
  }): Promise<PaymentIntentSnapshot | CollectionError>;
  /**
   * Relee el cobro en la cuenta de la academia. Además del snapshot, devuelve
   * `attemptIdFromMetadata` (Fase 4): el id del intento de la metadata, solo
   * si es un uuid.
   */
  retrievePayment(input: {
    connectedAccount: string;
    paymentIntentId: string;
  }): Promise<PaymentIntentSnapshot>;
  /**
   * Busca en la cuenta de la academia el cobro creado para un intento. La
   * búsqueda de Stripe tarda unos segundos en reflejar los cobros nuevos: solo
   * se usa al reanudar intentos de hace más de 15 minutos. Si aparece más de
   * un cobro para el mismo intento, lanza en lugar de elegir uno.
   */
  findPaymentByAttempt(input: {
    connectedAccount: string;
    attemptId: string;
  }): Promise<PaymentIntentSnapshot | null>;
  /** Cancela un cobro no terminado; si Stripe ya no lo deja, `not_cancelable`. */
  cancelPayment(input: {
    connectedAccount: string;
    paymentIntentId: string;
  }): Promise<"canceled" | "not_cancelable">;
}

/** Clave de creación: estable por factura e intento. */
export function familyCollectionCreateIdempotencyKey(invoiceId: string, attemptNumber: number): string {
  return `zaltyko-family-collection:${invoiceId}:${attemptNumber}:create`;
}

/** Clave de confirmación: estable por factura e intento, distinta de la de creación. */
export function familyCollectionConfirmIdempotencyKey(invoiceId: string, attemptNumber: number): string {
  return `zaltyko-family-collection:${invoiceId}:${attemptNumber}:confirm`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Consulta de búsqueda por intento. Solo se acepta un uuid: así el id nunca
 * puede romper las comillas de la consulta ni añadir otras condiciones.
 */
export function collectionAttemptSearchQuery(attemptId: string): string {
  if (!UUID_PATTERN.test(attemptId)) {
    throw new Error("FAMILY_COLLECTION_INVALID_ATTEMPT_ID");
  }
  return `metadata['${COLLECTION_ATTEMPT_METADATA_KEY}']:'${attemptId.toLowerCase()}'`;
}

/** Propiedades de un error del SDK que mira el adaptador, sin fiarse de su tipo. */
type SdkErrorFields = {
  type?: unknown;
  rawType?: unknown;
  code?: unknown;
  decline_code?: unknown;
  payment_intent?: unknown;
};

function asErrorLike(error: unknown): SdkErrorFields | null {
  return typeof error === "object" && error !== null ? (error as SdkErrorFields) : null;
}

/**
 * `true` si Stripe rechazó la clave de idempotencia (misma clave con otros
 * parámetros, o petición en curso con esa clave). Por propiedades, sin
 * depender de la clase concreta del SDK. El servicio nunca crea otro cobro
 * ante este error.
 */
export function isIdempotencyConflict(error: unknown): boolean {
  const candidate = asErrorLike(error);
  if (!candidate) return false;
  return candidate.type === "StripeIdempotencyError" || candidate.rawType === "idempotency_error";
}

/** Rechazo de la tarjeta o petición de autenticación del banco. */
function isCardError(error: unknown): boolean {
  const candidate = asErrorLike(error);
  if (!candidate) return false;
  return (
    candidate.type === "StripeCardError" ||
    candidate.rawType === "card_error" ||
    candidate.type === "card_error" ||
    candidate.code === "authentication_required"
  );
}

/** Snapshot de un cobro devuelto por Stripe; uno sin id o estado es un error. */
function toSnapshot(paymentIntent: Stripe.PaymentIntent): PaymentIntentSnapshot {
  const snapshot = snapshotOfPaymentIntent(paymentIntent);
  if (!snapshot) throw new Error("FAMILY_COLLECTION_INVALID_PAYMENT_INTENT");
  return snapshot;
}

/**
 * Id del intento guardado en la metadata del cobro
 * (COLLECTION_ATTEMPT_METADATA_KEY), en minúsculas, solo si es un uuid; si no, null.
 */
export function metadataAttemptId(paymentIntent: Pick<Stripe.PaymentIntent, "metadata">): string | null {
  const value = paymentIntent.metadata?.[COLLECTION_ATTEMPT_METADATA_KEY];
  return typeof value === "string" && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

function hasMetadataAttempt(paymentIntent: Stripe.PaymentIntent, attemptId: string): boolean {
  const value = paymentIntent.metadata?.[COLLECTION_ATTEMPT_METADATA_KEY];
  return typeof value === "string" && value.toLowerCase() === attemptId.toLowerCase();
}

export function createStripeCollectionGateway(stripe?: Stripe): FamilyCollectionGateway {
  // Se resuelve en cada llamada: crear el adaptador no exige la clave de Stripe.
  const client = (): Stripe => stripe ?? getStripeClient();

  return {
    async createPayment(input) {
      if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
        throw new Error("FAMILY_COLLECTION_INVALID_AMOUNT");
      }
      // Error de programación: la puerta ya deja fuera cualquier otra moneda.
      if (input.currency !== SUPPORTED_COLLECTION_CURRENCY) {
        throw new Error("FAMILY_COLLECTION_UNSUPPORTED_CURRENCY");
      }
      // El id del intento va en metadata y es lo que busca findPaymentByAttempt:
      // solo un uuid.
      if (!UUID_PATTERN.test(input.attempt.id)) {
        throw new Error("FAMILY_COLLECTION_INVALID_ATTEMPT_ID");
      }
      const params: Stripe.PaymentIntentCreateParams = {
        amount: input.amountCents,
        currency: STRIPE_CURRENCY,
        customer: input.customer,
        payment_method: input.paymentMethod,
        payment_method_types: [input.kind],
        confirm: false,
        description: input.description,
        metadata: {
          zaltyko_organization_id: input.organizationId,
          zaltyko_invoice_id: input.attempt.invoiceId,
          [COLLECTION_ATTEMPT_METADATA_KEY]: input.attempt.id,
        },
      };
      const paymentIntent = await client().paymentIntents.create(params, {
        stripeAccount: input.connectedAccount,
        idempotencyKey: familyCollectionCreateIdempotencyKey(
          input.attempt.invoiceId,
          input.attempt.attemptNumber
        ),
      });
      return toSnapshot(paymentIntent);
    },

    async confirmPayment(input) {
      const params: Stripe.PaymentIntentConfirmParams = { off_session: true };
      if (input.mandate) {
        params.mandate = input.mandate;
      }
      try {
        const paymentIntent = await client().paymentIntents.confirm(input.paymentIntentId, params, {
          stripeAccount: input.connectedAccount,
          idempotencyKey: familyCollectionConfirmIdempotencyKey(
            input.attempt.invoiceId,
            input.attempt.attemptNumber
          ),
        });
        return toSnapshot(paymentIntent);
      } catch (error) {
        const candidate = asErrorLike(error);
        if (candidate && isCardError(error)) {
          return collectionErrorOf(candidate as StripeErrorLike);
        }
        throw error;
      }
    },

    async retrievePayment(input) {
      const paymentIntent = await client().paymentIntents.retrieve(
        input.paymentIntentId,
        {},
        { stripeAccount: input.connectedAccount }
      );
      // Fase 4: el id del intento de la metadata, para el evento de un cobro
      // cuyo `pi_…` aún no está guardado. Nada más de la metadata.
      return { ...toSnapshot(paymentIntent), attemptIdFromMetadata: metadataAttemptId(paymentIntent) };
    },

    async findPaymentByAttempt(input) {
      const query = collectionAttemptSearchQuery(input.attemptId);
      const result = await client().paymentIntents.search(
        { query },
        { stripeAccount: input.connectedAccount }
      );
      const matches = result.data.filter((paymentIntent) =>
        hasMetadataAttempt(paymentIntent, input.attemptId)
      );
      if (matches.length === 0) return null;
      if (matches.length > 1) {
        // Nunca debería pasar (una creación por intento con su clave). Si pasa,
        // elegir uno podría llevar a confirmar el equivocado: que lo revise una persona.
        throw new Error("FAMILY_COLLECTION_MULTIPLE_PAYMENTS_FOR_ATTEMPT");
      }
      return toSnapshot(matches[0]);
    },

    async cancelPayment(input) {
      try {
        const paymentIntent = await client().paymentIntents.cancel(
          input.paymentIntentId,
          {},
          { stripeAccount: input.connectedAccount }
        );
        return paymentIntent.status === "canceled" ? "canceled" : "not_cancelable";
      } catch (error) {
        // Ya cobrado, en curso o ya cancelado: Stripe no deja cancelarlo.
        if (asErrorLike(error)?.code === "payment_intent_unexpected_state") {
          return "not_cancelable";
        }
        throw error;
      }
    },
  };
}

/** Como mucho estos cobros por intento en una búsqueda; con más, no se decide nada. */
const MAX_PAYMENTS_PER_ATTEMPT_SEARCH = 100;

/**
 * Todos los cobros que Stripe tiene con el id del intento en metadata (para
 * la revisión de la academia cuando hay varios). Solo referencias y estados.
 * Si Stripe dice que hay más de los que caben en una página, lanza: la
 * academia no puede dar por revisado lo que no se ha visto entero.
 */
export async function listCollectionPaymentsByAttempt(
  input: { connectedAccount: string; attemptId: string },
  stripe?: Stripe
): Promise<PaymentIntentSnapshot[]> {
  const client = stripe ?? getStripeClient();
  const result = await client.paymentIntents.search(
    { query: collectionAttemptSearchQuery(input.attemptId), limit: MAX_PAYMENTS_PER_ATTEMPT_SEARCH },
    { stripeAccount: input.connectedAccount }
  );
  if (result.has_more) throw new Error(TOO_MANY_PAYMENTS_FOR_ATTEMPT_ERROR);
  return result.data
    .filter((paymentIntent) => hasMetadataAttempt(paymentIntent, input.attemptId))
    .map((paymentIntent) => toSnapshot(paymentIntent));
}

/**
 * Fase 4 (Tarea 5): lo que necesita la familia para confirmar con su banco el
 * MISMO cobro (`confirmCardPayment` en el navegador). Se lee en Stripe en ese
 * momento, en la cuenta de la academia, y nunca se guarda ni se registra.
 */
export interface PaymentConfirmationSecret {
  /** `pi_…` que devolvió Stripe. */
  id: string;
  status: string;
  livemode: boolean;
  /** Id del intento de la metadata (uuid en minúsculas), o null. */
  attemptIdFromMetadata: string | null;
  /** `pm_…` que Stripe tiene en el cobro (o el del último error), o null. */
  paymentMethod: string | null;
  /** Clave del cobro para el navegador; null si Stripe no la da. */
  clientSecret: string | null;
}

function paymentMethodIdOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

/**
 * Relee el cobro en la cuenta conectada y devuelve su clave para el
 * navegador. Sin registro: el error de Stripe sigue hacia quien llama, que
 * solo registra su nombre.
 */
export async function retrievePaymentClientSecret(
  input: { connectedAccount: string; paymentIntentId: string },
  stripe?: Stripe
): Promise<PaymentConfirmationSecret> {
  const client = stripe ?? getStripeClient();
  const paymentIntent = await client.paymentIntents.retrieve(
    input.paymentIntentId,
    {},
    { stripeAccount: input.connectedAccount }
  );
  return {
    id: paymentIntent.id,
    status: paymentIntent.status,
    livemode: paymentIntent.livemode === true,
    attemptIdFromMetadata: metadataAttemptId(paymentIntent),
    paymentMethod:
      paymentMethodIdOf(paymentIntent.payment_method) ??
      paymentMethodIdOf(paymentIntent.last_payment_error?.payment_method),
    clientSecret: typeof paymentIntent.client_secret === "string" ? paymentIntent.client_secret : null,
  };
}

// ---------------------------------------------------------------------------
// Fase 4 (Tarea 6): devoluciones que la academia hizo desde su panel de Stripe
// ---------------------------------------------------------------------------

/** Una devolución de un cargo, tal como la da Stripe (solo lo que se usa). */
export interface ChargeRefundSnapshot {
  /** `re_…` (tarjeta) o `pyr_…` (domiciliación). */
  id: string;
  /** `pending`, `requires_action`, `succeeded`, `failed` o `canceled`. */
  status: string;
  amountCents: number;
  /** En mayúsculas (`EUR`), o null si Stripe no la da. */
  currency: string | null;
  /** Código del motivo de Stripe (`requested_by_customer`…), o null. */
  reasonCode: string | null;
  createdAt: Date;
}

export interface ChargeRefundsSnapshot {
  /** `ch_…` o `py_…`. */
  chargeId: string;
  /** `pi_…` del cargo, o null. */
  paymentIntentId: string | null;
  refunds: ChargeRefundSnapshot[];
}

/**
 * Lecturas de las devoluciones, siempre en la cuenta conectada y por id. El
 * evento es solo un aviso: todo lo que se anota sale de aquí.
 */
export interface FamilyCollectionRefundGateway {
  /** Relee el cargo (`ch_…`/`py_…`) y todas sus devoluciones. */
  retrieveChargeRefunds(input: { connectedAccount: string; chargeId: string }): Promise<ChargeRefundsSnapshot>;
  /** Relee una devolución (`re_…`/`pyr_…`) y devuelve el id de su cargo, o null. */
  retrieveRefundCharge(input: { connectedAccount: string; refundId: string }): Promise<string | null>;
  /**
   * Tarea 7: el último cargo de un cobro (`pi_…`) con todas sus devoluciones,
   * o null si el cobro todavía no tiene cargo. Lo usa el cobro tardío al
   * registrarse: las devoluciones que la academia hizo mientras esperaba no
   * se anotaron (el intento no estaba cobrado en el libro).
   */
  retrievePaymentIntentRefunds(input: {
    connectedAccount: string;
    paymentIntentId: string;
  }): Promise<ChargeRefundsSnapshot | null>;
}

/** Más devoluciones de un cargo de las que se leen: no se decide nada con una lista a medias. */
export const TOO_MANY_REFUNDS_FOR_CHARGE_ERROR = "FAMILY_COLLECTION_TOO_MANY_REFUNDS_FOR_CHARGE";
const MAX_REFUNDS_PER_CHARGE = 1000;

function objectIdOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

/** Solo campos con forma conocida; una devolución sin id o sin importe no se usa. */
function refundSnapshotOf(refund: Stripe.Refund): ChargeRefundSnapshot | null {
  if (typeof refund.id !== "string" || !Number.isSafeInteger(refund.amount) || refund.amount <= 0) return null;
  const created = typeof refund.created === "number" ? new Date(refund.created * 1000) : null;
  if (!created || Number.isNaN(created.getTime())) return null;
  return {
    id: refund.id,
    status: typeof refund.status === "string" ? refund.status : "unknown",
    amountCents: refund.amount,
    currency: typeof refund.currency === "string" ? refund.currency.toUpperCase() : null,
    reasonCode: typeof refund.reason === "string" ? refund.reason : null,
    createdAt: created,
  };
}

export function createStripeRefundGateway(stripe?: Stripe): FamilyCollectionRefundGateway {
  const client = (): Stripe => stripe ?? getStripeClient();
  const gateway: FamilyCollectionRefundGateway = {
    async retrieveChargeRefunds(input) {
      const options = { stripeAccount: input.connectedAccount };
      const charge = await client().charges.retrieve(input.chargeId, {}, options);
      const listed = await client()
        .refunds.list({ charge: input.chargeId, limit: 100 }, options)
        .autoPagingToArray({ limit: MAX_REFUNDS_PER_CHARGE + 1 });
      if (listed.length > MAX_REFUNDS_PER_CHARGE) throw new Error(TOO_MANY_REFUNDS_FOR_CHARGE_ERROR);
      return {
        chargeId: charge.id,
        paymentIntentId: objectIdOf(charge.payment_intent),
        refunds: listed.flatMap((refund) => {
          // Solo las de este cargo (la lista ya viene filtrada por él).
          if (objectIdOf(refund.charge) !== null && objectIdOf(refund.charge) !== charge.id) return [];
          const snapshot = refundSnapshotOf(refund);
          return snapshot ? [snapshot] : [];
        }),
      };
    },

    async retrieveRefundCharge(input) {
      const refund = await client().refunds.retrieve(input.refundId, {}, { stripeAccount: input.connectedAccount });
      return objectIdOf(refund.charge);
    },

    async retrievePaymentIntentRefunds(input) {
      const paymentIntent = await client().paymentIntents.retrieve(
        input.paymentIntentId,
        {},
        { stripeAccount: input.connectedAccount }
      );
      const chargeId = objectIdOf(paymentIntent.latest_charge);
      if (chargeId === null) return null;
      const snapshot = await gateway.retrieveChargeRefunds({ connectedAccount: input.connectedAccount, chargeId });
      // El cargo tiene que ser de ese cobro: si no, no se decide nada con él.
      return snapshot.paymentIntentId === input.paymentIntentId ? snapshot : null;
    },
  };
  return gateway;
}

// ---------------------------------------------------------------------------
// Fase 4 (Tarea 7): disputas de tarjeta y devoluciones del banco en domiciliación
// ---------------------------------------------------------------------------

/** Una disputa, releída por id en la cuenta conectada (solo lo que se usa). */
export interface DisputeSnapshot {
  /** `dp_…` o `du_…`. */
  id: string;
  /** `ch_…` (tarjeta) o `py_…` (domiciliación). */
  chargeId: string;
  /** `pi_…` del cargo, o null. */
  paymentIntentId: string | null;
  /** Estado de Stripe (`needs_response`, `lost`…), tal cual. */
  status: string;
  /** Código del motivo (`fraudulent`, `debit_not_authorized`…), o null. */
  reasonCode: string | null;
  amountCents: number;
  /** En mayúsculas (`EUR`), o null si Stripe no la da. */
  currency: string | null;
  /** Plazo para responder con pruebas, o null (domiciliación, ya cerrada…). */
  evidenceDueAt: Date | null;
  /** Stripe retiró el dinero de la cuenta de la academia y no lo ha devuelto (suma de sus movimientos < 0). */
  fundsWithdrawn: boolean;
  /** Forma de pago del cargo disputado; null si es otra o no se sabe. */
  paymentMethodKind: "card" | "sepa_debit" | null;
  /** Cuándo se abrió en Stripe. */
  createdAt: Date;
}

/** Lectura de las disputas, siempre en la cuenta conectada y por id. */
export interface FamilyCollectionDisputeGateway {
  /**
   * Relee la disputa y su cargo. null si Stripe la devuelve sin la forma que
   * se usa (sin cargo, sin importe…): no se decide nada con ella.
   */
  retrieveDispute(input: { connectedAccount: string; disputeId: string }): Promise<DisputeSnapshot | null>;
}

const REASON_CODE_PATTERN = /^[a-z0-9_]{1,64}$/;

function unixDateOrNull(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Forma de pago del cargo (`payment_method_details.type`), si el cargo vino expandido. */
function chargeKindOf(charge: unknown): "card" | "sepa_debit" | null {
  if (!charge || typeof charge !== "object") return null;
  const type = (charge as { payment_method_details?: { type?: unknown } | null }).payment_method_details?.type;
  return type === "card" || type === "sepa_debit" ? type : null;
}

/** ¿Suman menos de cero los movimientos de la disputa (dinero retirado y no devuelto)? */
function fundsWithdrawnOf(transactions: unknown): boolean {
  if (!Array.isArray(transactions)) return false;
  let total = 0;
  for (const transaction of transactions) {
    const amount = transaction && typeof transaction === "object" ? (transaction as { amount?: unknown }).amount : null;
    if (typeof amount === "number" && Number.isSafeInteger(amount)) total += amount;
  }
  return total < 0;
}

/** Solo campos con forma conocida; sin id, cargo, importe o fecha válidos, null. */
export function disputeSnapshotOf(dispute: Stripe.Dispute): DisputeSnapshot | null {
  const chargeId = objectIdOf(dispute.charge);
  const createdAt = unixDateOrNull(dispute.created);
  if (
    typeof dispute.id !== "string" ||
    chargeId === null ||
    !Number.isSafeInteger(dispute.amount) ||
    dispute.amount <= 0 ||
    createdAt === null
  ) {
    return null;
  }
  const charge = typeof dispute.charge === "object" ? dispute.charge : null;
  return {
    id: dispute.id,
    chargeId,
    paymentIntentId: objectIdOf(dispute.payment_intent) ?? objectIdOf(charge?.payment_intent ?? null),
    status: typeof dispute.status === "string" ? dispute.status : "unknown",
    reasonCode: typeof dispute.reason === "string" && REASON_CODE_PATTERN.test(dispute.reason) ? dispute.reason : null,
    amountCents: dispute.amount,
    currency: typeof dispute.currency === "string" ? dispute.currency.toUpperCase() : null,
    evidenceDueAt: unixDateOrNull(dispute.evidence_details?.due_by ?? null),
    fundsWithdrawn: fundsWithdrawnOf(dispute.balance_transactions),
    paymentMethodKind: chargeKindOf(charge),
    createdAt,
  };
}

export function createStripeDisputeGateway(stripe?: Stripe): FamilyCollectionDisputeGateway {
  const client = (): Stripe => stripe ?? getStripeClient();
  return {
    async retrieveDispute(input) {
      // El cargo expandido da la forma de pago y el `pi_…` en la misma lectura.
      const dispute = await client().disputes.retrieve(
        input.disputeId,
        { expand: ["charge"] },
        { stripeAccount: input.connectedAccount }
      );
      const snapshot = disputeSnapshotOf(dispute);
      return snapshot && snapshot.id === input.disputeId ? snapshot : null;
    },
  };
}
