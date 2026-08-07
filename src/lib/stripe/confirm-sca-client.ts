import { loadStripe } from "@stripe/stripe-js";

/**
 * Payload que las rutas de cobro devuelven en el body 409 `REQUIRES_ACTION`
 * (`details`) cuando el banco exige SCA/3DS. El `clientSecret` tiene scope de un
 * solo PaymentIntent sobre la cuenta conectada de la academia — es el mismo
 * modelo ya usado para el alta de tarjeta (`/api/family/payment-method/setup-intent`).
 */
export interface ScaRecoveryDetails {
  paymentIntentId: string;
  clientSecret: string;
  stripeAccountId: string;
  publishableKey: string;
}

export function parseScaRecoveryDetails(details: unknown): ScaRecoveryDetails | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  if (
    typeof d.paymentIntentId === "string" &&
    typeof d.clientSecret === "string" &&
    typeof d.stripeAccountId === "string" &&
    typeof d.publishableKey === "string"
  ) {
    return d as unknown as ScaRecoveryDetails;
  }
  return null;
}

/**
 * Abre el reto 3DS de Stripe (modal) para el PaymentIntent pendiente y espera al
 * resultado. Devuelve `ok: true` si el pago quedó autenticado y confirmado.
 */
export async function confirmScaChallenge(
  details: ScaRecoveryDetails
): Promise<{ ok: true } | { ok: false; message: string }> {
  const stripe = await loadStripe(details.publishableKey, {
    stripeAccount: details.stripeAccountId,
  });
  if (!stripe) {
    return { ok: false, message: "No se pudo cargar Stripe para completar la autenticación." };
  }

  const { error, paymentIntent } = await stripe.confirmCardPayment(details.clientSecret);
  if (error) {
    return { ok: false, message: error.message ?? "No se pudo completar la autenticación." };
  }
  if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
    return { ok: true };
  }
  return { ok: false, message: "La autenticación no se completó. Inténtalo de nuevo." };
}
