import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { getMessageGroupById, updateMessageGroup, deleteMessageGroup } from "@/lib/communication-service";
import { logger } from "@/lib/logger";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";

export const dynamic = 'force-dynamic';

const updateGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  recipientCount: z.number().int().min(0).optional(),
});

export const GET = withTenant(async (request, context) => {
  const { groupId } = context.params as { groupId: string };

  const group = await getMessageGroupById(groupId);

  if (!group) {
    return apiError("NOT_FOUND", "Group not found", 404);
  }

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: group.tenantId ?? "",
    academyId: group.academyId ?? "",
    permission: "communications:read",
  });
  if (!scope.allowed) return apiError("NOT_FOUND", "Group not found", 404);

  return apiSuccess({
    id: group.id,
    name: group.name,
    description: group.description,
    recipientCount: group.recipientCount,
    createdAt: group.createdAt?.toISOString(),
  });
});

export const PATCH = withTenant(async (request, context) => {
  const { groupId } = context.params as { groupId: string };

  const existing = await getMessageGroupById(groupId);

  if (!existing) {
    return apiError("NOT_FOUND", "Group not found", 404);
  }

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: existing.tenantId ?? "",
    academyId: existing.academyId ?? "",
    permission: "communications:send",
  });
  if (!scope.allowed) return apiError("NOT_FOUND", "Group not found", 404);

  try {
    const body = await request.json();
    const validated = updateGroupSchema.parse(body);

    const group = await updateMessageGroup(groupId, validated);

    if (!group) {
      return apiError("NOT_FOUND", "Group not found", 404);
    }

    return apiSuccess({
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
    logger.error("Error updating group:", error);
    return apiError("INTERNAL_ERROR", "Internal server error", 500);
  }
});

export const DELETE = withTenant(async (request, context) => {
  const { groupId } = context.params as { groupId: string };

  const existing = await getMessageGroupById(groupId);

  if (!existing) {
    return apiError("NOT_FOUND", "Group not found", 404);
  }

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: existing.tenantId ?? "",
    academyId: existing.academyId ?? "",
    permission: "communications:templates",
  });
  if (!scope.allowed) return apiError("NOT_FOUND", "Group not found", 404);

  const deleted = await deleteMessageGroup(groupId);

  if (!deleted) {
    return apiError("NOT_FOUND", "Group not found", 404);
  }

  return apiSuccess({ ok: true });
});
