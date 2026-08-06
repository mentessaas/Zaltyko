import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { getMessageTemplateById, incrementTemplateUsage } from "@/lib/communication-service";
import { isFeatureEnabled } from "@/lib/product/features";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";

export const dynamic = 'force-dynamic';

export const POST = withTenant(async (_request, context) => {
  if (!isFeatureEnabled("communicationTemplateUse")) {
    return apiError("FEATURE_DISABLED", "Uso de plantillas no disponible en esta versión", 404);
  }

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

  const updated = await incrementTemplateUsage(templateId);
  return apiSuccess({
    id: updated?.id ?? templateId,
    usageCount: updated?.usageCount ?? template.usageCount,
  });
});

export const PUT = POST;
