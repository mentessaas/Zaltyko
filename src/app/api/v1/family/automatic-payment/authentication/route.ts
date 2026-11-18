/**
 * Cobro automático de cuotas (Fase 4, Tarea 5): la persona pagadora confirma
 * con su banco, desde /familia/cuotas, el cobro de tarjeta que espera su
 * confirmación. Es el mismo cobro en la cuenta de la academia: nunca otro.
 *
 * POST { action: "start", organizationId, invoiceId }
 *   → { clientSecret, connectedAccount, paymentMethodId } y nada más.
 * POST { action: "check", organizationId, invoiceId }
 *   → { state: "collected" | "processing" | "action_required" | "closed" },
 *   releído en Stripe por el mismo camino que los eventos.
 *
 * withFamilyUser comprueba la bandera del acceso de familias, el mismo origen,
 * la sesión y un límite por cuenta, y responde sin caché. El servicio exige
 * los cerrojos (bandera del cobro, bandera de eventos, clave de prueba, base
 * que no es la de producción y la forma "phase4"), que la cuenta sea la
 * persona pagadora vigente de esa cuota (404 si no) y el plazo (409).
 * La clave del cobro nunca va al registro; ante un error inesperado solo se
 * registran la acción, los ids y el nombre del error.
 */
import { ZodError, z } from "zod";

import { apiSuccess } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { readJson, withFamilyUser } from "@/app/api/v1/family-access-route-helpers";
import {
  checkFamilyAuthentication,
  startFamilyAuthentication,
} from "@/modules/family-collection/application/family-authentication-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

/** Cada acción lee Stripe: tan estricto como guardar el método de pago. */
const FAMILY_AUTHENTICATION_LIMIT = { limit: 10, window: 60 } as const;

const bodySchema = z
  .object({
    action: z.enum(["start", "check"]),
    organizationId: z.guid(),
    invoiceId: z.guid(),
  })
  .strict();

type Body = z.infer<typeof bodySchema>;

/** Error inesperado (Stripe o la base): solo ids en el registro y un mensaje sencillo. */
function unexpectedError(body: Body, error: unknown): OperationalError {
  logger.warn("Cobro automático: la familia no pudo confirmar o comprobar el pago", {
    action: body.action,
    organizationId: body.organizationId,
    invoiceId: body.invoiceId,
    errorName: error instanceof Error ? error.name : "unknown",
  });
  return body.action === "start"
    ? new OperationalError(
        "FAMILY_PAYMENT_CONFIRMATION_FAILED",
        "No se pudo preparar la confirmación del pago. Vuelve a intentarlo en un momento.",
        502
      )
    : new OperationalError(
        "FAMILY_PAYMENT_CHECK_FAILED",
        "Todavía no podemos comprobar el pago. Recarga la página en unos minutos.",
        502
      );
}

async function run(userId: string, body: Body) {
  const target = { userId, organizationId: body.organizationId, invoiceId: body.invoiceId };
  if (body.action === "start") {
    const result = await startFamilyAuthentication(target);
    // Solo lo que necesita el navegador para confirmar el mismo cobro.
    return apiSuccess({
      clientSecret: result.clientSecret,
      connectedAccount: result.connectedAccount,
      paymentMethodId: result.paymentMethodId,
    });
  }
  const result = await checkFamilyAuthentication(target);
  return apiSuccess({ state: result.state });
}

// @route-auth POST custom
// @auth-flexible route-guard-reason: withFamilyUser checks the family-access flag, same origin, the session user (getCurrentUser) and a per-account limit, and answers no-store; the family-authentication service then requires the collection and events flags, the test-environment and non-production-database locks and the phase4 storage, and only acts for the session user as the current payer of that invoice's family who is also the attempt's payer (guardian → family → family_payers), else 404.
export async function POST(request: Request) {
  return withFamilyUser(request, { mutation: true, limit: FAMILY_AUTHENTICATION_LIMIT }, async (userId) => {
    const body = bodySchema.parse(await readJson(request));
    try {
      return await run(userId, body);
    } catch (error) {
      if (error instanceof OperationalError || error instanceof ZodError) throw error;
      throw unexpectedError(body, error);
    }
  });
}
