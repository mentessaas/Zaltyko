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
      return toSnapshot(paymentIntent);
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
  if (result.has_more) throw new Error("FAMILY_COLLECTION_TOO_MANY_PAYMENTS_FOR_ATTEMPT");
  return result.data
    .filter((paymentIntent) => hasMetadataAttempt(paymentIntent, input.attemptId))
    .map((paymentIntent) => toSnapshot(paymentIntent));
}
