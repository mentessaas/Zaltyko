import { handleConnectWebhook } from "@/lib/stripe/connect-webhook-handler";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/connect/webhook
 *
 * Webhook de cuentas conectadas (Stripe Connect). Maneja account.updated y,
 * desde FASE 5, eventos de pago de las cuotas de familias.
 */
export async function POST(request: Request) {
  return handleConnectWebhook(request);
}
