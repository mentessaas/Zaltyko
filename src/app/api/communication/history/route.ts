import { z } from "zod";

import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { createMessageHistory, getMessageHistory } from "@/lib/communication-service";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademySportConfig } from "@/lib/sport-config/service";

export const dynamic = 'force-dynamic';

const canViewCommunication = (role?: string) =>
  ["owner", "admin", "coach", "super_admin"].includes(role ?? "");
const canManageCommunication = (role?: string) =>
  ["owner", "admin", "super_admin"].includes(role ?? "");

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
  channel: z.string().optional(),
  status: z.string().optional(),
  sportConfigId: z.string().uuid().optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional(),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional(),
});

const createHistorySchema = z.object({
  phone: z.string().optional().default(""),
  channel: z.string().optional().default("whatsapp"),
  direction: z.string().optional().default("outbound"),
  status: z.string().optional().default("pending"),
  message: z.string().optional(),
  body: z.string().optional(),
  templateId: z.string().uuid().optional().nullable(),
  sportConfigId: z.string().uuid().optional().nullable(),
  meta: z.record(z.unknown()).optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }
    if (!canViewCommunication(context.profile?.role)) {
      return apiError("FORBIDDEN", "No tienes permiso para consultar el historial de comunicación", 403);
    }

    const params = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!params.success) {
      return handleApiError(params.error);
    }

    if (params.data.sportConfigId && params.data.academyId) {
      const verifiedConfig = await verifyAcademySportConfig({
        academyId: params.data.academyId,
        tenantId: context.tenantId,
        sportConfigId: params.data.sportConfigId,
      });

      if (!verifiedConfig) {
        return apiError("SPORT_CONFIG_NOT_FOUND", "La rama/modalidad no está activa en esta academia", 400);
      }
    }

    const result = await getMessageHistory(context.tenantId, {
      channel: params.data.channel,
      status: params.data.status,
      sportConfigId: params.data.sportConfigId,
      limit: params.data.limit ?? 50,
      offset: params.data.offset ?? 0,
    });

    return apiSuccess({
      items: result.items.map((item) => ({
        id: item.id,
        templateId: item.templateId,
        sportConfigId: item.sportConfigId,
        channel: item.channel,
        direction: item.direction,
        status: item.status,
        body: item.message,
        phone: item.phone,
        meta: item.meta,
        sentAt: item.sentAt?.toISOString() ?? null,
        deliveredAt: item.deliveredAt?.toISOString() ?? null,
        failedAt: item.failedAt?.toISOString() ?? null,
        createdAt: item.createdAt?.toISOString() ?? new Date().toISOString(),
      })),
      total: result.total,
      limit: params.data.limit ?? 50,
      offset: params.data.offset ?? 0,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/communication/history", method: "GET" });
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }
    if (!canManageCommunication(context.profile?.role)) {
      return apiError("FORBIDDEN", "No tienes permiso para crear historial de comunicación", 403);
    }

    const body = createHistorySchema.parse(await request.json());
    const message = body.message ?? body.body;
    if (!message) {
      return apiError("MESSAGE_REQUIRED", "Mensaje requerido", 400);
    }

    const created = await createMessageHistory({
      tenantId: context.tenantId,
      phone: body.phone,
      channel: body.channel,
      direction: body.direction,
      status: body.status,
      message,
      templateId: body.templateId ?? null,
      sportConfigId: body.sportConfigId ?? null,
      meta: body.meta ?? null,
    });

    return apiCreated({ id: created.id });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/communication/history", method: "POST" });
  }
});
