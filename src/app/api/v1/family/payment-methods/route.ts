/**
 * Pago automático de cuotas (cobro automático, Fase 2): la persona pagadora
 * de una familia guarda una tarjeta o una domiciliación en la cuenta Stripe
 * conectada de su academia, o deja de pagar automáticamente. No se cobra nada.
 *
 * POST { action: "setup", organizationId, familyId, kind, consentVersion, consentAccepted: true }
 *   → { clientSecret, connectedAccount } para el Payment Element.
 * POST { action: "complete", organizationId, familyId, setupIntentId }
 *   → { outcome: "active", method } | { outcome: "pending" }
 * POST { action: "revoke", organizationId, familyId } → { outcome: "revoked" | "none" }
 *
 * withFamilyUser comprueba la bandera del acceso de familias, el mismo origen,
 * la sesión y un límite por cuenta. Con la bandera de esta fase apagada solo
 * pasa «revoke» (quien ya guardó un método tiene que poder dejar de pagar
 * automáticamente); «setup» y «complete» responden 503 sin tocar la base ni
 * Stripe. El servicio resuelve la cadena de la persona pagadora y los
 * cerrojos de entorno y base, y recorta la IP y el agente antes de guardarlos.
 * Nunca se refleja la entrada ni un error del proveedor en la respuesta.
 */
import { ZodError, z } from "zod";

import { apiSuccess } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { readJson, withFamilyUser } from "@/app/api/v1/family-access-route-helpers";
import { isFamilyPaymentMethodsFlagEnabled } from "@/modules/family-payment-methods/application/config";
import {
  completeFamilyPaymentSetup,
  revokeFamilyPaymentMethod,
  startFamilyPaymentSetup,
} from "@/modules/family-payment-methods/application/family-payment-methods-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

/** Cada acción puede llamar a Stripe: más estricto que el resto del portal. */
const FAMILY_PAYMENT_METHODS_LIMIT = { limit: 10, window: 60 } as const;

const familyTarget = {
  organizationId: z.guid(),
  familyId: z.guid(),
};

const bodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("setup"),
      ...familyTarget,
      kind: z.enum(["card", "sepa_debit"]),
      // La versión vigente la comprueba el servicio (400 con código propio).
      consentVersion: z.string().min(1).max(64),
      consentAccepted: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("complete"),
      ...familyTarget,
      setupIntentId: z.string().max(255).regex(/^seti_[A-Za-z0-9]+$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("revoke"),
      ...familyTarget,
    })
    .strict(),
]);

type Body = z.infer<typeof bodySchema>;

function featureOff(): OperationalError {
  return new OperationalError("FEATURE_NOT_AVAILABLE", "El pago automático no está disponible ahora mismo.", 503);
}

/** Primera entrada de x-forwarded-for, o x-real-ip. El recorte lo hace el servicio. */
function clientIpFrom(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = request.headers.get("x-real-ip")?.trim();
  return real ? real : null;
}

function userAgentFrom(request: Request): string | null {
  return request.headers.get("user-agent") || null;
}

async function run(request: Request, userId: string, body: Body) {
  const target = { userId, organizationId: body.organizationId, familyId: body.familyId };
  switch (body.action) {
    case "setup": {
      const result = await startFamilyPaymentSetup({
        ...target,
        kind: body.kind,
        consentVersion: body.consentVersion,
        consentAccepted: body.consentAccepted,
        clientIp: clientIpFrom(request),
        userAgent: userAgentFrom(request),
      });
      // Solo lo que necesita el Payment Element; la referencia seti_ no sale.
      return apiSuccess({ clientSecret: result.clientSecret, connectedAccount: result.connectedAccount });
    }
    case "complete":
      return apiSuccess(await completeFamilyPaymentSetup({ ...target, setupIntentId: body.setupIntentId }));
    case "revoke":
      return apiSuccess(await revokeFamilyPaymentMethod(target));
  }
}

/** Error inesperado (Stripe o la base): solo ids en el log y un mensaje sencillo. */
function unexpectedError(body: Body, error: unknown): OperationalError {
  logger.warn("Pago automático de la familia: la acción no se pudo completar", {
    action: body.action,
    organizationId: body.organizationId,
    familyId: body.familyId,
    errorName: error instanceof Error ? error.name : "unknown",
  });
  if (body.action === "revoke") {
    return new OperationalError(
      "FAMILY_PAYMENT_REVOKE_FAILED",
      "No se pudo dejar de pagar automáticamente. Vuelve a intentarlo en un momento.",
      503
    );
  }
  return new OperationalError(
    "FAMILY_PAYMENT_SETUP_FAILED",
    "No se pudo guardar el método de pago. Vuelve a intentarlo.",
    502
  );
}

// @auth-flexible route-guard-reason: withFamilyUser checks the family-access flag, same origin, the session user (getCurrentUser) and a per-account limit; with this phase's flag off only the revoke action passes (setup and complete get 503 before any database or Stripe call), and the family-payment-methods service only acts for the session user as the open payer of that family in that academy (guardian → family → family_payers), behind the test-environment and non-production-database locks.
export async function POST(request: Request) {
  return withFamilyUser(request, { mutation: true, limit: FAMILY_PAYMENT_METHODS_LIMIT }, async (userId) => {
    const raw = await readJson(request);
    // Con la bandera apagada solo se puede dejar de pagar automáticamente.
    if (!isFamilyPaymentMethodsFlagEnabled() && raw?.action !== "revoke") throw featureOff();
    const body = bodySchema.parse(raw);
    try {
      return await run(request, userId, body);
    } catch (error) {
      if (error instanceof OperationalError || error instanceof ZodError) throw error;
      throw unexpectedError(body, error);
    }
  });
}
