import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { formatPhoneForWhatsApp } from "@/lib/whatsapp";

const verifySchema = z
  .object({
    phone: z.string().trim().min(1, "Phone is required"),
    academyId: z.string().trim().min(1).optional(),
  })
  .strict();

const TWILIO_VERIFY_TIMEOUT_MS = 5000;
const credentialKeyPattern = /(?:^|[-_])api[-_]?key$/i;

function getCredentialInputKeys(request: Request, body: unknown): string[] {
  const bodyKeys =
    body && typeof body === "object" && !Array.isArray(body)
      ? Object.keys(body)
      : [];
  const queryKeys = Array.from(new URL(request.url).searchParams.keys());
  const headerKeys = Array.from(request.headers.keys());

  return [...bodyKeys, ...queryKeys, ...headerKeys].filter((key) =>
    credentialKeyPattern.test(key),
  );
}

export const POST = withTenant(async (request: Request, context) => {
  try {
    const rawBody = await request.json().catch(() => null);
    const credentialInputKeys = getCredentialInputKeys(request, rawBody);

    if (credentialInputKeys.length > 0) {
      logger.warn("WhatsApp verify rejected credential input", {
        credentialInputKeys,
      });
      return apiError(
        "VALIDATION_ERROR",
        "Las credenciales se configuran únicamente en el servidor",
        400,
      );
    }

    const parsed = verifySchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }

    const { phone, academyId } = parsed.data;
    let countryCode = "ES";
    if (academyId) {
      const [academy] = await db
        .select({ countryCode: academies.countryCode, country: academies.country })
        .from(academies)
        .where(and(eq(academies.id, academyId), eq(academies.tenantId, context.tenantId)))
        .limit(1);
      if (!academy) {
        return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
      }
      countryCode = academy.countryCode ?? academy.country ?? "ES";
    }
    const formattedPhone = formatPhoneForWhatsApp(phone, countryCode);
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    // Solo el entorno local/test puede simular. En producción una respuesta
    // exitosa sin contactar Twilio crea una falsa expectativa de entrega.
    if (!accountSid || !authToken) {
      if (process.env.NODE_ENV !== "production") {
        return apiSuccess({
          success: true,
          phone: formattedPhone,
          message: "WhatsApp verification simulated (Twilio not configured)",
        });
      }
      return apiError(
        "TWILIO_NOT_CONFIGURED",
        "WhatsApp no está configurado para esta instalación",
        503,
      );
    }

    const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TWILIO_VERIFY_TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
        {
          method: "GET",
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        return apiError(
          "TWILIO_CREDENTIALS_INVALID",
          "Credenciales de Twilio inválidas",
          401,
        );
      }

      return apiSuccess({
        success: true,
        phone: formattedPhone,
        message: "Conexión verificada exitosamente",
      });
    } catch (error) {
      logger.error("WhatsApp verify upstream error:", error);
      return apiError(
        "TWILIO_UPSTREAM_ERROR",
        "Error al verificar la conexión con Twilio",
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    logger.error("WhatsApp verify error:", error);
    return apiError("VERIFY_FAILED", "Error al verificar la conexión", 500);
  }
});
