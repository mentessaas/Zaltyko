import { recordGrowthEvent } from "@/lib/growth/events";
import { z } from "zod";
import { confirmSubscription } from "@/lib/directory/communications";
import { directoryFailure } from "@/lib/directory/auth";
import { apiSuccess, apiError } from "@/lib/api-response";
// @auth-flexible route-guard-reason: signed subscription action token; POST avoids automatic confirmation by link scanners.
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return apiError("INVALID_ORIGIN", "Origen no permitido", 403);
    const { id, token } = z
      .object({
        id: z.string().uuid(),
        token: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(await request.json());
    const result = await confirmSubscription(id, token);
    await recordGrowthEvent({
      eventName: "directory_subscription_confirmed",
      source: "directory",
      idempotencyKey: `directory:subscription:${id}`,
      properties: { purpose: String(result.purpose) },
    });
    return apiSuccess(result);
  } catch (e) {
    return directoryFailure(e);
  }
}
