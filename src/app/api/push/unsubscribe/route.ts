import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { unsubscribeUser, unsubscribeAllUser } from "@/lib/notifications/push-service";

export const dynamic = 'force-dynamic';

const unsubscribeSchema = z.object({
  endpoint: z.string().url().optional(),
  unsubscribeAll: z.boolean().optional(),
});

export const POST = withTenant(async (request, context) => {
  const profile = context.profile;

  if (!profile?.id) {
    return apiError("PROFILE_REQUIRED", "Profile is required", 400);
  }

  try {
    const body = await request.json();
    const validated = unsubscribeSchema.parse(body);

    if (validated.unsubscribeAll) {
      const deleted = await unsubscribeAllUser(profile.id);
      return apiSuccess({
        ok: true,
        count: deleted.length,
      });
    }

    if (!validated.endpoint) {
      return apiError("ENDPOINT_REQUIRED", "Endpoint is required", 400);
    }

    const deleted = await unsubscribeUser(profile.id, validated.endpoint);

    if (!deleted) {
      return apiError("NOT_FOUND", "Subscription not found", 404);
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }
    console.error("Error unsubscribing from push:", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});
