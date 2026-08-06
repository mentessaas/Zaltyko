import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getMessageTemplateById, updateMessageTemplate, deleteMessageTemplate } from "@/lib/communication-service";
import { logger } from "@/lib/logger";
import { verifyAcademySportConfig } from "@/lib/sport-config/service";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";

export const dynamic = 'force-dynamic';

const updateTemplateSchema = z.object({
  sportConfigId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  channel: z.enum(["whatsapp", "email", "push", "in_app"]).optional(),
  templateType: z.string().min(1).max(100).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
  isSystem: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const GET = withTenant(async (request, context) => {
  const { templateId } = context.params as { templateId: string };

  const template = await getMessageTemplateById(templateId);

  if (!template) {
    return apiError("NOT_FOUND", "Template not found", 404);
  }

  if (template.academyId) {
    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: template.tenantId ?? "",
      academyId: template.academyId,
      permission: "communications:read",
    });
    if (!scope.allowed) return apiError("NOT_FOUND", "Template not found", 404);
  } else if (!template.isSystem || (template.tenantId && template.tenantId !== context.tenantId)) {
    return apiError("NOT_FOUND", "Template not found", 404);
  }

  return apiSuccess({
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
});

export const PATCH = withTenant(async (request, context) => {
  const { templateId } = context.params as { templateId: string };

  const existing = await getMessageTemplateById(templateId);

  if (!existing) {
    return apiError("NOT_FOUND", "Template not found", 404);
  }

  if (!existing.academyId) return apiError("SYSTEM_TEMPLATE_READ_ONLY", "System template is read-only", 403);
  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: existing.tenantId ?? "",
    academyId: existing.academyId,
    permission: "communications:send",
  });
  if (!scope.allowed) return apiError("NOT_FOUND", "Template not found", 404);

  try {
    const body = await request.json();
    const validated = updateTemplateSchema.parse(body);
    const { sportConfigId, ...templateData } = validated;

    if (sportConfigId) {
      const verifiedConfig = await verifyAcademySportConfig({
        academyId: existing.academyId,
        tenantId: context.tenantId,
        sportConfigId,
      });

      if (!verifiedConfig) {
        return apiError("SPORT_CONFIG_NOT_FOUND", "La rama/modalidad no está activa en esta academia", 400);
      }
    }

    const template = await updateMessageTemplate(templateId, {
      ...templateData,
      ...(sportConfigId !== undefined ? { sportConfigId } : {}),
    });

    if (!template) {
      return apiError("NOT_FOUND", "Template not found", 404);
    }

    return apiSuccess({
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
    logger.error("Error updating template:", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});

export const DELETE = withTenant(async (request, context) => {
  const { templateId } = context.params as { templateId: string };

  const existing = await getMessageTemplateById(templateId);

  if (!existing) {
    return apiError("NOT_FOUND", "Template not found", 404);
  }

  if (!existing.academyId) return apiError("SYSTEM_TEMPLATE_READ_ONLY", "System template is read-only", 403);
  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: existing.tenantId ?? "",
    academyId: existing.academyId,
    permission: "communications:templates",
  });
  if (!scope.allowed) return apiError("NOT_FOUND", "Template not found", 404);

  // Prevent deleting system templates
  if (existing.isSystem) {
    return apiError("CANNOT_DELETE_SYSTEM_TEMPLATE", "Cannot delete system template", 400);
  }

  const deleted = await deleteMessageTemplate(templateId);

  if (!deleted) {
    return apiError("NOT_FOUND", "Template not found", 404);
  }

  return apiSuccess({ ok: true });
});
