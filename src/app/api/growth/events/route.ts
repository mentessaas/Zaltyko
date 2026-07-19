import { apiCreated, apiError } from "@/lib/api-response";
import { PublicGrowthEventSchema } from "@/lib/growth/contracts";
import { recordGrowthEvent } from "@/lib/growth/events";
import { withRateLimit } from "@/lib/rate-limit";

// @route-auth public
export const POST = withRateLimit(
  async (request) => {
    const json = await request.json().catch(() => null);
    const parsed = PublicGrowthEventSchema.safeParse(json);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Evento comercial inválido", 400);
    }

    const event = parsed.data;
    await recordGrowthEvent({
      eventName: event.eventName,
      visitorId: event.visitorId,
      planCode: event.planCode ?? null,
      source: event.source,
      properties: event.properties,
      idempotencyKey: `public:${event.eventId}`,
    });

    return apiCreated({ accepted: true });
  },
  { limit: 30, window: 60 }
);
