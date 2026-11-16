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
  };
}

export function createStripeFamilyGateway(stripe?: Stripe): FamilyPaymentGateway {
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
  };
}
