import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { subscribeUser, getVapidPublicKey, isPushConfigured } from "@/lib/notifications/push-service";
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export const GET = withTenant(async () => {
  // Return VAPID public key for client subscription
  if (!isPushConfigured()) {
    return apiSuccess({
      configured: false,
      publicKey: null,
    });
  }

  return apiSuccess({
    configured: true,
    publicKey: getVapidPublicKey(),
  });
});

export const POST = withTenant(async (request, context) => {
  const profile = context.profile;

  if (!profile?.id) {
    return apiError("PROFILE_REQUIRED", "Profile is required", 400);
  }

  try {
    const body = await request.json();
    const validated = subscribeSchema.parse(body);

    const subscription = await subscribeUser(profile.id, {
      endpoint: validated.endpoint,
      p256dh: validated.keys.p256dh,
      auth: validated.keys.auth,
    });

    return apiSuccess({
      ok: true,
      id: subscription?.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }
    logger.error("Error subscribing to push:", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});
