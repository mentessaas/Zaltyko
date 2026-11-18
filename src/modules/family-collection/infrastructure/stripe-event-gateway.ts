/**
 * Cobro automático de cuotas (Fase 4): verificación de los eventos de Stripe
 * de las cuentas conectadas que llegan a /api/stripe/connect/payments-webhook.
 *
 * Son eventos completos v1 (no los *thin* v2 de la Fase 1), firmados con el
 * secreto propio de ese destino, STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET: nunca
 * con el secreto del webhook histórico ni con el de las cuentas. La firma se
 * comprueba sobre el cuerpo crudo con una tolerancia de 300 s; si no es
 * válida, el SDK lanza y el error se propaga.
 *
 * Del evento solo se devuelven `id`, `type`, `account`, `livemode`, `created`,
 * `data.object.id` y `data.object.object`. El resto del cuerpo (importes,
 * correos, nombres, datos de la tarjeta o del banco) se descarta aquí mismo y
 * nunca sale de esta función.
 */
import { getStripeClient } from "@/lib/stripe/client";
import type { ConnectedAccountEvent } from "@/modules/family-collection/domain/provider-event";

/** Tolerancia de la marca de tiempo de la firma, en segundos (la de Stripe por defecto). */
export const CONNECTED_ACCOUNT_EVENT_TOLERANCE_SECONDS = 300;

/** El cuerpo firmado no tiene la forma de un evento de Stripe. */
export const MALFORMED_CONNECTED_ACCOUNT_EVENT = "FAMILY_COLLECTION_MALFORMED_EVENT";

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

export function parseConnectedAccountEvent(
  rawBody: string,
  signature: string,
  secret: string
): ConnectedAccountEvent {
  const event: unknown = getStripeClient().webhooks.constructEvent(
    rawBody,
    signature,
    secret,
    CONNECTED_ACCOUNT_EVENT_TOLERANCE_SECONDS
  );
  const fields = (typeof event === "object" && event !== null ? event : {}) as {
    id?: unknown;
    type?: unknown;
    account?: unknown;
    livemode?: unknown;
    created?: unknown;
    data?: { object?: { id?: unknown; object?: unknown } | null } | null;
  };
  const eventId = text(fields.id);
  if (eventId === null) throw new Error(MALFORMED_CONNECTED_ACCOUNT_EVENT);
  const object = fields.data?.object ?? null;
  const account = text(fields.account);
  return {
    eventId,
    type: text(fields.type) ?? "",
    accountId: account !== null && account.startsWith("acct_") ? account : null,
    // Falla cerrado: solo `false` exacto es un evento de prueba.
    livemode: fields.livemode !== false,
    created: typeof fields.created === "number" && Number.isInteger(fields.created) ? fields.created : 0,
    objectId: text(object?.id),
    objectType: text(object?.object),
  };
}
