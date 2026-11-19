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
 * 3. sin firma o firma no válida → 400 `SIGNATURE_VERIFICATION_FAILED`; si
 *    la clave de prueba está en el entorno pero no se puede crear el cliente
 *    de Stripe → 503 `STRIPE_NOT_CONFIGURED` (Stripe reintenta; nunca se
 *    registra la clave). Sin STRIPE_SECRET_KEY en el entorno ya se ignora en
 *    el paso 1;
 * 4. evento de Live, de un tipo que no se escucha, sin cuenta conectada o
 *    con un objeto inesperado → 200 `{ ignored: true }`;
 * 5–7. almacenamiento, cuenta y buzón (handleFamilyCollectionEvent):
 *    sin las tablas de las Fases 1–4 → 503 `EVENTS_STORAGE_UNAVAILABLE`
 *    (con la bandera encendida el evento no se pierde: Stripe lo reenvía);
 *    200 `{ ignored: true }`, `{ duplicate: true }` (ya procesado) o
 *    `{ received: true }`; 503 `EVENT_IN_PROGRESS` si otra entrega lo está
 *    procesando (Stripe lo reenvía; pasados 5 minutos se vuelve a reclamar);
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
import {
  CONNECTED_ACCOUNT_EVENT_NOT_CONFIGURED,
  parseConnectedAccountEvent,
} from "@/modules/family-collection/infrastructure/stripe-event-gateway";

export const dynamic = "force-dynamic";

/** Segundos que se sugieren a Stripe antes de reenviar un evento en curso. */
const IN_PROGRESS_RETRY_AFTER_SECONDS = "60";

function json(body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
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
    if (error instanceof Error && error.message === CONNECTED_ACCOUNT_EVENT_NOT_CONFIGURED) {
      // Configuración del servidor, no la firma: 503 para que Stripe reintente.
      // Sin el valor de la clave ni el mensaje del error.
      logger.error("Cobro automático: falta la clave de Stripe para verificar los eventos de cobros", undefined, {
        stripeKeyConfigured: false,
      });
      return json({ error: "STRIPE_NOT_CONFIGURED" }, 503);
    }
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
    if (outcome === "in_progress") {
      // Desviación aprobada del brief: un evento en curso no se da por hecho
      // con un 200. Si la entrega que lo procesa se cae a mitad, Stripe lo
      // reenvía y, pasados 5 minutos, ese reenvío lo vuelve a reclamar.
      return json({ error: "EVENT_IN_PROGRESS" }, 503, { "retry-after": IN_PROGRESS_RETRY_AFTER_SECONDS });
    }
    if (outcome === "storage_unavailable") {
      // Revisión del coordinador (punto 2): con la bandera encendida y sin las
      // tablas de las Fases 1–4, un 200 perdería el evento. Con 503, Stripe lo
      // reenvía (durante días) hasta que el almacenamiento esté.
      logger.error("Cobro automático: evento de Stripe sin las tablas del cobro automático; se pide el reenvío", undefined, {
        eventId: event.eventId,
        eventType: event.type,
        accountId: event.accountId,
      });
      return json({ error: "EVENTS_STORAGE_UNAVAILABLE" }, 503);
    }
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
