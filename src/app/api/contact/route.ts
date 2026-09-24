import { apiCreated, apiError } from "@/lib/api-response";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leadInteractions, leads } from "@/db/schema";
import { ContactRequestSchema } from "@/lib/growth/contracts";
import { recordGrowthEvent } from "@/lib/growth/events";
import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { withRateLimit } from "@/lib/rate-limit";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { escapeHtml } from "@/lib/email/escape-html";

/**
 * Sanitizes input by stripping all HTML tags to prevent XSS
 */
function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&[^;]*;/g, " ") // Remove HTML entities
    .trim();
}

// @auth-flexible route-guard-reason: public contact form endpoint
export const POST = withRateLimit(
  async (request: NextRequest) => {
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
      const {
        name,
        email,
        academy,
        reason,
        plan,
        source,
        message,
        honeypot,
        visitorId,
        submissionId,
      } = parsed.data;

      // Honeypot check - if filled, it's a bot
      if (honeypot) {
        // Silently succeed to not reveal the honeypot
        return apiCreated({ message: "Contact message sent successfully" });
      }

      const reasonLabels: Record<string, string> = {
        demo: "Solicitar demo",
        network: "Plan Network / multi-sede",
        sales: "Información de ventas",
        migracion: "Migrar datos o coordinar varias sedes",
        support: "Soporte técnico",
        billing: "Cobros",
        partnership: "Colaboración",
        other: "Otro",
      };
      const subject = academy
        ? `${reasonLabels[reason]} - ${academy}`
        : reasonLabels[reason];
      const sanitizedName = stripHtml(name);
      const sanitizedAcademy = academy ? stripHtml(academy) : null;
      const sanitizedMessage = stripHtml(message);
      const normalizedEmail = email.toLowerCase();

      await db
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
        .onConflictDoNothing({ target: leads.email });

      const [lead] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.email, normalizedEmail))
        .limit(1);
      if (!lead) return apiError("LEAD_PERSISTENCE_FAILED", "No se pudo registrar el contacto", 500);

      const [interaction] = await db
        .insert(leadInteractions)
        .values({
          leadId: lead.id,
          submissionId,
          name: sanitizedName,
          email: normalizedEmail,
          academy: sanitizedAcademy,
          reason,
          plan: plan ?? null,
          source,
          message: sanitizedMessage,
          visitorId,
        })
        .onConflictDoNothing({ target: leadInteractions.submissionId })
        .returning({ id: leadInteractions.id });

      await recordGrowthEvent({
        eventName: "contact_submitted",
        visitorId,
        planCode: plan ?? null,
        source,
        properties: { reason, has_academy_name: Boolean(sanitizedAcademy) },
        idempotencyKey: `contact:${submissionId}`,
      });

      // Send email notification
      try {
        await sendEmailWithLogging({
          to: "hola@zaltyko.com",
          subject: `[Zaltyko Contact] ${subject} - ${normalizedEmail}`,
          text: `Nombre: ${sanitizedName}\nEmail: ${normalizedEmail}\nAcademia: ${sanitizedAcademy ?? "No indicada"}\nPlan: ${plan ?? "No indicado"}\n\nMensaje:\n${sanitizedMessage}`,
          html: `<p><strong>Nombre:</strong> ${escapeHtml(sanitizedName)}</p>
<p><strong>Email:</strong> ${escapeHtml(normalizedEmail)}</p>
<p><strong>Academia:</strong> ${escapeHtml(sanitizedAcademy ?? "No indicada")}</p>
<p><strong>Plan:</strong> ${escapeHtml(plan ?? "No indicado")}</p>
<p><strong>Asunto:</strong> ${escapeHtml(subject)}</p>
<p><strong>Mensaje:</strong></p>
<p>${escapeHtml(sanitizedMessage).replace(/\n/g, "<br>")}</p>`,
          replyTo: normalizedEmail,
          template: "public-contact-lead",
          dedupeKey: `public-contact-lead:${submissionId}`,
        });
      } catch (emailError) {
        logger.warn("Failed to send contact email", { error: emailError });
        // Non-blocking - message is still considered sent
      }

      return apiCreated({
        leadId: lead.id,
        interactionId: interaction?.id ?? null,
        idempotent: !interaction,
        message: "Contact message sent successfully",
      });
    } catch (error) {
      logger.error("Error processing contact form:", error);
      return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    }
  },
  { limit: 5, window: 60 }
); // 5 requests per minute per IP
