import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";

export const dynamic = 'force-dynamic';

const updatePreferencesSchema = z.object({
  emailNotifications: z.record(z.boolean()).optional(),
  inAppNotifications: z.object({
    enabled: z.boolean().optional(),
    types: z.record(z.boolean()).optional(),
  }).optional(),
  classReminders: z.object({
    enabled: z.boolean().optional(),
    "24h_before": z.boolean().optional(),
    "1h_before": z.boolean().optional(),
  }).optional(),
});

export const PATCH = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = context.profile;

  try {
    const body = await request.json();
    const validated = updatePreferencesSchema.parse(body);

    // Check if preferences exist
    const existing = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, profile.userId))
      .limit(1);

    if (existing.length === 0) {
      // Create new preferences
      await db.insert(userPreferences).values({
        userId: profile.userId,
        tenantId: context.tenantId,
        emailNotifications: validated.emailNotifications || {},
        inAppNotifications: validated.inAppNotifications || { enabled: true, types: {} },
        classReminders: validated.classReminders || { enabled: true, "24h_before": true, "1h_before": false },
      });
    } else {
      // Update existing preferences
      const updateData: Record<string, any> = {};

      if (validated.emailNotifications !== undefined) {
        updateData.emailNotifications = validated.emailNotifications;
      }
      if (validated.inAppNotifications !== undefined) {
        updateData.inAppNotifications = validated.inAppNotifications;
      }
      if (validated.classReminders !== undefined) {
        updateData.classReminders = validated.classReminders;
      }

      await db
        .update(userPreferences)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, profile.userId));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: error.errors }, { status: 400 });
    }
    console.error("Error updating preferences:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});
