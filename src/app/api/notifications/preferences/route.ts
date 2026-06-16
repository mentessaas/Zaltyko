import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { logger } from "@/lib/logger";

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
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const profile = context.profile;

  try {
    const body = await request.json();
    const validated = updatePreferencesSchema.parse(body);

    // Check if preferences exist
    const existing = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, profile.id))
      .limit(1);

    if (existing.length === 0) {
      // Create new preferences
      await db.insert(userPreferences).values({
        userId: profile.id as any,
        tenantId: context.tenantId as any,
        emailNotifications: validated.emailNotifications || {},
        inAppNotifications: validated.inAppNotifications || { enabled: true, types: {} },
        classReminders: validated.classReminders || { enabled: true, "24h_before": true, "1h_before": false },
      } as any);
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
        .where(eq(userPreferences.userId, profile.id as any));
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }
    logger.error("Error updating preferences:", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});
