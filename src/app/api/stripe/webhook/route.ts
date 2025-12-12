import { NextResponse } from "next/server";

import { handleStripeWebhook } from "@/lib/stripe/webhook-handler";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook
 * 
 * Endpoint para recibir webhooks de Stripe.
 * Maneja eventos de suscripciones, facturas y pagos.
 */
export async function POST(request: Request) {
  return handleStripeWebhook(request);
}
