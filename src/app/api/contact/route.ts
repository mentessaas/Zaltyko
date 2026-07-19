import { apiCreated, apiError } from "@/lib/api-response";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { ContactRequestSchema } from "@/lib/growth/contracts";
import { recordGrowthEvent } from "@/lib/growth/events";
import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { withRateLimit } from "@/lib/rate-limit";

/**
 * Sanitizes input by stripping all HTML tags to prevent XSS
 */
function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&[^;]*;/g, " ") // Remove HTML entities
    .trim();
}

export const POST = withRateLimit(async (request: NextRequest) => {
  try {
    const json = await request.json().catch(() => null);
    const parsed = ContactRequestSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Datos de contacto inválidos",
        400
      );
    }
    const { name, email, academy, reason, plan, source, message, honeypot, visitorId, submissionId } =
      parsed.data;

    // Honeypot check - if filled, it's a bot
    if (honeypot) {
      // Silently succeed to not reveal the honeypot
      return apiCreated({ message: "Contact message sent successfully" });
    }

    const reasonLabels: Record<string, string> = {
      demo: "Solicitar demo",
      network: "Plan Network / multi-sede",
      sales: "Información de ventas",
      support: "Soporte técnico",
      billing: "Cobros",
      partnership: "Colaboración",
      other: "Otro",
    };
    const subject = academy ? `${reasonLabels[reason]} - ${academy}` : reasonLabels[reason];
    const sanitizedName = stripHtml(name);
    const sanitizedAcademy = academy ? stripHtml(academy) : null;
    const sanitizedMessage = stripHtml(message);
    const normalizedEmail = email.toLowerCase();

    const [lead] = await db
      .insert(leads)
      .values({
        email: normalizedEmail,
        name: sanitizedName,
        source,
        plan: plan ?? null,
        metadata: JSON.stringify({
          reason,
          academy: sanitizedAcademy,
          message: sanitizedMessage,
          capturedAt: new Date().toISOString(),
        }),
      })
      .onConflictDoUpdate({
        target: leads.email,
        set: {
          name: sanitizedName,
          source,
          plan: plan ?? null,
          metadata: JSON.stringify({
            reason,
            academy: sanitizedAcademy,
            message: sanitizedMessage,
            capturedAt: new Date().toISOString(),
          }),
        },
      })
      .returning({ id: leads.id });

    await recordGrowthEvent({
      eventName: "contact_submitted",
      visitorId: visitorId ?? null,
      planCode: plan ?? null,
      source,
      properties: { reason, has_academy_name: Boolean(sanitizedAcademy) },
      idempotencyKey: `contact:${submissionId}`,
    });

    // Send email notification
    try {
      const { sendEmail } = await import("@/lib/brevo");
      await sendEmail({
        to: "hola@zaltyko.com",
        subject: `[Zaltyko Contact] ${subject} - ${normalizedEmail}`,
        text: `Nombre: ${sanitizedName}\nEmail: ${normalizedEmail}\nAcademia: ${sanitizedAcademy ?? "No indicada"}\nPlan: ${plan ?? "No indicado"}\n\nMensaje:\n${sanitizedMessage}`,
        html: `<p><strong>Nombre:</strong> ${sanitizedName}</p>
<p><strong>Email:</strong> ${normalizedEmail}</p>
<p><strong>Academia:</strong> ${sanitizedAcademy ?? "No indicada"}</p>
<p><strong>Plan:</strong> ${plan ?? "No indicado"}</p>
<p><strong>Asunto:</strong> ${subject}</p>
<p><strong>Mensaje:</strong></p>
<p>${sanitizedMessage.replace(/\n/g, "<br>")}</p>`,
        replyTo: normalizedEmail,
      });
    } catch (emailError) {
      logger.warn("Failed to send contact email", { error: emailError });
      // Non-blocking - message is still considered sent
    }

    return apiCreated({ leadId: lead.id, message: "Contact message sent successfully" });
  } catch (error) {
    logger.error("Error processing contact form:", error);
    return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
  }
}, { limit: 5, window: 60 }); // 5 requests per minute per IP
