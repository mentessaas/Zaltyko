import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getMessageTemplates, createMessageTemplate } from "@/lib/communication-service";

export const dynamic = 'force-dynamic';

const createTemplateSchema = z.object({
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

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const templates = await getMessageTemplates(context.tenantId);

  return apiSuccess({
    items: templates.map((t) => ({
      id: t.id,
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

  try {
    const body = await request.json();
    const validated = createTemplateSchema.parse(body);

    const template = await createMessageTemplate({
      tenantId: context.tenantId,
      ...validated,
    });

    return apiCreated({
      id: template.id,
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
    console.error("Error creating template:", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});
