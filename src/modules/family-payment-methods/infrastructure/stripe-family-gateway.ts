/**
 * Pago automático de cuotas (cobro automático, Fase 2): adaptador fino sobre
 * Stripe en la cuenta conectada de la academia.
 *
 * Todas las llamadas van con `stripeAccount` (cargos directos: el cliente, la
 * preparación y el método viven en la cuenta de la academia, no en la de
 * Zaltyko). Sin base de datos ni decisiones de negocio: eso vive en el
 * dominio y en el servicio. En esta fase no se cobra nada.
 *
 * Solo se envían y se devuelven referencias opacas (cus_…, seti_…, pm_…,
 * mandate_…) e ids de Zaltyko en `metadata`. Nunca se manda a Stripe el
 * correo ni el nombre de la familia (el formulario de Stripe pide lo que la
 * domiciliación exige y lo guarda Stripe), y nunca se devuelve nada del
 * método de pago salvo su tipo.
 */
import type Stripe from "stripe";

import { getStripeClient } from "@/lib/stripe/client";
import type { PaymentMethodKind } from "@/modules/family-payment-methods/domain/consent";
import type { SetupIntentSnapshot } from "@/modules/family-payment-methods/domain/setup-verification";

export interface FamilyPaymentGateway {
  /**
   * Crea el cliente de la familia en la cuenta de la academia. La clave de
   * idempotencia la pasa el servicio (`familyCustomerIdempotencyKey`): los
   * parámetros dependen solo de ids, así que reintentar con la misma clave
   * devuelve el mismo cliente.
   */
  createCustomer(input: {
    connectedAccount: string;
    organizationId: string;
    familyPayerId: string;
    idempotencyKey: string;
  }): Promise<{ id: string }>;
  createSetupIntent(input: {
    connectedAccount: string;
    customer: string;
    kind: PaymentMethodKind;
    organizationId: string;
    familyPayerId: string;
    attemptId: string;
  }): Promise<{ id: string; clientSecret: string }>;
  retrieveSetupIntent(input: {
    connectedAccount: string;
    setupIntentId: string;
  }): Promise<SetupIntentSnapshot>;
  /** Desliga el método; si ya no existe o ya estaba desligado, no lanza. */
  detachPaymentMethod(input: { connectedAccount: string; paymentMethod: string }): Promise<void>;
}

/**
 * Fase 4 (Tarea 8): relecturas para los avisos de Stripe sobre el método de
 * pago. Aparte de FamilyPaymentGateway para no cambiar lo que ya usan las
 * Fases 2 y 3. Solo se leen ids y estados: nunca marca, dígitos, IBAN ni
 * titular.
 */
export interface FamilyPaymentMethodReads {
  /**
   * El método en la cuenta de la academia y el cliente al que está ligado
   * (`null` si ya no está ligado a ninguno). `null` si Stripe dice que el
   * método no existe (`resource_missing`). Cualquier otro error se lanza.
   */
  retrievePaymentMethod(input: {
    connectedAccount: string;
    paymentMethodId: string;
  }): Promise<{ id: string; customer: string | null } | null>;
  /**
   * La orden de domiciliación y su estado (`active`, `inactive`, `pending`).
   * `null` si Stripe dice que no existe. Cualquier otro error se lanza.
   */
  retrieveMandate(input: { connectedAccount: string; mandateId: string }): Promise<{ id: string; status: string } | null>;
}

export interface FamilyProviderReadFailure {
  /** Clase del error de Stripe o nombre del error; nunca su mensaje. */
  errorName: string;
  /** Código de Stripe (`resource_missing`…) o `null`. */
  errorCode: string | null;
  /**
   * `true` si reintentar no lo arregla: el objeto no existe
   * (`resource_missing`), la plataforma ya no tiene permiso sobre la cuenta
   * (`StripePermissionError`) o la cuenta ya no es válida (`account_invalid`).
   */
  permanent: boolean;
}

const PERMANENT_READ_CODES: ReadonlySet<string> = new Set(["resource_missing", "account_invalid"]);
const PERMANENT_READ_TYPES: ReadonlySet<string> = new Set(["StripePermissionError", "permission_error"]);
const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const ERROR_CODE_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

/** Qué error dio Stripe al leer, solo con nombre y código (sin mensaje). */
export function familyProviderReadFailureOf(error: unknown): FamilyProviderReadFailure {
  const fields =
    typeof error === "object" && error !== null
      ? (error as { type?: unknown; rawType?: unknown; code?: unknown })
      : {};
  const type = typeof fields.type === "string" && ERROR_NAME_PATTERN.test(fields.type) ? fields.type : null;
  const rawType = typeof fields.rawType === "string" ? fields.rawType : null;
  const code = typeof fields.code === "string" && ERROR_CODE_PATTERN.test(fields.code) ? fields.code : null;
  const name = type ?? (error instanceof Error && ERROR_NAME_PATTERN.test(error.name) ? error.name : "unknown");
  const permanent =
    (type !== null && PERMANENT_READ_TYPES.has(type)) ||
    (rawType !== null && PERMANENT_READ_TYPES.has(rawType)) ||
    (code !== null && PERMANENT_READ_CODES.has(code));
  return { errorName: name, errorCode: code, permanent };
}

function isResourceMissingError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "resource_missing";
}

