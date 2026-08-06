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
}).strict();

const DEFAULT_IN_APP = { enabled: true, types: {} };
const DEFAULT_CLASS_REMINDERS = { enabled: true, "24h_before": true, "1h_before": false };

export const GET = withTenant(async (_request, context) => {
  const [preferences] = await db
    .select({
      emailNotifications: userPreferences.emailNotifications,
      inAppNotifications: userPreferences.inAppNotifications,
      classReminders: userPreferences.classReminders,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, context.profile.id))
    .limit(1);

  return apiSuccess({
    preferences: {
      emailNotifications: preferences?.emailNotifications ?? {},
      inAppNotifications: preferences?.inAppNotifications ?? DEFAULT_IN_APP,
      classReminders: preferences?.classReminders ?? DEFAULT_CLASS_REMINDERS,
    },
  });
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
    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, profile.id))
      .limit(1);

    const emailNotifications = {
      ...(existing?.emailNotifications ?? {}),
      ...(validated.emailNotifications ?? {}),
    };
    const inAppNotifications = {
      ...(existing?.inAppNotifications ?? DEFAULT_IN_APP),
      ...(validated.inAppNotifications ?? {}),
      types: {
        ...(existing?.inAppNotifications?.types ?? {}),
        ...(validated.inAppNotifications?.types ?? {}),
      },
    };
    const classReminders = {
      ...(existing?.classReminders ?? DEFAULT_CLASS_REMINDERS),
      ...(validated.classReminders ?? {}),
    };

    if (!existing) {
      // Create new preferences
      await db.insert(userPreferences).values({
        userId: profile.id,
        tenantId: context.tenantId,
        emailNotifications,
        inAppNotifications,
        classReminders,
      });
    } else {
      await db
        .update(userPreferences)
        .set({
          emailNotifications,
          inAppNotifications,
          classReminders,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, profile.id));
    }

    return apiSuccess({ preferences: { emailNotifications, inAppNotifications, classReminders } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Preferencias inválidas", 400, error.flatten());
    }
    logger.error("Error updating preferences:", error);
    return apiError("INTERNAL_ERROR", "No se pudieron guardar las preferencias", 500);
  }
});
