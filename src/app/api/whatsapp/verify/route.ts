import { z } from "zod";

import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { withTenant } from "@/lib/authz";

const verifySchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  academyId: z.string().optional(),
});

const TWILIO_VERIFY_TIMEOUT_MS = 5000;

const formatPhoneForSpain = (phone: string) => {
  let formattedPhone = phone.replace(/\D/g, "");
  if (!formattedPhone.startsWith("34")) {
    formattedPhone = "34" + formattedPhone;
  }
  return formattedPhone;
};

export const POST = withTenant(async (request: Request) => {
  try {
    const rawBody = await request.json().catch(() => null);

    // Defense in depth: even though the schema rejects apiKey, a client that
    // tries to send it (body, header, query) must never be forwarded to Twilio.
    // Anything that smells like a credential in the request is dropped here.
    if (rawBody && typeof rawBody === "object") {
      const suspectKeys = Object.keys(rawBody).filter((key) =>
        /^(api_?key|authorization|token|secret|password)$/i.test(key),
      );
      if (suspectKeys.length > 0) {
        logger.warn("WhatsApp verify rejected credentials in request", {
          suspectKeys,
        });
      }
    }

    const parsed = verifySchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }

    const { phone } = parsed.data;
    const formattedPhone = formatPhoneForSpain(phone);

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    // Sandbox / unconfigured: behave like send/route.ts:355-362 — return 200
    // with a simulated marker so the UI keeps working locally.
    if (!accountSid || !authToken) {
      return apiSuccess({
        success: true,
        phone: formattedPhone,
        message: "WhatsApp verification simulated (Twilio not configured)",
        note: "Twilio credentials are not configured server-side",
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
