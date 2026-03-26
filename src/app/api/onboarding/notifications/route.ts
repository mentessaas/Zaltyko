import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { profiles, userPreferences } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/notifications
 * Simplified notification preferences endpoint for onboarding flows.
 * Does NOT require tenant context — uses the authenticated user's profile directly.
 */
const NotificationsSchema = z.object({
  evaluations: z.boolean().optional(),
  attendance: z.boolean().optional(),
  events: z.boolean().optional(),
  billing: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = NotificationsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const notifications = parsed.data;

    // Look up user's profile to get their tenantId
    const [profile] = await db
      .select({ id: profiles.id, tenantId: profiles.tenantId })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    if (!profile) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    }

    // Build emailNotifications object from flat keys
    const emailNotifications: Record<string, boolean> = {};
    if (notifications.evaluations !== undefined) {
      emailNotifications.evaluations = notifications.evaluations;
    }
    if (notifications.attendance !== undefined) {
      emailNotifications.attendance = notifications.attendance;
    }
    if (notifications.events !== undefined) {
      emailNotifications.events = notifications.events;
    }
    if (notifications.billing !== undefined) {
      emailNotifications.billing = notifications.billing;
    }

    // Check if preferences exist
    const [existing] = await db
      .select({ id: userPreferences.id })
      .from(userPreferences)
      .where(eq(userPreferences.userId, profile.id))
      .limit(1);

    if (existing) {
      await db
        .update(userPreferences)
        .set({
          emailNotifications: {
            ...emailNotifications,
          },
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.id, existing.id));
    } else {
      await db.insert(userPreferences).values({
        userId: profile.id,
        tenantId: profile.tenantId,
        emailNotifications,
      } as any);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Error saving onboarding notifications", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
