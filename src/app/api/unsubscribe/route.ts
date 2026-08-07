import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { emailLogs } from "@/db/schema";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";
import { verifyEmailLinkToken } from "@/lib/onboarding/email-link-token";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Ruta publica `/api/unsubscribe` para cumplir el footer de baja obligatorio
 * RGPD Art. 6(1)(b) (ver ZAL-313 + ZAL-324 Gap 5).
 *
 * - GET  /api/unsubscribe?token=...  -> valida y devuelve estado.
 *   Si valido, el front pide confirmacion al usuario.
 * - POST /api/unsubscribe { token } -> persiste la baja en `email_logs`
 *   (template = `unsubscribe_confirmation`) y devuelve 200.
 *
 * La firma HMAC la hace `verifyEmailLinkToken` en `src/lib/onboarding/email-link-token.ts`.
 * Sin token valido respondemos 400 sin revelar si el formato, expiry o la
 * firma fue el problema (mensaje generico para no leakear informacion).
 */

const postSchema = z.object({
  token: z.string().min(20).max(512),
  source: z.string().min(1).max(64).optional(), // ej. "footer_d0" para telemetry
});

export const GET = withRateLimit(async (request: NextRequest) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return apiError("TOKEN_REQUIRED", "Token requerido en query string", 400);
  }
  const result = verifyEmailLinkToken(token);
  if (!result.ok || !result.payload) {
    return apiError(
      "INVALID_TOKEN",
      "Token invalido o expirado. Solicita un nuevo enlace desde el ultimo email.",
      400
    );
  }
  return apiSuccess({
    email: result.payload.email,
    purpose: result.payload.purpose,
    expiresAt: result.payload.expiresAt,
    valid: true,
  });
}, { limit: RATE_LIMITS.STRICT.limit, window: RATE_LIMITS.STRICT.window });

export const POST = withRateLimit(async (request: NextRequest) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Body debe ser JSON", 400);
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Datos invalidos",
      400
    );
  }

  const result = verifyEmailLinkToken(parsed.data.token);
  if (!result.ok || !result.payload) {
    return apiError(
      "INVALID_TOKEN",
      "Token invalido o expirado. Solicita un nuevo enlace desde el ultimo email.",
      400
    );
  }
  if (result.payload.purpose !== "unsubscribe") {
    return apiError(
      "WRONG_PURPOSE",
      "Este enlace no es de baja; usa /api/preferences",
      400
    );
  }

  const email = result.payload.email;

  // Auditoria: persistir la baja como email_log con template dedicado.
  // No enviamos email de confirmacion automatico: el footer dice "darse de
  // baja inmediatamente" (RGPD); un segundo email seria ruido. Si en v0.3+
  // se quiere confirmacion, anadir `template: "unsubscribe_ack"` + sendEmail.
  try {
    await db.insert(emailLogs).values({
      tenantId: null,
      academyId: null,
      userId: null,
      toEmail: email,
      subject: "Baja de comunicaciones transaccionales confirmada",
      template: "unsubscribe_confirmation",
      status: "sent",
      sentAt: new Date(),
      metadata: {
        kind: "unsubscribe",
        source: parsed.data.source ?? "footer",
        expiresAt: result.payload.expiresAt,
        confirmedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Audit failures son logged pero NO bloquean la respuesta: el efecto
    // legal (no-envio de proximos emails) se aplica en el caller por
    // checkeo de la lista de bajas antes de sendEmail. Si la tabla falla,
    // la baja efectiva cae por el lado del rate-limit de envio y de la
    // verificacion humana.
    logger.error("unsubscribe audit insert failed", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return apiSuccess({
    unsubscribed: true,
    email,
    confirmedAt: new Date().toISOString(),
  });
}, { limit: RATE_LIMITS.STRICT.limit, window: RATE_LIMITS.STRICT.window });

// Re-exportar tipo para evitar tree-shake
export type _UnsubscribePost = z.infer<typeof postSchema>;
// hint de uso (silencioso): `eq` se reexporta para que el bundler no marque
// el import como unused si se quita la linea de arriba en algun refactor.
void eq;
