import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getMessageTemplates, createMessageTemplate } from "@/lib/communication-service";
import { logger } from "@/lib/logger";
import { verifyAcademySportConfig } from "@/lib/sport-config/service";

export const dynamic = 'force-dynamic';

const canViewCommunication = (role?: string) =>
  ["owner", "admin", "coach", "super_admin"].includes(role ?? "");
const canManageCommunication = (role?: string) =>
  ["owner", "admin", "super_admin"].includes(role ?? "");

const createTemplateSchema = z.object({
  academyId: z.string().uuid().optional(),
  sportConfigId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  channel: z.enum(["whatsapp", "email", "push", "in_app"]).default("whatsapp"),
  templateType: z.string().min(1).max(100),
  subject: z.string().max(200).optional(),
  body: z.string().min(1),
  variables: z.array(z.string()).optional(),
  isSystem: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
  channel: z.enum(["whatsapp", "email", "push", "in_app"]).optional(),
  sportConfigId: z.string().uuid().optional(),
  includeGlobal: z.enum(["true", "false"]).optional().default("true"),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }
  if (!canViewCommunication(context.profile?.role)) {
    return apiError("FORBIDDEN", "No tienes permiso para consultar plantillas", 403);
  }

  const params = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!params.success) {
    return apiError("VALIDATION_ERROR", "Validation failed", 400);
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

  const templates = await getMessageTemplates(context.tenantId, {
    channel: params.data.channel,
    sportConfigId: params.data.sportConfigId,
    includeGlobal: params.data.includeGlobal !== "false",
  });

  return apiSuccess({
    items: templates.map((t) => ({
      id: t.id,
      sportConfigId: t.sportConfigId,
      name: t.name,
      description: t.description,
      channel: t.channel,
      templateType: t.templateType,
      subject: t.subject,
      body: t.body,
      variables: t.variables,
      isSystem: t.isSystem,
      isActive: t.isActive,
      usageCount: t.usageCount,
      createdAt: t.createdAt?.toISOString(),
      updatedAt: t.updatedAt?.toISOString(),
    })),
    total: templates.length,
  });
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }
  if (!canManageCommunication(context.profile?.role)) {
    return apiError("FORBIDDEN", "No tienes permiso para crear plantillas", 403);
  }

  try {
    const body = await request.json();
    const validated = createTemplateSchema.parse(body);
    const { academyId, sportConfigId, ...templateData } = validated;

    if (sportConfigId) {
      if (!academyId) {
        return apiError("ACADEMY_REQUIRED", "Academia requerida para validar la rama/modalidad", 400);
      }

      const verifiedConfig = await verifyAcademySportConfig({
        academyId,
        tenantId: context.tenantId,
        sportConfigId,
      });

      if (!verifiedConfig) {
        return apiError("SPORT_CONFIG_NOT_FOUND", "La rama/modalidad no está activa en esta academia", 400);
      }
    }

    const template = await createMessageTemplate({
      tenantId: context.tenantId,
      sportConfigId: sportConfigId ?? null,
      ...templateData,
    });

    return apiCreated({
      id: template.id,
      sportConfigId: template.sportConfigId,
      name: template.name,
      description: template.description,
      channel: template.channel,
      templateType: template.templateType,
      subject: template.subject,
      body: template.body,
      variables: template.variables,
      isSystem: template.isSystem,
      isActive: template.isActive,
      usageCount: template.usageCount,
      createdAt: template.createdAt?.toISOString(),
      updatedAt: template.updatedAt?.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }
    logger.error("Error creating template:", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});
