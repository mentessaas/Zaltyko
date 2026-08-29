import { z } from "zod";

import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { withTenant } from "@/lib/authz";

const verifySchema = z
  .object({
    phone: z.string().trim().min(1, "Phone is required"),
    academyId: z.string().trim().min(1).optional(),
  })
  .strict();

const TWILIO_VERIFY_TIMEOUT_MS = 5000;
const credentialKeyPattern = /(?:^|[-_])api[-_]?key$/i;

const formatPhoneForSpain = (phone: string) => {
  let formattedPhone = phone.replace(/\D/g, "");
  if (!formattedPhone.startsWith("34")) {
    formattedPhone = "34" + formattedPhone;
  }
  return formattedPhone;
};

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

export const POST = withTenant(async (request: Request) => {
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

    const { phone } = parsed.data;
    const formattedPhone = formatPhoneForSpain(phone);
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    // Mantener la paridad con send/route.ts en sandbox/local: sin credenciales
    // server-side no se contacta ningún proveedor y se devuelve una simulación.
    if (!accountSid || !authToken) {
      return apiSuccess({
        success: true,
        phone: formattedPhone,
        message: "WhatsApp verification simulated (Twilio not configured)",
      });
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
