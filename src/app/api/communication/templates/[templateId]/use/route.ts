import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { getMessageTemplateById, incrementTemplateUsage } from "@/lib/communication-service";
import { isFeatureEnabled } from "@/lib/product/features";

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

  if (template.tenantId !== context.tenantId) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  const updated = await incrementTemplateUsage(templateId);
  return apiSuccess({
    id: updated?.id ?? templateId,
    usageCount: updated?.usageCount ?? template.usageCount,
  });
});

export const PUT = POST;
