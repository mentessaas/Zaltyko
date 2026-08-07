import { loadStripe } from "@stripe/stripe-js";

/**
 * Payload que las rutas de cobro devuelven en el body 409 `REQUIRES_ACTION`
 * (`details`) cuando el banco exige SCA/3DS. El `clientSecret` tiene scope de un
 * solo PaymentIntent sobre la cuenta conectada de la academia — es el mismo
 * modelo ya usado para el alta de tarjeta (`/api/family/payment-method/setup-intent`).
 *
 * `paymentMethodId` es la tarjeta guardada que el servicio usó al crear el PI.
 * Cuando Stripe lanza `authentication_required` deja el PI sin
 * `payment_method`; lo re-attachamos explícitamente en `confirmCardPayment`
 * porque, sin él, Stripe responde `payment_intent_unexpected_state`.
 */
export interface ScaRecoveryDetails {
  paymentIntentId: string;
  clientSecret: string;
  stripeAccountId: string;
  publishableKey: string;
  paymentMethodId?: string | null;
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

  // Helper: si Stripe dice que el PI no tiene PM, reintentamos una vez
  // adjuntando el `paymentMethodId` que viajaba en `details`. Esto cubre el
  // caso típico de SCA off-session: Stripe limpia el PM del PI y exige que el
  // cliente lo re-attach para abrir el reto.
  const tryConfirm = async (
    args: { payment_method?: string }
  ): Promise<{ error?: { message?: string; code?: string }; paymentIntent?: { status?: string } }> => {
    // La sobrecarga `(clientSecret, { payment_method })` está soportada por
    // stripe-js; casteamos para evitar fricciones con tipos sobrecargados.
    return (await (stripe as unknown as {
      confirmCardPayment: (
        clientSecret: string,
        data?: { payment_method?: string }
      ) => Promise<{ error?: { message?: string; code?: string }; paymentIntent?: { status?: string } }>;
    }).confirmCardPayment(details.clientSecret, args)) as {
      error?: { message?: string; code?: string };
      paymentIntent?: { status?: string };
    };
  };

  let result = await tryConfirm(
    details.paymentMethodId ? { payment_method: details.paymentMethodId } : {}
  );

  if (
    result.error?.code === "payment_intent_unexpected_state" &&
    details.paymentMethodId
  ) {
    // Segundo intento incluyendo el PM — path que abre el reto 3DS real.
    result = await tryConfirm({ payment_method: details.paymentMethodId });
  }

  if (result.error) {
    return { ok: false, message: result.error.message ?? "No se pudo completar la autenticación." };
  }
  if (result.paymentIntent?.status === "succeeded" || result.paymentIntent?.status === "processing") {
    return { ok: true };
  }
  return { ok: false, message: "La autenticación no se completó. Inténtalo de nuevo." };
}
