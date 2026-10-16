import { flag } from "@/lib/directory/contracts";
import { apiCreated, apiError } from "@/lib/api-response";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leadInteractions, leads } from "@/db/schema";
import {
  ContactRequestSchema,
  toContactAttributionProperties,
} from "@/lib/growth/contracts";
import { recordGrowthEvent } from "@/lib/growth/events";
import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import {
  getContactRateLimitIdentifier,
  withRateLimit,
} from "@/lib/rate-limit";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { escapeHtml } from "@/lib/email/escape-html";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import {
  academyWaitlistConsentVersion,
  requestSubscription,
} from "@/lib/directory/communications";

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
        attribution,
        message,
        marketingConsent,
        honeypot,
        visitorId,
        directoryEntryId,
        submissionId,
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
        network: "Plan Network / multi-sede",
        sales: "Información de ventas",
        migracion: "Migrar datos o coordinar varias sedes",
        support: "Soporte técnico",
        billing: "Cobros",
        partnership: "Colaboración",
        other: "Otro",
      };
      const subject = `Nueva solicitud · ${reasonLabels[reason]}`;
      const sanitizedName = stripHtml(name);
      const sanitizedAcademy = academy ? stripHtml(academy) : null;
      const sanitizedMessage = stripHtml(message);
      const normalizedEmail = email.toLowerCase();
      const attributionProperties = toContactAttributionProperties(attribution);

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
            ...(Object.keys(attributionProperties).length > 0
              ? { attribution: attributionProperties }
              : {}),
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

      if (source === "academy_waitlist" && marketingConsent) {
        try {
          await requestSubscription(
            {
              email: normalizedEmail,
              purpose: "marketing",
              consent: true,
              version: academyWaitlistConsentVersion,
              source: "academy_waitlist",
              filters: {},
            },
            null
          );
        } catch (subscriptionError) {
          logger.warn("Academy waitlist subscription could not be registered", {
            error:
              subscriptionError instanceof Error
                ? subscriptionError.message
                : "unknown",
          });
          return apiError(
            "WAITLIST_SUBSCRIPTION_UNAVAILABLE",
            "No se ha podido completar el alta de novedades. Inténtalo de nuevo en unos minutos.",
            503
          );
        }
      }

      await recordGrowthEvent({
        eventName: "contact_submitted",
        visitorId,
        planCode: plan ?? null,
        source,
        properties: {
          reason,
          has_academy_name: Boolean(sanitizedAcademy),
          marketing_opt_in: marketingConsent,
          ...attributionProperties,
          ...directoryAttribution,
        },
        idempotencyKey: `contact:${submissionId}`,
      });

      if (directoryEntry && reason === "demo") await recordGrowthEvent({
        eventName: "directory_demo_requested", visitorId, source:"directory",
        properties:directoryAttribution, idempotencyKey:`directory:demo:${submissionId}`,
      });

      // Send email notification
      try {
        const inboxUrl = new URL("/super-admin/growth", getPublicSiteUrl()).toString();
        await sendEmailWithLogging({
          to: "hola@zaltyko.com",
          subject: `[Zaltyko] ${subject}`,
          text: `Hay una nueva solicitud de contacto. Revísala en el panel comercial: ${inboxUrl}`,
          html: `<p>Hay una nueva solicitud de contacto.</p><p><a href="${escapeHtml(inboxUrl)}">Abrir solicitudes recientes en Zaltyko</a></p>`,
          replyTo: "hola@zaltyko.com",
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
        marketingSubscriptionRequestAccepted: marketingConsent,
        message: "Contact message sent successfully",
      });
    } catch (error) {
      logger.error("Error processing contact form:", error);
      return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    }
  },
  { identifier: getContactRateLimitIdentifier, limit: 5, window: 60 }
); // 5 requests/minute; academy waitlist uses a normalized email hash behind the proxy.
