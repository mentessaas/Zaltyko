import { flag } from "@/lib/directory/contracts";
import { apiCreated, apiError } from "@/lib/api-response";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leadInteractions, leads } from "@/db/schema";
import { ContactRequestSchema } from "@/lib/growth/contracts";
import { marketAccessEmailSummary, serializeMarketAccessMessage } from "@/lib/growth/market-access";
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

class ContactReplayConflict extends Error {}
class ContactPersistenceFailure extends Error {}

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
        directoryEntryId,
        submissionId,
        marketAccess,
      } = parsed.data;

      // Honeypot check - if filled, it's a bot
      if (honeypot) {
        // Silently succeed to not reveal the honeypot
        return apiCreated({ message: "Contact message sent successfully" });
      }

      const directoryEntry = directoryEntryId && flag("catalog") ? await (await import("@/lib/directory/service")).getEntry(directoryEntryId) : null;
      const directoryAttribution: Record<string,string> = directoryEntry ? {entry_id: directoryEntry.id, audience: "unknown"} : {};

      const reasonLabels: Record<string, string> = {
        demo: "Solicitar demo",
        network: "Varias sedes o academias",
        sales: "Información de ventas",
        migracion: "Migrar datos o coordinar varias sedes",
        support: "Soporte técnico",
        billing: "Cobros",
        partnership: "Colaboración",
        market_access: "Solicitud de acceso asistido por país",
        other: "Otro",
      };
      const subject = academy
        ? `${reasonLabels[reason]} - ${academy}`
        : reasonLabels[reason];
      const sanitizedName = stripHtml(name);
      const sanitizedAcademy = academy ? stripHtml(academy) : null;
      const sanitizedMessage = stripHtml(message);
      if (sanitizedName.length < 2 || sanitizedMessage.length < 10) {
        return apiError("VALIDATION_ERROR", "Indica un nombre y un mensaje válidos", 400);
      }
      const storedMessage = marketAccess
        ? serializeMarketAccessMessage(marketAccess, sanitizedMessage)
        : sanitizedMessage;
      if (storedMessage.length > 2_000) {
        return apiError("VALIDATION_ERROR", "Reduce el mensaje para guardar la solicitud completa", 400);
      }
      const emailMessage = marketAccess
        ? `${marketAccessEmailSummary(marketAccess)}\n\n${sanitizedMessage}`
        : sanitizedMessage;
      const normalizedEmail = email.toLowerCase();
      const normalizedSubmissionId = submissionId.toLowerCase();
      const normalizedVisitorId = visitorId.toLowerCase();
      const saved = await db.transaction(async (tx) => {
        // Serialize the command before any lead write, including conflicting replays.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${normalizedSubmissionId}, 0))`);
        const [previous] = await tx.select({
          id: leadInteractions.id, leadId: leadInteractions.leadId,
          name: leadInteractions.name, email: leadInteractions.email,
          academy: leadInteractions.academy, reason: leadInteractions.reason,
          plan: leadInteractions.plan, source: leadInteractions.source,
          message: leadInteractions.message, visitorId: leadInteractions.visitorId,
        }).from(leadInteractions).where(eq(leadInteractions.submissionId, normalizedSubmissionId)).limit(1);
        if (previous) {
          if (previous.name !== sanitizedName || previous.email !== normalizedEmail ||
            previous.academy !== sanitizedAcademy || previous.reason !== reason ||
            previous.plan !== (plan ?? null) || previous.source !== source ||
            previous.message !== storedMessage || previous.visitorId !== normalizedVisitorId) {
            throw new ContactReplayConflict();
          }
          return { leadId: previous.leadId, interactionId: previous.id, idempotent: true };
        }

        await tx.insert(leads).values({
          email: normalizedEmail, name: sanitizedName, source, plan: plan ?? null,
          metadata: JSON.stringify({
            reason, academy: sanitizedAcademy, message: sanitizedMessage,
            capturedAt: new Date().toISOString(), ...(marketAccess ? { marketAccess } : {}),
          }),
        }).onConflictDoNothing({ target: leads.email });
        const [lead] = await tx.select({ id: leads.id }).from(leads)
          .where(eq(leads.email, normalizedEmail)).limit(1);
        if (!lead) throw new ContactPersistenceFailure();
        const [interaction] = await tx.insert(leadInteractions).values({
          leadId: lead.id, submissionId: normalizedSubmissionId,
          name: sanitizedName, email: normalizedEmail, academy: sanitizedAcademy,
          reason, plan: plan ?? null, source, message: storedMessage, visitorId: normalizedVisitorId,
        }).onConflictDoNothing({ target: leadInteractions.submissionId }).returning({ id: leadInteractions.id });
        if (!interaction) throw new ContactPersistenceFailure();
        return { leadId: lead.id, interactionId: interaction.id, idempotent: false };
      });
      if (saved.idempotent) return apiCreated({ ...saved, message: "Contact message sent successfully" });

      await recordGrowthEvent({
        eventName: "contact_submitted",
        visitorId,
        planCode: plan ?? null,
        source,
        properties: { reason, has_academy_name: Boolean(sanitizedAcademy), ...directoryAttribution },
        idempotencyKey: `contact:${submissionId}`,
      });

      if (directoryEntry && reason === "demo") await recordGrowthEvent({
        eventName: "directory_demo_requested", visitorId, source:"directory",
        properties:directoryAttribution, idempotencyKey:`directory:demo:${submissionId}`,
      });

      // Send email notification
      try {
        if (process.env.ZALTYKO_DELIVERY_PREVIEW === "true") {
          // Delivery never falls back to the shared/global sender, including OFF,
          // unapproved actors and unavailable configuration. Contact stays public.
          const { sendDeliveryContactEmail } = await import("@/lib/email/delivery-contact-email");
          const result = await sendDeliveryContactEmail({
            name: sanitizedName, email: normalizedEmail, academy: sanitizedAcademy,
            reason, plan: plan ?? null, source, message: storedMessage,
            honeypot: honeypot ?? null, directoryEntryId: directoryEntryId?.toLowerCase() ?? null,
            marketAccess: marketAccess ?? null, submissionId: normalizedSubmissionId, visitorId: normalizedVisitorId,
          });
          logger.info("Delivery contact email outcome", result);
        } else {
          await sendEmailWithLogging({
            to: "hola@zaltyko.com",
            subject: `[Zaltyko Contact] ${subject} - ${normalizedEmail}`,
            text: `Nombre: ${sanitizedName}\nEmail: ${normalizedEmail}\nAcademia: ${sanitizedAcademy ?? "No indicada"}\nPlan: ${plan ?? "No indicado"}\n\nMensaje:\n${emailMessage}`,
            html: `<p><strong>Nombre:</strong> ${escapeHtml(sanitizedName)}</p>
<p><strong>Email:</strong> ${escapeHtml(normalizedEmail)}</p>
<p><strong>Academia:</strong> ${escapeHtml(sanitizedAcademy ?? "No indicada")}</p>
<p><strong>Plan:</strong> ${escapeHtml(plan ?? "No indicado")}</p>
<p><strong>Asunto:</strong> ${escapeHtml(subject)}</p>
<p><strong>Mensaje:</strong></p>
<p>${escapeHtml(emailMessage).replace(/\n/g, "<br>")}</p>`,
            replyTo: normalizedEmail,
            template: "public-contact-lead",
            dedupeKey: `public-contact-lead:${submissionId}`,
          });
        }
      } catch (emailError) {
        // Delivery diagnostics never serialize an Auth/provider error or request.
        logger.warn("Failed to send contact email", process.env.ZALTYKO_DELIVERY_PREVIEW === "true"
          ? { outcome: "unavailable" } : { error: emailError });
        // Non-blocking: the primary request is persisted, delivery is unconfirmed.
      }

      return apiCreated({
        ...saved,
        message: "Contact message sent successfully",
      });
    } catch (error) {
      if (error instanceof ContactReplayConflict) {
        return apiError("IDEMPOTENCY_CONFLICT", "Esta solicitud ya se utilizó con otros datos. Envía una solicitud nueva.", 409);
      }
      if (error instanceof ContactPersistenceFailure) {
        return apiError("LEAD_PERSISTENCE_FAILED", "No se pudo registrar el contacto", 500);
      }
      logger.error("Error processing contact form:", error);
      return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    }
  },
  { limit: 5, window: 60 }
); // 5 requests per minute per IP
