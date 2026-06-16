/**
 * GET /api/events - Lista eventos
 * POST /api/events - Crea evento
 *
 * La lógica de negocio está extraída en events.lib.ts para facilitar testing
 */
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { withPayloadValidation } from "@/lib/payload-validator";
import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";
import {
  CreateEventSchema,
  QuerySchema,
  createEvent,
  listEvents,
} from "./events.lib";

export const dynamic = "force-dynamic";

export const POST = withRateLimit(
  withPayloadValidation(
    withTenant(async (request, context) => {
      try {
        const body = CreateEventSchema.parse(await request.json());
        const result = await createEvent(body, {
          tenantId: context.tenantId,
          userId: context.userId,
          profile: context.profile,
        });

        if (result.error) return result.error;
        return apiCreated({ event: result.event });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return apiError("VALIDATION_ERROR", "Validation failed", 400);
        }
        return handleApiError(error, { endpoint: "/api/events", method: "POST" });
      }
    }),
    { maxSize: 512 * 1024 }
  ),
  { identifier: getUserIdentifier }
);

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));

    if (!parsed.success) {
      return apiError("INVALID_FILTERS", "Los filtros proporcionados no son válidos", 400);
    }

    const { page, limit, ...filters } = parsed.data;
    const { items, total } = await listEvents(filters, context.tenantId);

    return apiSuccess(
      { items },
      { total, page, pageSize: limit }
    );
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/events", method: "GET" });
  }
});
