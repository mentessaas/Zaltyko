import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getMessageTemplateById, updateMessageTemplate, deleteMessageTemplate } from "@/lib/communication-service";
import { logger } from "@/lib/logger";
import { verifyAcademySportConfig } from "@/lib/sport-config/service";

export const dynamic = 'force-dynamic';

const canViewCommunication = (role?: string) =>
  ["owner", "admin", "coach", "super_admin"].includes(role ?? "");
const canManageCommunication = (role?: string) =>
  ["owner", "admin", "super_admin"].includes(role ?? "");

const updateTemplateSchema = z.object({
  academyId: z.string().uuid().optional(),
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
  if (!canViewCommunication(context.profile?.role)) {
    return apiError("FORBIDDEN", "No tienes permiso para consultar plantillas", 403);
  }
  const { templateId } = context.params as { templateId: string };

  const template = await getMessageTemplateById(templateId);

  if (!template) {
    return apiError("NOT_FOUND", "Template not found", 404);
  }

  if (template.tenantId !== context.tenantId) {
    return apiError("FORBIDDEN", "Access denied", 403);
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
  if (!canManageCommunication(context.profile?.role)) {
    return apiError("FORBIDDEN", "No tienes permiso para modificar plantillas", 403);
  }
  const { templateId } = context.params as { templateId: string };

  const existing = await getMessageTemplateById(templateId);

  if (!existing) {
    return apiError("NOT_FOUND", "Template not found", 404);
  }

  if (existing.tenantId !== context.tenantId) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  try {
    const body = await request.json();
    const validated = updateTemplateSchema.parse(body);
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
  if (!canManageCommunication(context.profile?.role)) {
    return apiError("FORBIDDEN", "No tienes permiso para eliminar plantillas", 403);
  }
  const { templateId } = context.params as { templateId: string };

  const existing = await getMessageTemplateById(templateId);

  if (!existing) {
    return apiError("NOT_FOUND", "Template not found", 404);
  }

  if (existing.tenantId !== context.tenantId) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

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
