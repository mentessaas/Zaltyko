/**
 * GET /api/events - Lista eventos
 * POST /api/events - Crea evento
 *
 * La lógica de negocio está extraída en events.lib.ts para facilitar testing
 */
import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
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
        const scope = await authorizeAcademyCapability({
          context,
          resourceTenantId: context.tenantId,
          academyId: body.academyId,
          permission: "events:create",
        });
        if (!scope.allowed) {
          return apiError(scope.reason ?? "FORBIDDEN", "No tienes permiso para crear eventos en esta academia", 403);
        }
        const result = await createEvent(body, {
          tenantId: context.tenantId,
          userId: context.userId,
          profile: context.profile,
        });

        if (result.error) return result.error;
        return apiCreated({ event: result.event });
      } catch (error: unknown) {
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
    if (filters.academyId) {
      const scope = await authorizeAcademyCapability({
        context,
        resourceTenantId: context.tenantId,
        academyId: filters.academyId,
        permission: "events:read",
      });
      if (!scope.allowed) {
        return apiError("EVENT_NOT_FOUND", "No se encontraron eventos", 404);
      }
    }
    const { items, total } = await listEvents(filters, context.tenantId);

    return apiSuccess(
      { items },
      { total, page, pageSize: limit }
    );
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/events", method: "GET" });
  }
});