/** Clave estable por cuenta conectada (fila local) y pagador. */
export function familyCustomerIdempotencyKey(
  providerAccountRowId: string,
  familyPayerId: string
): string {
  return `zaltyko-family-customer:${providerAccountRowId}:${familyPayerId}`;
}

/** Clave estable por intento: un doble clic devuelve la misma preparación. */
export function familySetupIntentIdempotencyKey(attemptId: string): string {
  return `zaltyko-family-setup:${attemptId}`;
}

/**
 * `true` si Stripe dice que el método ya no existe (`resource_missing`) o que
 * ya no está ligado a ningún cliente. Se comprueba por propiedades, sin
 * depender de la clase concreta del SDK.
 */
export function isAlreadyDetachedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { type?: unknown; rawType?: unknown; code?: unknown; message?: unknown };
  if (candidate.code === "resource_missing") return true;
  const isInvalidRequest =
    candidate.type === "StripeInvalidRequestError" || candidate.rawType === "invalid_request_error";
  return (
    isInvalidRequest &&
    typeof candidate.message === "string" &&
    /not attached to a customer/i.test(candidate.message)
  );
}

/** Un campo de Stripe puede venir como id o como objeto expandido. */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (value && typeof value.id === "string" && value.id.length > 0) return value.id;
  return null;
}

/** Del método expandido solo se lee el tipo; nada de marca, dígitos ni titular. */
function paymentMethodTypeOf(value: Stripe.SetupIntent["payment_method"]): string | null {
  if (value === null || typeof value === "string") return null;
  return typeof value.type === "string" && value.type.length > 0 ? value.type : null;
}

function toSnapshot(setupIntent: Stripe.SetupIntent): SetupIntentSnapshot {
  const attemptId = setupIntent.metadata?.zaltyko_setup_attempt_id;
  return {
    id: setupIntent.id,
    status: setupIntent.status,
    customer: idOf(setupIntent.customer),
    paymentMethod: idOf(setupIntent.payment_method),
    paymentMethodType: paymentMethodTypeOf(setupIntent.payment_method),
    mandate: idOf(setupIntent.mandate),
    metadataAttemptId: typeof attemptId === "string" && attemptId.length > 0 ? attemptId : null,
    // Solo si hay error; su contenido (códigos y mensajes del banco) no sale.
    hasLastSetupError: setupIntent.last_setup_error != null,
  };
}

export function createStripeFamilyGateway(stripe?: Stripe): FamilyPaymentGateway & FamilyPaymentMethodReads {
  // Se resuelve en cada llamada: crear el adaptador no exige la clave de Stripe.
  const client = (): Stripe => stripe ?? getStripeClient();

  return {
    async createCustomer(input) {
      const params: Stripe.CustomerCreateParams = {
        metadata: {
          zaltyko_organization_id: input.organizationId,
          zaltyko_family_payer_id: input.familyPayerId,
        },
      };
      const customer = await client().customers.create(params, {
        stripeAccount: input.connectedAccount,
        idempotencyKey: input.idempotencyKey,
      });
      return { id: customer.id };
    },

    async createSetupIntent(input) {
      const params: Stripe.SetupIntentCreateParams = {
        customer: input.customer,
        payment_method_types: [input.kind],
        usage: "off_session",
        metadata: {
          zaltyko_organization_id: input.organizationId,
          zaltyko_family_payer_id: input.familyPayerId,
          zaltyko_setup_attempt_id: input.attemptId,
        },
      };
      const setupIntent = await client().setupIntents.create(params, {
        stripeAccount: input.connectedAccount,
        idempotencyKey: familySetupIntentIdempotencyKey(input.attemptId),
      });
      if (!setupIntent.client_secret) {
        throw new Error("FAMILY_SETUP_INTENT_NO_CLIENT_SECRET");
      }
      return { id: setupIntent.id, clientSecret: setupIntent.client_secret };
    },

    async retrieveSetupIntent(input) {
      const setupIntent = await client().setupIntents.retrieve(
        input.setupIntentId,
        { expand: ["payment_method"] },
        { stripeAccount: input.connectedAccount }
      );
      return toSnapshot(setupIntent);
    },

    async detachPaymentMethod(input) {
      try {
        await client().paymentMethods.detach(
          input.paymentMethod,
          {},
          { stripeAccount: input.connectedAccount }
        );
      } catch (error) {
        if (isAlreadyDetachedError(error)) return;
        throw error;
      }
    },

    async retrievePaymentMethod(input) {
      let paymentMethod: Stripe.PaymentMethod;
      try {
        paymentMethod = await client().paymentMethods.retrieve(
          input.paymentMethodId,
          {},
          { stripeAccount: input.connectedAccount }
        );
      } catch (error) {
        if (isResourceMissingError(error)) return null;
        throw error;
      }
      // Solo el id y el cliente: nada de marca, dígitos, IBAN ni titular.
      return { id: paymentMethod.id, customer: idOf(paymentMethod.customer) };
    },

    async retrieveMandate(input) {
      let mandate: Stripe.Mandate;
      try {
        mandate = await client().mandates.retrieve(input.mandateId, {}, { stripeAccount: input.connectedAccount });
      } catch (error) {
        if (isResourceMissingError(error)) return null;
        throw error;
      }
      // Solo el id y el estado: nada del método ni de la aceptación (IP, agente).
      return { id: mandate.id, status: mandate.status };
    },
  };
}
