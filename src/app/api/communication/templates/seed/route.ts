import { apiSuccess, apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { seedWhatsAppTemplates } from "@/lib/notifications/whatsapp-service";

export const dynamic = 'force-dynamic';

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  try {
    const templates = await seedWhatsAppTemplates(context.tenantId);

    return apiSuccess({
      ok: true,
      created: templates.length,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        templateType: t.templateType,
      })),
    });
  } catch (error) {
    console.error("Error seeding templates:", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});
