import { apiCreated, apiError } from "@/lib/api-response";
import { withRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { logger } from "@/lib/logger";
import { LeadCaptureSchema } from "@/lib/growth/contracts";
import { recordGrowthEvent } from "@/lib/growth/events";

// @route-auth public
const handler = withRateLimit(async (req) => {
  try {
    const json = await req.json().catch(() => null);
    const parsed = LeadCaptureSchema.safeParse(json);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid lead data", 400);
    }
    const { email, name, source, plan, eventId, visitorId } = parsed.data;

    // Create new lead
    const [lead] = await db
      .insert(leads)
      .values({
        email: email.toLowerCase(),
        name: name || null,
        source,
        plan: plan || null,
      })
      .onConflictDoUpdate({
        target: leads.email,
        set: { name: name || null, source, plan: plan || null },
      })
      .returning();

    await recordGrowthEvent({
      eventName: "lead_captured",
      visitorId: visitorId ?? null,
      planCode: plan ?? null,
      source,
      idempotencyKey: eventId ? `lead:${eventId}` : `lead:${lead.id}`,
    });

    // Note: Brevo newsletter integration can be added later
    // For now, leads are stored in DB only

    return apiCreated({ id: lead.id, message: "Lead captured successfully" });
  } catch (error) {
    logger.error("Error capturing lead:", error);
    return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
  }
});

export const POST = handler;
