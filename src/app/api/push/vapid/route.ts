import { apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { getVapidPublicKey, isPushConfigured } from "@/lib/notifications/push-service";

export const dynamic = 'force-dynamic';

export const GET = withTenant(async (request, context) => {
  if (!isPushConfigured()) {
    return apiSuccess({
      configured: false,
      publicKey: null,
      message: "Push notifications not configured",
    });
  }

  const publicKey = getVapidPublicKey();

  return apiSuccess({
    configured: true,
    publicKey,
  });
});
