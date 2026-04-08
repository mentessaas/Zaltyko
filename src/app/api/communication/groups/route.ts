import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getMessageGroups, createMessageGroup } from "@/lib/communication-service";
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

const createGroupSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  recipientCount: z.number().int().min(0).default(0),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const groups = await getMessageGroups(context.tenantId);

  return apiSuccess({
    items: groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      recipientCount: g.recipientCount,
      createdAt: g.createdAt?.toISOString(),
    })),
    total: groups.length,
  });
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  try {
    const body = await request.json();
    const validated = createGroupSchema.parse(body);

    const group = await createMessageGroup({
      tenantId: context.tenantId,
      ...validated,
    });

    return apiCreated({
      id: group.id,
      name: group.name,
      description: group.description,
      recipientCount: group.recipientCount,
      createdAt: group.createdAt?.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }
    logger.error("Error creating group:", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});
