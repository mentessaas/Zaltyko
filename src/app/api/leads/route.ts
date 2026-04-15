import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";
import { rateLimit, getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const handler = withRateLimit(async (req) => {
  try {
    const body = await req.json();
    const { email, name, source = "landing_page", plan } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError("INVALID_EMAIL", "Invalid email address", 400);
    }

    // Check if lead already exists
    const [existingLead] = await db
      .select()
      .from(leads)
      .where(eq(leads.email, email.toLowerCase()))
      .limit(1);

    if (existingLead) {
      // Update metadata if needed but don't error - treat as success
      return apiSuccess({ message: "Lead already registered", id: existingLead.id });
    }

    // Create new lead
    const [newLead] = await db
      .insert(leads)
      .values({
        email: email.toLowerCase(),
        name: name || null,
        source,
        plan: plan || null,
      })
      .returning();

    // Note: Brevo newsletter integration can be added later
    // For now, leads are stored in DB only

    return apiCreated({ id: newLead.id, message: "Lead captured successfully" });
  } catch (error) {
    logger.error("Error capturing lead:", error);
    return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
  }
});

export const POST = handler;
