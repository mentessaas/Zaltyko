/**
 * POST /api/stripe/connect/accounts-webhook
 *
 * Eventos *thin* v2 de las cuentas conectadas de las academias (Conectar
 * Stripe, Fase 1). Es distinto del webhook histórico
 * `/api/stripe/connect/webhook` (eventos v1) y usa su propio secreto,
 * `STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET`.
 *
 * El evento solo avisa: el servicio vuelve a leer la cuenta en Stripe y guarda
 * la proyección. Respuestas:
 * - 200 `{ received: true }` o `{ ignored: true }`;
 * - 400 sin firma o con firma inválida;
 * - 503 sin secreto configurado;
 * - 500 si Stripe o la base de datos fallan, para que Stripe reintente.
 * En los logs solo van ids y tipos de evento, nunca el cuerpo.
 */
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { isConnectOnboardingFlagEnabled } from "@/modules/payments-connect/application/config";
import { syncConnectAccountFromEvent } from "@/modules/payments-connect/application/connect-onboarding-service";
import {
  createStripeConnectGateway,
  type ConnectAccountsGateway,
} from "@/modules/payments-connect/infrastructure/stripe-connect-gateway";

export const dynamic = "force-dynamic";

/** Tipos que cambian el estado de la cuenta conectada que muestra Zaltyko. */
const HANDLED_EVENT_TYPES = new Set([
  "v2.core.account.updated",
  "v2.core.account.closed",
  "v2.core.account[requirements].updated",
  "v2.core.account[configuration.merchant].capability_status_updated",
]);

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

// @route-auth POST webhook
// @auth-flexible route-guard-reason: Stripe signs the thin v2 event; parseAccountEvent verifies the signature over the raw body with STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET before anything is processed.
export async function POST(request: Request) {
  // Con la bandera apagada no se procesa nada (ni se exige el secreto).
  if (!isConnectOnboardingFlagEnabled()) return json({ ignored: true });

  const secret = process.env.STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("Conectar Stripe: falta el secreto del webhook de cuentas conectadas");
    return json({ error: "WEBHOOK_NOT_CONFIGURED" }, 503);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ error: "SIGNATURE_VERIFICATION_FAILED" }, 400);

  // Cuerpo crudo: la firma se calcula sobre los bytes exactos.
  const rawBody = await request.text();

  let event: ReturnType<ConnectAccountsGateway["parseAccountEvent"]>;
  try {
    event = createStripeConnectGateway().parseAccountEvent(rawBody, signature, secret);
  } catch (error) {
    logger.warn("Conectar Stripe: firma del webhook no válida", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return json({ error: "SIGNATURE_VERIFICATION_FAILED" }, 400);
  }

  if (!HANDLED_EVENT_TYPES.has(event.type) || !event.accountId) {
    return json({ ignored: true });
  }

  try {
    const outcome = await syncConnectAccountFromEvent({
      eventId: event.eventId,
      accountId: event.accountId,
      livemode: event.livemode,
    });
    return outcome === "ignored" ? json({ ignored: true }) : json({ received: true });
  } catch (error) {
    logger.error("Conectar Stripe: no se pudo procesar el evento de la cuenta conectada", error, {
      eventId: event.eventId,
      eventType: event.type,
      accountId: event.accountId,
    });
    // Sin detalles internos en la respuesta; el 5xx basta para que Stripe reintente.
    return json({ error: "PROCESSING_FAILED" }, 500);
  }
}
