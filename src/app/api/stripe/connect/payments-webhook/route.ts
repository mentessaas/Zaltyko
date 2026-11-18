/**
 * POST /api/stripe/connect/payments-webhook
 *
 * Eventos completos v1 de las cuentas conectadas de las academias sobre los
 * cobros a familias (cobro automático de cuotas, Fase 4): cobros, devoluciones,
 * disputas, órdenes de domiciliación y métodos de pago. Es un destino propio,
 * distinto del webhook histórico `/api/stripe/connect/webhook` y del de las
 * cuentas (`/api/stripe/connect/accounts-webhook`), con su propio secreto,
 * `STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET`.
 *
 * El evento solo avisa: los manejadores vuelven a leer en Stripe lo que
 * necesitan. Orden:
 * 1. bandera apagada, clave que no es de prueba o base de producción →
 *    200 `{ ignored: true }` sin leer el cuerpo;
 * 2. sin secreto → 503 `WEBHOOK_NOT_CONFIGURED`;
 * 3. sin firma o firma no válida → 400 `SIGNATURE_VERIFICATION_FAILED`;
 * 4. evento de Live, de un tipo que no se escucha, sin cuenta conectada o
 *    con un objeto inesperado → 200 `{ ignored: true }`;
 * 5–7. almacenamiento, cuenta y buzón (handleFamilyCollectionEvent):
 *    200 `{ ignored: true }`, `{ duplicate: true }` o `{ received: true }`;
 * 8. si el manejador falla → 500 `PROCESSING_FAILED` (Stripe reintenta).
 * En el registro solo van `eventId`, `type`, `accountId` y el nombre o código
 * del error, nunca el cuerpo.
 */
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import {
  areFamilyCollectionEventsOpen,
  handleFamilyCollectionEvent,
} from "@/modules/family-collection/application/family-collection-events";
import {
  FAMILY_COLLECTION_EVENT_TYPES,
  providerEventErrorCode,
  routeProviderEvent,
  type ConnectedAccountEvent,
} from "@/modules/family-collection/domain/provider-event";
import { parseConnectedAccountEvent } from "@/modules/family-collection/infrastructure/stripe-event-gateway";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

// @route-auth POST webhook
// @auth-flexible route-guard-reason: Stripe signs the v1 connected-account event; parseConnectedAccountEvent verifies the signature over the raw body with STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET before anything is processed.
export async function POST(request: Request) {
  // Cerrojos (bandera, clave de prueba de Stripe, base que no es la de
  // producción). Se responde 200 y no 404 a propósito: con un 4xx/5xx Stripe
  // reintenta durante días, avisa de fallos y puede acabar desactivando el
  // destino, que hay que tener dado de alta antes de encender la bandera. Con
  // la bandera apagada lo que llega en ese tiempo no se ve en Zaltyko (deuda
  // documentada): Stripe permite reenviar los eventos de los últimos 30 días.
  if (!areFamilyCollectionEventsOpen()) return json({ ignored: true });

  const secret = process.env.STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("Cobro automático: falta el secreto del webhook de cobros de las cuentas conectadas");
    return json({ error: "WEBHOOK_NOT_CONFIGURED" }, 503);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ error: "SIGNATURE_VERIFICATION_FAILED" }, 400);

  // Cuerpo crudo: la firma se calcula sobre los bytes exactos.
  const rawBody = await request.text();

  let event: ConnectedAccountEvent;
  try {
    event = parseConnectedAccountEvent(rawBody, signature, secret);
  } catch (error) {
    logger.warn("Cobro automático: firma del webhook de cobros no válida", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return json({ error: "SIGNATURE_VERIFICATION_FAILED" }, 400);
  }

  if (
    event.livemode !== false ||
    !FAMILY_COLLECTION_EVENT_TYPES.has(event.type) ||
    !event.accountId ||
    routeProviderEvent(event).kind === "ignored"
  ) {
    return json({ ignored: true });
  }

  try {
    const outcome = await handleFamilyCollectionEvent(event);
    if (outcome === "duplicate") return json({ duplicate: true });
    if (outcome === "ignored") return json({ ignored: true });
    return json({ received: true });
  } catch (error) {
    logger.error("Cobro automático: no se pudo procesar un evento de Stripe", undefined, {
      eventId: event.eventId,
      eventType: event.type,
      accountId: event.accountId,
      errorName: error instanceof Error ? error.name : "unknown",
      errorCode: providerEventErrorCode(error),
    });
    // Sin detalles internos en la respuesta; el 5xx basta para que Stripe reintente.
    return json({ error: "PROCESSING_FAILED" }, 500);
  }
}
