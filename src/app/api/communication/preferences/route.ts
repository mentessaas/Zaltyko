import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getNotificationPreferences, updateNotificationPreferences, setDefaultNotificationPreferences } from "@/lib/communication-service";
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

const updatePreferencesSchema = z.object({
  channel: z.enum(["whatsapp", "email", "push", "in_app"]).optional(),
  enabled: z.boolean(),
});

export const GET = withTenant(async (request, context) => {
  const profile = context.profile;

  let preferences = await getNotificationPreferences(profile.id);

  // If no preferences exist, create defaults
  if (!preferences) {
    await setDefaultNotificationPreferences(profile.id);
    preferences = await getNotificationPreferences(profile.id);
  }

  return apiSuccess({
    preferences: preferences?.map((p) => ({
      id: p.id,
      channel: p.channel,
      enabled: p.enabled,
      updatedAt: p.updatedAt?.toISOString(),
    })) || [],
  });
});

export const PATCH = withTenant(async (request, context) => {
  const profile = context.profile;

  try {
    const body = await request.json();
    const validated = updatePreferencesSchema.parse(body);

    if (!validated.channel) {
      return apiError("CHANNEL_REQUIRED", "Channel is required", 400);
    }

    const updated = await updateNotificationPreferences(profile.id, {
      channel: validated.channel,
      enabled: validated.enabled,
    });

    return apiSuccess({
      id: updated?.id,
      channel: updated?.channel,
      enabled: updated?.enabled,
      updatedAt: updated?.updatedAt?.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }
    logger.error("Error updating preferences:", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});
