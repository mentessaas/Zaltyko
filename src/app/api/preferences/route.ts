import { NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { emailLogs } from "@/db/schema";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";
import { verifyEmailLinkToken } from "@/lib/onboarding/email-link-token";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Ruta publica `/api/preferences` (ZAL-324 Gap 5). Complementa
 * `/api/unsubscribe`: el usuario puede revisar/actualizar sus preferencias
 * sin darse de baja completamente.
 *
 * - GET  /api/preferences?token=...  -> estado actual de preferencias.
 * - POST /api/preferences { token, prefs } -> actualiza y persiste en
 *   `email_logs` (template = `preferences_update`) para audit.
 *
 * v0.2 solo soporta dos switches:
 *   - `transactional` (boolean): emails operativos (cobros, recordatorios,
 *     magic links). RGPD Art. 6(1)(b) base legal: SIEMPRE necesarios para
 *     la prestacion del servicio; este flag es informativo (el caller
 *     puede ignorarlo si decide enviarlos igual).
 *   - `marketing` (boolean): emails comerciales / nurturing. RGPD
 *     Art. 6(1)(a) consentimiento: si se baja, NO se envian. Este es el
 *     unico flag que el sistema operativo respeta.
 *
 * Otros canales (SMS, WhatsApp) viven en otra issue.
 */

const prefsSchema = z.object({
  transactional: z.boolean(),
  marketing: z.boolean(),
});

const postSchema = z.object({
  token: z.string().min(20).max(512),
  prefs: prefsSchema,
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
  // v0.2: defaults seguros. v0.3+ deberia leer de una tabla `email_prefs`
  // por (tenant_id, email) o (profile_id) para recordar la eleccion entre
  // sesiones; abrir issue separada con Engineering Lead cuando se haga.
  return apiSuccess({
    email: result.payload.email,
    expiresAt: result.payload.expiresAt,
    current: {
      transactional: true,
      marketing: false,
    },
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
  if (result.payload.purpose !== "preferences") {
    return apiError(
      "WRONG_PURPOSE",
      "Este enlace no es de preferencias; usa /api/unsubscribe para baja",
      400
    );
  }

  const email = result.payload.email;
  const prefs = parsed.data.prefs;

  try {
    await db.insert(emailLogs).values({
      tenantId: null,
      academyId: null,
      userId: null,
      toEmail: email,
      subject: "Preferencias de email actualizadas",
      template: "preferences_update",
      status: "sent",
      sentAt: new Date(),
      metadata: {
        kind: "preferences",
        prefs,
        expiresAt: result.payload.expiresAt,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("preferences audit insert failed", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return apiSuccess({
    updated: true,
    email,
    prefs,
    updatedAt: new Date().toISOString(),
  });
}, { limit: RATE_LIMITS.STRICT.limit, window: RATE_LIMITS.STRICT.window });
